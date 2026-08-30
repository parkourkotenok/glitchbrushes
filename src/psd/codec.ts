import { initializeCanvas, readPsd, writePsdUint8Array } from 'ag-psd';
import type { BlendMode, Layer, Psd } from 'ag-psd';
import { MAX_DOCUMENT_DIMENSION, MAX_DOCUMENT_PIXELS } from '../documentImport';
import type { LayerBlendMode } from '../types';

// ag-psd asks for createImageData even in raw imageData mode. A tiny data-only canvas adapter
// avoids DOM canvas allocation in both the Web Worker and Node tests.
initializeCanvas(
  (width, height) =>
    ({
      width,
      height,
      getContext: () => ({
        createImageData: (imageWidth: number, imageHeight: number) => ({
          width: imageWidth,
          height: imageHeight,
          data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
        }),
      }),
    }) as unknown as HTMLCanvasElement,
);

export interface PsdRasterLayer {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  visible: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
}

export interface DecodedPsd {
  width: number;
  height: number;
  layers: PsdRasterLayer[];
}

export interface EncodedPsdInput extends DecodedPsd {
  composite: Uint8ClampedArray;
}

const fromPsdBlend = (mode?: BlendMode): LayerBlendMode => {
  if (mode === 'multiply' || mode === 'screen' || mode === 'overlay' || mode === 'difference') {
    return mode;
  }
  return 'source-over';
};

const toPsdBlend = (mode: LayerBlendMode): BlendMode => (mode === 'source-over' ? 'normal' : mode);

function readPsdHeaderDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  if (buffer.byteLength < 26) return null;
  const bytes = new Uint8Array(buffer, 0, 4);
  if (String.fromCharCode(...bytes) !== '8BPS') return null;
  const view = new DataView(buffer);
  if (view.getUint16(4) !== 1) return null;
  return { height: view.getUint32(14), width: view.getUint32(18) };
}

function assertPsdCanvasIsSafe(width: number, height: number): void {
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_DOCUMENT_DIMENSION ||
    height > MAX_DOCUMENT_DIMENSION ||
    width * height > MAX_DOCUMENT_PIXELS
  ) {
    throw new Error(
      `PSD canvas exceeds the ${MAX_DOCUMENT_DIMENSION}px / ${MAX_DOCUMENT_PIXELS} pixel editing limit.`,
    );
  }
}

export function decodePsdBytes(buffer: ArrayBuffer): DecodedPsd {
  // ag-psd allocates decoded layer buffers while parsing. Reject an oversized canvas from the
  // fixed 26-byte PSD header before the decoder can allocate hundreds of megabytes.
  const header = readPsdHeaderDimensions(buffer);
  if (header) assertPsdCanvasIsSafe(header.width, header.height);
  const psd = readPsd(buffer, {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    logMissingFeatures: false,
  });
  assertPsdCanvasIsSafe(psd.width, psd.height);
  const topToBottom: PsdRasterLayer[] = [];
  const visit = (children: Layer[] | undefined, prefix = '', parentHidden = false) => {
    for (const child of children ?? []) {
      const name = child.name?.trim() || 'Layer';
      const path = prefix ? `${prefix} / ${name}` : name;
      if (child.children?.length) {
        visit(child.children, path, parentHidden || Boolean(child.hidden));
        continue;
      }
      const image = child.imageData;
      if (
        !image ||
        !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)
      ) {
        continue;
      }
      const width = image.width;
      const height = image.height;
      if (width <= 0 || height <= 0 || image.data.length !== width * height * 4) continue;
      topToBottom.push({
        name: path,
        x: child.left ?? 0,
        y: child.top ?? 0,
        width,
        height,
        pixels: new Uint8ClampedArray(image.data),
        visible: !parentHidden && !child.hidden,
        opacity: Math.max(0, Math.min(1, child.opacity ?? 1)),
        blendMode: fromPsdBlend(child.blendMode),
      });
    }
  };
  visit(psd.children);
  if (!topToBottom.length) {
    throw new Error('PSD contains no rasterized layer pixels that Glitch Brushes can import.');
  }
  return { width: psd.width, height: psd.height, layers: topToBottom.reverse() };
}

export function encodePsdBytes(input: EncodedPsdInput): Uint8Array {
  if (input.composite.length !== input.width * input.height * 4) {
    throw new Error('PSD composite dimensions are invalid.');
  }
  const children: Layer[] = [...input.layers].reverse().map((layer) => ({
    name: layer.name,
    left: layer.x,
    top: layer.y,
    right: layer.x + layer.width,
    bottom: layer.y + layer.height,
    hidden: !layer.visible,
    opacity: Math.max(0, Math.min(1, layer.opacity)),
    blendMode: toPsdBlend(layer.blendMode),
    imageData: { width: layer.width, height: layer.height, data: layer.pixels },
  }));
  const psd: Psd = {
    width: input.width,
    height: input.height,
    children,
    imageData: { width: input.width, height: input.height, data: input.composite },
  };
  return writePsdUint8Array(psd, {
    generateThumbnail: false,
    trimImageData: false,
    noBackground: true,
    compress: false,
    logMissingFeatures: false,
  });
}
