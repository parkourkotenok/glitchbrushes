# Image Brush multi-source

Image source selection is project state, not a Style field: `selected | all`, `cycle | random`, and the enabled asset IDs persist in IndexedDB preferences and portable projects. Styles and Randomize leave these values unchanged.

Final strokes, read-bound estimation, inspector preview, and the live overlay resolve the same ordered asset subset. Selected transfers only the active image; All transfers only enabled images. The one preview Worker builds bounded processed tip variants per transferred asset with the normal stamp-FX pipeline—never one full trail job per asset—so ghost sources retain the current Style/FX rack. Random selection is seeded from `seed + strokeId + flatIndex`; cycle follows library order.

Legacy `sequence` projects migrate to trail placement + All/Cycle and `random-hose` to scatter placement + All/Random, retaining the legacy library set. New custom images become enabled; the demo is not auto-added when custom images exist; the source picker prevents disabling the final enabled image.

Focused verification after the 2026-08-22 evolution update: `npm run typecheck`; `npm test -- --run src/imageBrush.test.ts src/productionUi.test.ts` (96 passing tests). Full validation passes 282/282 tests and production build. Multi-source selection remains independent from smooth Progressive Decay and Fade along stroke.
