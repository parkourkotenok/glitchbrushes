# Interface Redesign Report

Baseline: `af8d5de` (`add experimental brush lab`). Final implementation is split across the five
requested logical commits. Five specialist subagents audited control semantics, Effect UX, Image
Brush UX, visual/accessibility behavior, and post-integration browser regressions; the main agent
reviewed and integrated the decisions and ran the final acceptance matrix.

## Result

Effect now presents one picker, three brush essentials, at most five algorithm-specific primary
controls, and a collapsed Fine tuning section. Image Brush now presents Source, Style, Preview,
Essentials, one persistent Placement/Evolution/FX tab panel, and one collapsed Advanced section.
The existing engines, serialized keys, layer model, History labels, and project format remain in
place.

The deterministic measurements and per-effect control budget are in
[CONTROL_EFFECT_AUDIT.md](CONTROL_EFFECT_AUDIT.md). The production browser evidence is in
[artifacts/interface-redesign/acceptance.json](artifacts/interface-redesign/acceptance.json).

## Control decisions

### Dead or misleading controls removed from production UI

| Field | Finding | Compatibility decision |
| --- | --- | --- |
| `sortBrushSpill` | changed calculated write bounds but produced byte-identical RGBA | UI removed; field/default/deserialization retained |
| `displacementBrushSpill` | `_spill` was not consumed by `influenceAt`; RGBA stayed byte-identical | UI removed; field/default/deserialization retained |
| `lineBrushSpill` | changed technical line phase, not spatial spill | hidden as a technical compatibility field |
| `resetEachStroke` | changing it could not affect the next Image Brush stroke | UI removed; serialized field retained |
| `maxLiveFxIterations` | no final-engine consumer and no final RGBA delta | production UI removed; compatibility/default retained |

No dead field was deleted from old project data. Unreachable legacy algorithm branches remain
deserializable, but are not advertised as current production effects.

### Conditional controls

- `brush.density` and `microIntensity` appear only for legacy pixel effects.
- `structuralIntensity` and the general structural edge reach appear only for structural effects.
- Scatter controls appear only in Scatter/Random Hose; sequence controls appear only in
  Sequence/Random Hose.
- Custom anchor, pressure minima, Alpha Bleed, and every Evolution recipe show only when their
  activating mode is selected.
- Image Brush processing stage lives only in FX. Diagnostics and Test stamp/trail exist only under
  `?perf=1`.

### Renamed or regrouped controls

| Internal meaning | User-facing presentation |
| --- | --- |
| brush strength | **Amount** |
| inverse hardness | **Edge softness** |
| Image Brush preset | **Style** |
| mutation mode | **Evolution mode** |
| structural spill/read extent | **Edge reach**, structural Fine tuning only |
| accumulation | **Build up** |

Effect presets, five quick intensity buttons, duplicate selected summaries, engine-family jargon,
permanent randomize/reset rows, Current Brush, Library and Project, Copy Tip, Download Tip, and
normal-production diagnostics were removed from the UI. Project import/export remains the global
editor workflow.

## Visible control budget

