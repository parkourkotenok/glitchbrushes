# Control Effect Audit

Baseline: `af8d5de`. The automated harness is `src/controlSensitivity.ts`; run it through
`npm run audit:controls`. It fixes three representative RGBA fixtures (photographic texture,
high-contrast alpha artwork, and gradient), hard/soft masks, short/long paths, and one seed. Every
comparison records an output hash, changed-pixel count, mean absolute RGBA difference, changed
bounds, and algorithm write bounds. The harness is test-only and is not imported by the production
entry point.

## Decisions with measured evidence

| UI location             | Data field                      | Code consumer / activation                                            | Measured delta                                                      | Decision / new label                                                  |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Effect brush details    | `brush.size`                    | brush mask radius, every family                                       | output and changed bounds vary                                      | Essential: **Size**                                                   |
| Effect brush details    | `brush.strength`                | engine effect strength, every family                                  | RGBA MAD varies                                                     | Essential: **Amount**                                                 |
| Effect brush details    | `brush.hardness`                | mask falloff, every family                                            | soft-mask bounds and MAD vary                                       | Essential presentation: **Edge softness**, stored as inverse hardness |
| Effect brush details    | `brush.opacity`                 | mask accumulation                                                     | RGBA MAD varies independently of strength across repeated stamps    | Fine: **Opacity**                                                     |
| Effect brush details    | `brush.spacing`                 | stroke sampling cadence                                               | stamp count and output vary on long path                            | Fine: **Spacing**                                                     |
| Effect brush details    | `brush.scatter`                 | stamp position before mask creation                                   | output/bounds vary                                                  | Fine: **Scatter**                                                     |
| Effect brush details    | `brush.density`                 | mask acceptance only when family is `pixel`; App forces `1` otherwise | pixel fixture changes; advanced/structural unchanged                | Conditional: **Pixel density**, legacy pixel only                     |
| Effect brush details    | `brush.accumulate`              | mask accumulation policy                                              | repeated-stamp mask changes                                         | Fine: **Build up**                                                    |
| Effect brush details    | pressure fields                 | pointer pressure and engine strength                                  | only active with pressure enabled                                   | Conditional inside Brush details                                      |
| Effect global           | `microIntensity`                | `visitMask` for legacy pixel algorithms                               | Palette Collapse min/max differs; advanced fixture byte-identical   | Conditional legacy-pixel fine control; **Pixel intensity**            |
| Effect global           | `structuralIntensity`           | structural reach and amount                                           | Slice Displacement min/max differs; advanced fixture byte-identical | Conditional structural fine control; **Structural amount**            |
| Effect global           | `settings.spill`                | `structuralWriteBounds` and structural source extent                  | write bounds differ; RGBA can differ at edge fixtures               | Conditional structural fine control; **Edge reach**                   |
| Pixel Sort              | `sortBrushSpill`                | only expands calculated write bounds                                  | min/max RGBA hashes identical while write bounds differ             | Dead for RGBA: remove from UI, keep serialized field                  |
| Displacement            | `displacementBrushSpill`        | passed to `influenceAt`, whose `_spill` argument is unused            | min/max RGBA hashes identical while write bounds differ             | Dead for RGBA: remove from UI, keep serialized field                  |
| Line Freeze             | `lineBrushSpill`                | expands loop origin and therefore line phase                          | striped fixture may change RGBA, but it is not spatial spill        | Hide as technical compatibility field                                 |
| Image Brush Evolution   | `resetEachStroke`               | startup offset path                                                   | min/max output byte-identical when Continue is off                  | Dead: remove from UI, keep serialized field                           |
| Image Brush diagnostics | `maxLiveFxIterations`           | copied to preview settings; final engine never reads it               | min/max final output byte-identical                                 | Developer-only/dead for final RGBA                                    |
| Image Brush Advanced    | `renderingQuality`              | live scheduling                                                       | final output unchanged                                              | Developer-only                                                        |
| Image Brush Advanced    | `maxLiveStampsPerFrame`         | live scheduling                                                       | final output unchanged                                              | Developer-only                                                        |
| Image Brush Advanced    | `showOutline` / `previewStroke` | canvas overlays and preview                                           | final output unchanged                                              | Developer-only                                                        |
| Image Brush Essentials  | `opacity`                       | final placement alpha                                                 | output MAD varies                                                   | Essential: **Opacity**                                                |
| Image Brush Placement   | `flow`                          | multiplied with opacity                                               | output varies but duplicates opacity semantics                      | Advanced compatibility control, not primary                           |
| Image Brush Placement   | `scatterX/Y`                    | placement offset in Scatter/Random Hose                               | byte-identical in Repeat; changes output in Scatter                 | Conditional: **Scatter width/height**                                 |
| Image Brush Advanced    | `bleedAmount`                   | alpha expansion                                                       | byte-identical in Preserve; changes output in Bleed                 | Conditional under **Alpha: Bleed**                                    |

