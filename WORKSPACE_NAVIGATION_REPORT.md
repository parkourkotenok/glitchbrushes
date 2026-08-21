# Workspace Navigation Report

## Delivered

- Consolidated the old top-level Effect, Retouch, and Mosh Lab entries into the `BRUSHES` workspace, with `EFFECT`, `RETOUCH`, and `MOSH` subtool tabs. `IMAGE BRUSH` remains its own top-level workspace.
- Kept old `activePanel` URL values compatible, including `mosh-lab`, `Mosh Lab`, and `image`; new navigation writes the stable `panel` value and supports browser Back/Forward.
- Added roving keyboard tabs (`ArrowLeft`, `ArrowRight`, `Home`, `End`), tab/tabpanel relationships, focus movement, and per-subtool inspector scroll restoration.
- Avoided panel reset/remount after first visit. Effect and Retouch remain mounted; Mosh and Image Brush are lazy-loaded once, then retained. Switching away from Image Brush no longer terminates its preview Worker solely because the UI changed.
- Preserved the last Retouch tool when returning from another Brush subtool.

## Validation

- `npm run typecheck` passed.
- `npm test -- --run src/workspaceNavigation.test.ts src/productionUi.test.ts` passed: 2 files, 24 tests.
