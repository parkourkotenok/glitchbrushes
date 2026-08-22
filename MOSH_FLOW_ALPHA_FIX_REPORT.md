# MOSH Flow Trail alpha fix

## Reproduction

The deterministic regression fixture paints three separated opaque shapes with transparent gaps,
then applies `Flow Field` as a `whole-trail` FX with `Alpha Bleed` (`amount: 1`, bleed radius
`4`). Before this fix, `enforceAlpha` dilated the clean, pre-FX trail alpha, restoring clean
silhouettes at their stationary positions after Flow Field had displaced the RGBA pixels.

## Fix

`Bleed` now snapshots alpha from the post-FX buffer, dilates that mask, and samples fallback
colour from the same post-FX buffer. `Preserve Alpha` and `Inside Alpha` still use the clean
source silhouette; `Corrupt Alpha` remains unrestricted. This keeps geometry-moving whole-trail
effects from receiving a clean source mask or source-colour fallback.

## Regression coverage

`src/imageBrush.test.ts` verifies that the separated-shape Flow Field trail:

- differs spatially from the clean trail alpha;
- remains byte-exact for an identical seed;
- retains transparent background pixels;
- round-trips through `PatchHistory` undo/redo byte-exactly.

The same Alpha Bleed path is additionally exercised deterministically for Flow Field, Motion
Field, Motion Transfer, Feedback Echo, and Edge Melt.

## Live overlay audit

`clearImageBrushOverlay` clears the complete canvas whenever a live trail existed and resets the
trail flag. Successful and no-change results already clear it before branching; cancellation now
does too. Obsolete results clear it when no newer job owns the overlay, avoiding an old worker
erasing a newer stroke's feedback. Preview apply/cancel run only after the worker result has
already performed that clear.

## Visual acceptance

The literal before/after pair is rendered by `scripts/mosh-flow-alpha-fixture.ts` using the same
transparent astronaut (64×64 Lanczos decode), 512×184 canvas, nine sinusoidal stamps, seed
`mosh-flow-alpha-v1`, stroke ID `mosh-flow-alpha-stroke`, `whole-trail` Flow Field, and Alpha
Bleed (radius 4). It is engine output, not a Style-card preview.

- `artifacts/mosh-flow-alpha/mosh-flow-alpha-before.png` comes from isolated detached worktree
  `275ad4a08c36999ef145cb7922cde87ed3e8d853` (the parent of `afdf5e1`, before the alpha fix):
  pixel hash `3f2fbc17`, 17,934 non-transparent pixels.
- `artifacts/mosh-flow-alpha/mosh-flow-alpha-after.png` comes from the integrated fixed HEAD:
  pixel hash `dc84821d`, 12,985 non-transparent pixels.

The shared bounds are `{ x: 18, y: 20, width: 482, height: 157 }`. The baseline's higher alpha
coverage is the restored stationary clean mask; the fixed output keeps only post-Flow alpha.

`artifacts/mosh-flow-alpha/mosh-flow-trail-fixed.png` remains the separate actual post-fix
browser committed-canvas screenshot; it is intentionally not overwritten by the engine fixture.

## Current integrated status — 2026-08-22

The alpha fix remains covered after the shared JPEG Resample and Image Brush evolution changes. Current integrated validation passes typecheck, 282/282 tests, and the production build; the evidence hashes above remain historical fixture evidence and were not regenerated.
