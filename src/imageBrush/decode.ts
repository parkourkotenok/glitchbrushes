import type { ImageBrushAsset, ImageBrushSettings } from './types';

export const astronautDemoAssetId = 'demo-image-brush-astronaut';
export const astronautDemoUrl = '/assets/image-brush-astronaut.png';

export function decodeImageBrushFilesOffThread(
  files: File[],
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>,
  maximumDimension = 512,
): Promise<ImageBrushAsset[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/imageBrushAsset.worker.ts', import.meta.url), {
      type: 'module',
    });
    const jobId = `image-brush-assets-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const finish = () => worker.terminate();
    worker.onerror = () => {
      finish();
      reject(new Error('The off-thread brush image decoder failed.'));
    };
    worker.onmessage = (
      event: MessageEvent<
        | { jobId: string; type: 'result'; assets: ImageBrushAsset[] }
        | { jobId: string; type: 'error'; message: string }
      >,
    ) => {
      if (event.data.jobId !== jobId) return;
      finish();
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data.assets);
    };
    worker.postMessage({ jobId, files, settings, maximumDimension });
  });
}

export async function loadAstronautDemoAsset(
  settings: Pick<ImageBrushSettings, 'trimTransparent' | 'trimThreshold'>,
): Promise<ImageBrushAsset> {
  const response = await fetch(astronautDemoUrl);
  if (!response.ok) throw new Error('The astronaut demo image could not be loaded.');
  const blob = await response.blob();
  const file = new File([blob], 'image-brush-astronaut.png', { type: 'image/png' });
  const [decoded] = await decodeImageBrushFilesOffThread([file], settings, 384);
  if (!decoded) throw new Error('The astronaut demo image could not be decoded.');
  return {
    ...decoded,
    id: astronautDemoAssetId,
    name: 'Astronaut demo',
    demo: true,
    defaultSize: 148,
  };
}
