export const MAX_DOCUMENT_DIMENSION = 1920;
export const MAX_DOCUMENT_PIXELS = 2_000_000;

export interface ImportedDocumentDimensions {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  resized: boolean;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

export function readEncodedImageDimensions(
  buffer: ArrayBuffer,
  mimeType: string,
): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (mimeType === 'image/png' && bytes.length >= 24 && ascii(bytes, 1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const startOfFrame = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset++]!;
      if (marker === 0xd8 || marker === 0x01) continue;
      if (marker === 0xd9 || marker === 0xda || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (startOfFrame.has(marker) && length >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  if (
    mimeType === 'image/webp' &&
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') {
      return {
        width: uint24LittleEndian(bytes, 24) + 1,
        height: uint24LittleEndian(bytes, 27) + 1,
      };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
        height: 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10),
      };
    }
  }
  return null;
}

export function fitImportedDocument(width: number, height: number): ImportedDocumentDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('The selected image has invalid dimensions.');
  }
  const dimensionScale = MAX_DOCUMENT_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_DOCUMENT_PIXELS / (width * height));
  const scale = Math.min(1, dimensionScale, pixelScale);
  const nextWidth = Math.max(1, Math.floor(width * scale));
  const nextHeight = Math.max(1, Math.floor(height * scale));
  return {
    width: nextWidth,
    height: nextHeight,
    sourceWidth: width,
    sourceHeight: height,
    resized: nextWidth !== width || nextHeight !== height,
  };
}
