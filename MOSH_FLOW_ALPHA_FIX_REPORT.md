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

`artifacts/mosh-flow-alpha/mosh-flow-trail-fixed.png` was captured from the local app after
selecting **MOSH Flow Trail** and committing a repeated transparent astronaut-demo stroke. The
worker completed as one history action and the screenshot shows the processed trail without a
remaining live-overlay ghost.
