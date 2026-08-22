# Browser acceptance report — 2026-08-22

Production build acceptance passed on the integrated HEAD.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test -- --run` | Passed: 13 files, 254 tests. |
| `npm run build` | Passed. |
| `GLITCHBRUSHES_URL=http://127.0.0.1:4180/?perf=1&tool=glitch-brushes&controls=simple node scripts/interface-redesign-acceptance.mjs` | Passed: `ok: true`. |
| `GLITCHBRUSHES_URL=http://127.0.0.1:4180/?perf=1&tool=glitch-brushes&controls=simple node scripts/performance-browser-acceptance.mjs --browser=edge --image-fx=flow-field --mutation=evolving --stroke=short` | Headed Edge passed. |
| `GLITCHBRUSHES_URL=http://127.0.0.1:4180/?perf=1&tool=glitch-brushes&controls=simple node scripts/performance-browser-acceptance.mjs --browser=firefox --image-fx=flow-field --mutation=evolving --stroke=short` | Headed Firefox 154 passed. |
| `npm run audit:image-brush-styles` twice | Both runs produced the same `manifest.json` SHA-256: `5727D2F9B1EE65EFBA670A6272C07B1D34703F479E8C2E2FC85CC8A5445947E0`. |

## Visual and accessibility acceptance

The Edge UI run covered 1366×768, 1440×900, and 1920×1080. Every recorded layout has no document or inspector horizontal overflow and no clipped popover. Keyboard focus returned after Effect picker, source picker, Randomize, and Style actions; Image Brush Advanced workflow tabs respond to ArrowRight.

Evidence is in `artifacts/interface-redesign/`, including:

- `effect-*` and `image-brush-*` at all three viewports;
- `brushes-retouch-1440x900.png` and `brushes-mosh-1440x900.png`;
- `image-brush-all-cycle-1440x900.png` and `image-brush-all-random-1440x900.png`;
- `image-brush-style-browser-1440x900.png`, plus Pixel Embroidery, Xerox Decay, Zine Stitch, and MOSH Flow Trail captures;
- Simple and Advanced Image Brush captures.

The acceptance workflow also verifies style save/rename/delete/import round trip, legacy project import, tab persistence after reload, deterministic locked Randomize, and that All/Cycle and All/Random are represented in the UI.

## Performance and lifecycle counters

Both headed browser runs performed 20 Flow Field evolving strokes. Edge (151) / Firefox (154) results:

| Counter | Edge | Firefox |
| --- | ---: | ---: |
| Full canvas sync delta | 0 | 0 |
| Fit-to-screen delta | 0 | 0 |
| rAF gaps ≥50 ms | 0 | 0 |
| History redo byte-exact | yes | yes |
| Zoom stable | yes | yes |

The production regression suite additionally covers required-asset selection, deterministic All cycle/random order, preview parity, post-FX MOSH alpha behavior, and successful worker self-close. The static Style Browser uses generated thumbnails (`Static previews · no preview jobs`), so opening it does not schedule one preview Worker per card. The implementation transfers only the active asset in Selected and only enabled assets in All; these contracts are exercised in `src/imageBrush.test.ts`.

## MOSH alpha evidence

`artifacts/mosh-flow-alpha/mosh-flow-alpha-before.png` and `mosh-flow-alpha-after.png` are the literal deterministic engine-output pair, rendered with the same transparent astronaut, path, seed, Flow Field and Alpha Bleed fixture. Before was rendered in detached `275ad4a08c36999ef145cb7922cde87ed3e8d853` (parent of `afdf5e1`): hash `3f2fbc17`, 17,934 non-transparent pixels. Fixed HEAD is hash `dc84821d`, 12,985 non-transparent pixels. The smaller post-fix alpha coverage proves the stationary clean mask is no longer restored. `artifacts/mosh-flow-alpha/mosh-flow-trail-fixed.png` remains the separate actual post-fix browser committed-canvas screenshot, while `artifacts/interface-redesign/image-brush-mosh-flow-trail-fixed-1440x900.png` remains UI-selection evidence only.

## Audit reproducibility fix

`scripts/image-brush-style-audit.ts` no longer persists wall-clock `firstRenderMs` in the tracked manifest. Timings remain console-only, while pixel hashes and bounds remain in `artifacts/image-brush-style-audit/manifest.json`; consecutive audits now produce identical manifests.

## Browser limitation

The desktop app's direct Edge browser binding was unavailable because the ChatGPT Edge extension is not installed. The repository's headed CDP/WebDriver acceptance scripts were used instead; Firefox was headed, and the visual multi-viewport capture was performed with Edge's existing CDP harness.

## Current integrated status — 2026-08-22

The command table above remains evidence for its original acceptance run. The current worktree additionally passes typecheck, 282/282 tests, and production build. In-app acceptance for JPEG Melt and Fade along stroke confirmed correct controls, disabled Essential Opacity, stable scroll position, and zero console errors.
