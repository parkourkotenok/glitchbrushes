import type { DecodedPsd, EncodedPsdInput } from './codec';

const createWorker = () =>
  new Worker(new URL('../workers/psd.worker.ts', import.meta.url), { type: 'module' });

export async function decodePsdOffThread(file: File): Promise<DecodedPsd> {
  if (file.size > 64 * 1024 * 1024) throw new Error('PSD exceeds the 64 MB safety limit.');
  const buffer = await file.arrayBuffer();
  const worker = createWorker();
  return new Promise((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; result?: DecodedPsd; error?: string }>,
    ) => {
      worker.terminate();
      if (!event.data.ok || !event.data.result)
        reject(new Error(event.data.error ?? 'PSD import failed.'));
      else resolve(event.data.result);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'PSD import worker failed.'));
    };
    worker.postMessage({ operation: 'decode', buffer }, [buffer]);
  });
}

export async function encodePsdOffThread(document: EncodedPsdInput): Promise<Uint8Array> {
  const worker = createWorker();
  const transfers = [
    document.composite.buffer,
    ...document.layers.map((layer) => layer.pixels.buffer),
  ];
  return new Promise((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{ ok: boolean; buffer?: ArrayBuffer; error?: string }>,
    ) => {
      worker.terminate();
      if (!event.data.ok || !event.data.buffer)
        reject(new Error(event.data.error ?? 'PSD export failed.'));
      else resolve(new Uint8Array(event.data.buffer));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'PSD export worker failed.'));
    };
    worker.postMessage({ operation: 'encode', document }, transfers);
  });
}