## Algorithm controls

All rows below name the actual consumer module. “Primary” means visible without opening Fine tuning;
“Fine” means still available but collapsed; “Conditional” means rendered only for the listed mode.
Min/max pairs are shown as one Range control while preserving both serialized keys.

| Effect                  | Primary controls                                                   | Fine / conditional controls                                           | Consumer                                             | Old → new visible count    |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------- |
| Pixel Sort Brush        | Direction; Sort by; Tones range; Run length range; Disorder        | Sort distance; Edge fade; Reverse                                     | `glitchAlgorithms/advancedBrush.ts` Pixel Sort block | 11 → 5 (+3 fine)           |
| Feedback Brush          | Echoes; Offset X/Y; Scale; Fade; RGB delay                         | Rotation; Brightness fade; Blend; Memory persistence; Reset memory    | `advancedBrush.ts` Feedback block                    | 10 → 5 (+5 fine)           |
| Displacement Brush      | Field; Strength X/Y; Field scale; Texture; Smoothness              | Iterations; Edge treatment; Roughness/octaves for procedural fields   | `advancedBrush.ts` Displacement block                | 11 → 5 (+4 fine)           |
| Flow Mosh Brush         | Block size; Trail length; Follow stroke; Decay; Chroma lag         | Passes; Persistence; Jitter; Luma preserve; Overwrite                 | `advancedBrush.ts` Flow block                        | 12 → 5 (+5 fine)           |
| Clone Corruption Brush  | Source interaction; Mode; Fragment size; Repeats; Mix              | Alignment; Fragmentation; Decay; scale/rotation/RGB variation by mode | `advancedBrush.ts` Clone block                       | 12 → 5 (+5 fine)           |
| Line Freeze Brush       | Orientation; Source edge; Repeats; Stretch; Thickness              | RGB split; Jitter; Dropout                                            | `advancedBrush.ts` Line Freeze block                 | 9 → 5 (+3 fine)            |
| Mirror Fold Brush       | Fold side; Axis; Offset; Mix                                       | Repetitions; RGB slip; Edge handling; Falloff; fallback angle         | `advancedBrushExperimental.ts`                       | 9 → 4 (+5 fine)            |
| Halftone Collapse Brush | Cell size; Collapse; Ink gain; Colour; Grid direction              | Drift; channel shift; dot shape; background mix; fallback angle       | `advancedBrushExperimental.ts`                       | 10 → 5 (+5 fine)           |
| Raster Loom Brush       | Strip width; Source offset; Weave depth; Direction; Mix            | Gap; RGB slip; Alternation; Edge fade; fallback angle                 | `advancedBrushExperimental.ts`                       | 10 → 5 (+5 fine)           |
| Contour Crawl Brush     | Edge sensitivity; Trail length; Repeats; Decay; Mix                | Line width; RGB split; Side drift; polarity; fallback angle           | `advancedBrushExperimental.ts`                       | 10 → 5 (+5 fine)           |
| Slice Displacement      | Orientation; Count; Thickness range; Distance range; Edge handling | Edge reach                                                            | `glitchAlgorithms/structural.ts`                     | 8 → 5 (+1 fine)            |
| Block Corruption        | Failure style; Block size; Coverage; Offset; Mix                   | Direction and mode-specific repeat/dropout/neighbour/stretch          | `structural.ts`                                      | 11 → 5 (+conditional fine) |
| Datamosh Smear          | Direction; Trail length; Block shape; Decay; Chroma drift          | Persistence; Mix; Jitter; Luma hold                                   | `structural.ts`                                      | 10 → 5 (+4 fine)           |
| RGB Chunk Split         | Region size; RGB separation; Mix; Edge fade; Randomize offset      | none                                                                  | `structural.ts`                                      | 5 → 5                      |
| Codec Block Damage      | Failure style; Tile size; Compression; Detail loss; Mix            | failure-specific coefficient, shuffle, neighbour, boundary, ringing   | `structural.ts`                                      | 12 → 5 (+conditional fine) |
| Scanline Tear           | Band count; Thickness range; Shift; RGB split; Damage mix          | Duplicate; Dropout; Jitter                                            | `structural.ts`                                      | 10 → 5 (+3 fine)           |
| Row / Column Repeat     | Orientation; Band thickness; Repeats; Jitter; Fade                 | none                                                                  | `structural.ts`                                      | 5 → 5                      |
| Structural Mixed        | Recipe interaction; Effect count range; Coverage; Pool             | lock/new recipe and pool editor                                       | `structural.ts`                                      | 9 → 4 (+custom fine)       |
| Palette Collapse        | Colour levels; Dither                                              | Pixel intensity; Pixel density                                        | `glitchAlgorithms/index.ts`                          | 4 → 2 (+2 fine)            |
| Channel Shift           | Red/green/blue offsets; Randomize; Edge mirror                     | Pixel intensity; Pixel density                                        | `glitchAlgorithms/index.ts`                          | 7 → 5 (+2 fine)            |
| Byte Swap               | Swap pattern                                                       | Pixel intensity; Pixel density                                        | `glitchAlgorithms/index.ts`                          | 3 → 1 (+2 fine)            |

