import type { AlgorithmId } from '../types';

interface EffectPreviewStageProps {
  algorithm: AlgorithmId;
  description?: string;
  estimatedCost?: string;
}

export const effectPreviewAssetUrl = (algorithm: AlgorithmId, kind: 'after' | 'difference') =>
  `/assets/effect-previews/${algorithm}-${kind}.webp`;

export function EffectPreviewStage({
  algorithm,
  description,
  estimatedCost,
}: EffectPreviewStageProps) {
  return (
    <section
      className="shared-effect-preview"
      data-preview-effect={algorithm}
      data-preview-status="static"
    >
      <header>
        <strong>STATIC EFFECT PREVIEW</strong>
        <span>PRE-RENDERED DEMO</span>
      </header>
      <div className="shared-effect-preview-grid">
        <figure>
          <img
            src="/assets/effect-previews/original.webp"
            alt="Unchanged landscape demo"
            draggable="false"
          />
          <figcaption>ORIGINAL</figcaption>
        </figure>
        <figure>
          <img
            src={effectPreviewAssetUrl(algorithm, 'after')}
            alt={`${algorithm} rendered on the landscape demo`}
            draggable="false"
          />
          <figcaption>EFFECT RESULT</figcaption>
        </figure>
        <figure>
          <img
            src={effectPreviewAssetUrl(algorithm, 'difference')}
            alt={`${algorithm} changed-pixel map`}
            draggable="false"
          />
          <figcaption>CHANGED PIXELS</figcaption>
        </figure>
      </div>
      <p className="effect-preview-legend">
        A fixed pre-rendered example on the Parkour Kotenok landscape. Your open image and current
        canvas never change this preview.
      </p>
      {(description || estimatedCost) && (
        <footer>
          {description && <span>{description}</span>}
          {estimatedCost && <strong>{estimatedCost} COST</strong>}
        </footer>
      )}
    </section>
  );
}
