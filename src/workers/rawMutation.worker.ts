import { mutateBytes, type RawMutationParams } from '../raw/mutateBytes';

type RawMutationRequest = RawMutationParams & { buffer: ArrayBuffer };

self.onmessage = (event: MessageEvent<RawMutationRequest>) => {
  const { buffer, ...params } = event.data;
  const bytes = new Uint8Array(buffer);
  const outcome = mutateBytes(bytes, params);
  self.postMessage({ buffer, ...outcome }, { transfer: [buffer] });
};

export {};