Legacy algorithm fields remain in `AlgorithmSettings`, defaults, and migration even where their old
picker entries are hidden. No algorithm was changed by this audit. One fixture is not considered proof
of usefulness: the final decisions combine the deterministic measurements above with traced engine
consumers and activation conditions.

## Image Brush conditional map

| Section     | Controls                                                                   | Activation                    | Decision                 |
| ----------- | -------------------------------------------------------------------------- | ----------------------------- | ------------------------ |
| Essentials  | Size, Spacing, Opacity, Orientation, Glitch amount                         | always                        | Essential                |
| Placement   | Scatter X/Y, opacity/scale jitter, flips, stamps per step                  | Scatter / Random Hose         | Conditional              |
| Placement   | custom anchor X/Y                                                          | Custom anchor                 | Conditional              |
| Placement   | pressure minima                                                            | corresponding pressure toggle | Conditional              |
| Evolution   | start/end, speed, maximum, curve, variants                                 | Progressive                   | Conditional              |
| Evolution   | effect pool, count range, diversity, repeat policy                         | Random per stamp              | Conditional              |
| Evolution   | accumulation, recovery, alpha stability, chroma/structural drift, Continue | Evolving                      | Conditional              |
| Evolution   | stack count/strength ranges, order, coherence                              | Random stack                  | Conditional              |
| Evolution   | recipe A/B, interval, transition, random alternation                       | Alternating                   | Conditional              |
| Evolution   | start/end recipe and curve                                                 | Stroke gradient               | Conditional              |
| FX          | stage, enabled summary, rack Amount/Mix, effect-specific fields            | FX present / compatible stage | Essential or Conditional |
| Advanced    | alpha mode; Bleed amount                                                   | Bleed only                    | Advanced / Conditional   |
| Advanced    | trim/threshold and working-size actions                                    | asset present                 | Advanced                 |
| Diagnostics | quality, budgets, cache/worker/timing fields                               | `?perf=1`                     | Developer-only           |

The two experimental FX were measured on the alpha-art fixture: changing mutation amount changes
both Pixel Embroidery and Xerox Decay output hashes and changed-pixel counts. Their serialized custom
fields remain available in expanded FX cards.