The exact per-Effect old/new count is recorded in the Algorithm controls table in
[CONTROL_EFFECT_AUDIT.md](CONTROL_EFFECT_AUDIT.md#algorithm-controls). Highlights:

- advanced brush effects fell from 9–12 simultaneously exposed algorithm fields to 4–5 primary
  fields, with at most 3–5 collapsed Fine controls;
- structural effects fell from 8–12 fields to 4–5 primary fields;
- legacy Pixel effects fell to 1–5 primary fields, with pixel-only intensity/density kept in Fine
  tuning.

Image Brush's initial workflow fell from 18 always-exposed Source/Style/Essential controls to 12:
two Source actions, four Style/randomize actions, and six Essentials including the two orientation
choices. Only one tab's conditional controls is visible at a time. The component still declares
compatibility controls for every old mode (134 interactive JSX control occurrences at baseline,
128 now), but those are no longer one stacked production form.

## Algorithm and performance correction

No image-output algorithm was redesigned. One evidence-driven performance correction was made in
Xerox Decay: per-pixel luminance is now computed once and reused for the four neighbour comparisons.
The calculation uses `Float64Array`, preserving the same double-precision luminance values and
deterministic output while preventing Progressive variant pools from repeatedly decoding identical
RGB triplets.

The sensitivity harness covers photographic texture, high-contrast alpha artwork, gradient data,
hard and soft masks, short and long paths, and fixed seeds. It is test-only and absent from the
production bundle.

## Browser and performance acceptance

All scenarios used the freshly rebuilt production bundle, 20 real pointer strokes, and headed
Microsoft Edge 151 / Mozilla Firefox 154.

| Browser / scenario | Full sync | Auto fit | Zoom | History | Worker round-trip p95 | Layer commit p95 |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| Edge — Pixel Sort, short | 0 | 0 | stable | byte-exact | n/a | 3.9 ms |
| Edge — Displacement, long | 0 | 0 | stable | byte-exact | n/a | 16.2 ms |
| Firefox — Slice Displacement | 0 | 0 | stable | byte-exact | n/a | 3 ms |
| Firefox — Mirror Fold experimental | 0 | 0 | stable | byte-exact | n/a | 12 ms |
| Firefox — Pixel Embroidery, Fixed | 0 | 0 | stable | byte-exact | 31 ms | 1 ms |
| Firefox — Pixel Embroidery, Evolving | 0 | 0 | stable | byte-exact | 25 ms | 2 ms |
| Edge — Xerox Decay, Progressive | 0 | 0 | stable | byte-exact | 25.3 ms | 2.1 ms |

Edge recorded no rAF gap at or above 50 ms in the final runs. Firefox BiDi did not return rAF-gap
samples from the page recorder, so Firefox acceptance relies on successful headed strokes, worker
round-trip, commit/upload timing, stable zoom, zero full-sync/auto-fit deltas, and byte-exact
Undo/Redo rather than claiming an unavailable rAF statistic.

The UI runner additionally verified:

- Style save, rename, delete, export, and import with settings/rack equality;
- Source duplicate and remove;
- deterministic locked randomization and preservation of Size, Spacing, Opacity, and Orientation;
- complete Project v3 export/import and a legacy project/Image Brush version import;
- tab persistence after reload;
- Arrow-key tab navigation, Escape dismissal, and focus restoration;
- no document, inspector, or popover horizontal overflow at 1366×768, 1440×900, or 1920×1080.

## Screenshots

### Required viewport overview

| Viewport | Effect Simple | Image Brush Placement |
| --- | --- | --- |
| 1366×768 | [screenshot](artifacts/interface-redesign/effect-1366x768.png) | [screenshot](artifacts/interface-redesign/image-brush-1366x768.png) |
| 1440×900 | [screenshot](artifacts/interface-redesign/effect-1440x900.png) | [screenshot](artifacts/interface-redesign/image-brush-1440x900.png) |
| 1920×1080 | [screenshot](artifacts/interface-redesign/effect-1920x1080.png) | [screenshot](artifacts/interface-redesign/image-brush-1920x1080.png) |

### Required states at 1440×900

- [Effect Fine tuning](artifacts/interface-redesign/effect-fine-tuning-1440x900.png)
- [Effect experimental NEW group](artifacts/interface-redesign/effect-picker-new-effects-1440x900.png)
- [Image Brush Evolution](artifacts/interface-redesign/image-brush-evolution-1440x900.png)
- [Image Brush FX](artifacts/interface-redesign/image-brush-fx-1440x900.png)
- [Image Brush Advanced / diagnostics-capable layout](artifacts/interface-redesign/image-brush-advanced-1440x900.png)
- [Source library popover](artifacts/interface-redesign/image-brush-source-picker-1440x900.png)
- [Randomize menu](artifacts/interface-redesign/image-brush-randomize-menu-1440x900.png)
- [Style menu](artifacts/interface-redesign/image-brush-style-menu-1440x900.png)

## Backward compatibility retained

- Project v3, Image Brush style JSON, embedded assets, active asset, rack, and hidden settings keep
  their serialized key names.
- Effect preset data helpers remain only where project/migration compatibility still consumes them;
  the separate production preset UI and dead App wiring were removed.
- `resetEachStroke`, spill fields, render budgets, preview flags, and old quality fields remain in
  types/defaults/migration even when hidden.
- Undo/Redo, History labels, layers, shortcuts, NEW experimental IDs, locked seeds, and the
  off-main-thread preview/worker paths remain unchanged.

## Remaining UX limitations

- At 1366×768, Image Brush intentionally requires vertical scrolling after the compact Essentials;
  Source, Style, Preview, and the first Essentials remain readable, but the full active tab cannot
  fit above the fixed Layers dock.
- The retro visual language deliberately retains some uppercase micro-labels in the canvas chrome;
  the inspector hierarchy is calmer, but this was not a full application-wide redesign.
- Firefox's current BiDi path does not expose the page's rAF sample array, as noted above.
