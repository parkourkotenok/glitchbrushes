export async function resizeLayerOffThread(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8ClampedArray> {
  const worker = new Worker(new URL('../workers/layerTransform.worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; pixels?: ArrayBuffer; error?: string }>,
    ) => {
      worker.terminate();
      if (!event.data.ok || !event.data.pixels)
        reject(new Error(event.data.error ?? 'Resize failed.'));
      else resolve(new Uint8ClampedArray(event.data.pixels));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Layer transform worker failed.'));
    };
    const transferable = pixels.buffer.slice(
      pixels.byteOffset,
      pixels.byteOffset + pixels.byteLength,
    ) as ArrayBuffer;
    worker.postMessage(
      { pixels: transferable, sourceWidth, sourceHeight, targetWidth, targetHeight },
      [transferable],
    );
  });
}
