/// <reference lib="webworker" />
import { decodePsdBytes, encodePsdBytes, type EncodedPsdInput } from '../psd/codec';

type Request =
  { operation: 'decode'; buffer: ArrayBuffer } | { operation: 'encode'; document: EncodedPsdInput };

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    if (event.data.operation === 'decode') {
      const result = decodePsdBytes(event.data.buffer);
      const transfers = result.layers.map((layer) => layer.pixels.buffer);
      self.postMessage({ ok: true, operation: 'decode', result }, { transfer: transfers });
      return;
    }
    const bytes = encodePsdBytes(event.data.document);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ ok: true, operation: 'encode', buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'PSD processing failed.',
    });
  }
};

export {};
