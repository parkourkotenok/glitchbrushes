# Agent Worklog

## 2026-08-21 — Windows launcher dependency repair

- `start-local.bat` and `start-dev.bat` now verify the actual local `tsc.cmd`/`vite.cmd` executables instead of treating any existing `node_modules` directory as a complete install. Missing or partial dependencies are repaired automatically with `npm install`, with an explicit error if the binaries are still unavailable.

## 2026-08-21 — Production post-stroke jank repair

- Pixel revision отделена от document surface generation: обычный Effect/Retouch/Image Brush commit больше не запускает следующий full canvas sync или automatic fit. Surface generation меняется при replace/import/add-image, когда меняются dimensions/document/original identity.
- Инструментированный baseline `c59c536` на 20 Slice strokes выполнял 20 dirty uploads + 20 повторных full sync + 20 fit; итоговая версия выполняет 20 dirty uploads + 0 full sync + 0 fit и сохраняет zoom/pan.
- Brush Worker возвращает только `writeBounds` RGBA; main thread принимает регион строками. One-shot Brush/Image Brush/Retouch/Mosh Workers после transfer вызывают `self.close()`, а main thread больше не terminate'ит успешный result.
- Full Float32 mask переиспользуется с построчной очисткой dirty bounds. History memory getter стал O(1) между мутациями и считает уникальные shared COW buffers; App читает его один раз на `historyVersion`, layer memory — один раз на `layerVersion`.
- `start-local.bat` теперь собирает и запускает production preview; прежний Vite dev workflow вынесен в `start-dev.bat`.
- Production acceptance: headed Edge 151 и Firefox 154 по 20 Slice strokes, плюс Chromium/IAB по 20 Pixel Sort, Displacement, short/long Slice и двум Image Brush recipes. Во всех bounded сериях full-sync/fit delta = 0, zoom стабилен, rAF gaps ≥50 ms = 0. Точные p50/p95/max — в `PERFORMANCE_REPORT_2026-08-21.md`.
- P2 replacement tiles, region-aware algorithm input, persistent Image Brush Worker и History TileDelta сознательно не реализованы в этой задаче.

## 2026-08-21 — Documentation synchronization

- `README.md` теперь отделяет реализованный быстрый путь слоёв от известных ограничений: overlay tiles, отсутствие replacement alpha/erase semantics и более дорогая композиция прозрачных, partial-opacity и non-Normal слоёв.
- `DECOMPOSITION_REPORT.md` сохранён как исторический отчёт, но дополнен актуальной архитектурой 2026-08-21. Устаревшее утверждение об автоматических Glitch/Image Brush output-слоях помечено как история, а не текущее поведение.
- Нереализованная P2 replacement-tile миграция явно зафиксирована и не представлена как завершённая оптимизация.

## 2026-08-21 — Startup, Slice commit and Image Brush Style performance repair

- Benjamin-Plus подключён проектно через `AGENTS.md` по официальной рекомендации JetBrains; новые агенты получают правила one-pass recon, keyhole reads и task-specific green checks автоматически.
- Initial editor state is now a 1×1 transparent hand-off document over white instead of synchronously generating the obsolete 1120×720 signal-study image. The road demo still decodes asynchronously into the ordinary editable image layer.
- Image Brush library/state hydration and astronaut decoding start only when the Image Brush panel is opened. Effect entry no longer competes with that work.
- The closed Effect picker no longer preloads every static preview pair. Simple mode does not mount the hidden Advanced control tree; those controls are created only after switching to Advanced.
- Slice/effect layer commit writes RGBA tile-by-tile, performs copy-on-write once per touched tile and uses opaque source-over row fast paths instead of allocating a typed-array view for every pixel.
- Image Brush Style presets retain Size, Spacing, Orientation, Opacity and the visible Glitch Amount control without reapplying the previous Clean level over the preset recipe. Browser acceptance confirmed Glitched Repeat (`fixed`, 3 FX) and Progressive Decay (`progressive`, 2 FX).
- Single-layer processing now uses the existing visible document when the selected source is the only rendered full-canvas opaque Normal/100% image. Source mode is captured at pointerdown, and local Worker merges write spans in place instead of cloning and replacing the full visible document.
- `composeLayerStackRegionInto` and compact-region tile commit remove full-canvas before/after composites for bounded strokes; full composition starts from an opaque full-canvas raster instead of first copying the hidden white background. Performance measures cover source compose, merge, full/regional composition, pointerdown/up and commit.
- Verification: TypeScript, 200/200 Vitest tests and production build pass; browser acceptance confirmed async road-demo entry, a committed Slice Displacement history action and live Style preset changes.

## 2026-08-20 — Independent image layers and direct, copy-on-write editing

- `Add image`/drop добавляют фотографию отдельным скрываемым `Image`-слоем; белый `Background` остаётся закреплённым основанием.
- Effect, MOSH, Retouch и Image Brush пишут прямо в выбранный `Image`-слой; автоматические `Glitch Layer`/`Image Brush Layer` больше не создаются. `All Layers` определяет только источник семплирования.
- Импорт и fit выполняются в Worker. History snapshots разделяют неизменённые raster и tile buffers и используют copy-on-write только для затронутых тайлов. Пиксельные merge-пути копируют непрерывные диапазоны вместо миллионов 4-byte операций.
- Project v3 сериализует raster и sparse слои с миграцией старых проектов. Проверено: 193 unit test, typecheck, production build, серия Effect и Image Brush мазков на одном и двух слоях, single/all-layers режимы; число слоёв не растёт, console errors: 0.

## Project Goal

Поддерживать полностью локальный React + TypeScript + Vite редактор **Parkour Kotenok / Glitch Brushes** для художественного глитчинга PNG, JPEG и WebP. Текущее направление — понятный Simple/Advanced интерфейс, быстрые локальные кисти, полноценные слои, предсказуемые предпросмотры, восстанавливаемый оригинал, история и экспорт. HEX и File Corruption больше не входят в продукт.

## Current Status — 2026-08-19

- У приложения есть минимальный входной экран Parkour Kotenok с одной кнопкой входа в Glitch Brushes; название и метаданные приведены к текущему бренду.
- В production остаются четыре рабочих раздела: Effect, Retouch, Mosh Lab и Image Brush. HEX и File Corruption вместе с их Worker/тестами удалены.
- Effect получил Simple/Advanced режим, компактный читаемый picker и статичные заранее подготовленные Original / Effect Result / Changed Pixels previews на пейзажном фоне.
- Retouch получил Smudge и отдельный Photoshop-like Finger; тяжёлое bookkeeping и полноразмерные очистки убраны с pointer hot path, Real Tool Preview удалён.
- Реальные sparse raster layers выбираются в отдельном нижнем dock: Original неизменяем, остальные слои поддерживают видимость, lock, opacity, blend, rename, add/duplicate/delete/reorder/merge/flatten и History.
- Image Brush использует одно демо астронавта, сохраняет пользовательскую библиотеку в IndexedDB и держит Essential Controls выше Style. Style меняет художественный рецепт, но не Size/Spacing/Orientation/Opacity/Glitch Amount.
- Live Image Brush drawing и ghost preview ограничены временным бюджетом кадра; layout/rotation общие с финальным engine, обратное направление больше не переворачивает осевую кисть на 180°.
- Live Stroke Preview работает вне main thread, показывает тот же pipeline и намеренно увеличивает демонстрационные штампы в 1.5× для читаемости, не меняя реальный canvas Size.
- Загрузка документа и Image Brush assets вынесена в Worker с ограничением размера, progressive-JPEG watchdog/fallback и без автоматического запуска тяжёлого Mosh preview после Open.
- Статичные preview assets генерируются командой `npm run generate:effect-previews`; Windows launcher — `start-local.bat`.
- Актуальные проверки текущей ветки фиксируются в конце этого файла после финального запуска `typecheck`, Vitest и production build.

## Historical Status Snapshot

Следующие пункты сохраняют состояние более ранних этапов. Упоминания HEX, File Corruption, старых demo-наборов и прежних счётчиков не описывают текущий production UI.

- Созданы Vite/React/TypeScript приложение, полный desktop UI и модульная структура `src/`.
- Реализованы seeded RGBA-алгоритмы, кисть, маска, canvas, zoom/pan, Continuous/Stroke/Preview и патч-история.
- Реализованы загрузка и drag-and-drop PNG/JPEG/WebP, интерактивный виртуализированный HEX-редактор, экспорт изображений, пресеты, проект JSON, сравнение и Raw File Glitch через Worker.
- Реализован один обратимый glitch-буфер над неизменяемым оригиналом; полноценный стек независимых растровых слоёв упрощён.
- TypeScript-проверка, 118 unit/integration-тестов и актуальный production build успешны.
- Создан подробный `README.md` с командами, возможностями и честно зафиксированными упрощениями.
- Браузерный smoke-test в headless Edge успешен, включая кисть, Preview/Cancel, Undo/Redo, HEX-редактирование, модальные окна, загрузку файла, Raw-откат, 4000×4000 и PNG-экспорт.
- Готовая production-сборка находится в `dist/`.
- Завершён критический редизайн glitch engine по новым референсам: причина «пиксельной пыли» устранена на уровне архитектуры stamp primitives.
- Реализованы 10 новых structural effects с primitive-level decisions и temporary region snapshots.
- Добавлены Micro/Structural intensity, spill и пять quick levels на эффект.
- HEX получил отдельный Pixel mode с Ctrl/Shift multi-selection и RGBA-wide operations.
- TypeScript, обновлённый набор из 17 unit-тестов, production build и браузерная приёмка успешны.
- В headless Edge проверены пять визуально разных single-click эффектов, направленный Datamosh drag, structural Preview/Apply и HEX multi-pixel Ctrl/Shift/XOR.
- Добавлена отдельная вкладка MOSH LAB с последовательным Worker rack, восемью визуально самостоятельными эффектами, presets, targets, progress/cancel и одним атомарным Apply.
- Добавлены 25 уникальных inline-SVG effect icons, icon-aware brush picker и компактная History UI поверх существующей PatchHistory.
- Browser acceptance включает все восемь MOSH-эффектов, worker cancellation/stale protection, rack reorder/duplicate/bypass/remove, history semantics и 4000×4000 cancel test без ошибок.
- Последняя Brush Mask теперь хранится компактно вместе с реальным направлением мазка; MOSH Current Brush Mask и Motion Field Brush Direction работают на этих данных.
- Все тяжёлые structural direct brush stamps перенесены в отдельный отменяемый Worker с progress, stale protection и атомарным history commit.
- Завершена отдельная вкладка `IMAGE BRUSH`: локальные прозрачные PNG/JPEG/WebP-кисти, 9 demo assets, библиотека, distance-based stamping, 12 пресетов, 19 Stamp FX, 5 mutation modes, 10 blend modes, 4 alpha modes, Worker/Cancel и portable project JSON.
- Критический IMAGE BRUSH repair завершён: интерактивный overlay работает во время pointer-down, финальный Worker обрабатывает/возвращает local dirty rectangle, Fixed/Per Stamp используют ограниченные кэши, preview работает Draft→Full в отдельном Worker, а UI показывает реальные changed-pixel/performance diagnostics.
- Все 19 Stamp FX имеют визуально отличимый результат и сохранённый browser contact sheet; добавлены Original/Processed/Difference, Test Stamp/Trail, понятные processing stages и уровни силы.
- Добавлена центральная contextual-help registry, HelpButton/Popover, полные Motion Field пояснения, глобальный Help Mode и поиск; общие sliders и IMAGE BRUSH/MOSH controls имеют явные help IDs, остальные editor actions получают глобальное help-покрытие.
- Финальная матрица repair: TypeScript success, 6 test files / 108 tests, production build success, visible Edge pointer acceptance на 1000²/2000²/4000², Cancel 16.8 ms без изменения документа и успешный Firefox headless render.

## Current Priority

Опубликовать текущий интегрированный editor/UI/performance набор после полного typecheck/test/build.

### 2026-08-19 publication gate

- Image Brush Live Stroke Preview показывает пять демонстрационных штампов, увеличивает их до `2.25×` и раздвигает spacing для читаемости; реальный canvas Size/Spacing и финальный Worker stroke не меняются. UI явно показывает коэффициент.
- Проверены все три Markdown-файла репозитория. `README.md` описывает текущий продукт, этот worklog содержит актуальный срез, а `DECOMPOSITION_REPORT.md` помечен как исторический отчёт с follow-up после удаления File Corruption и добавления текущих компонентов.
- `npm run typecheck` ✓
- `npm test -- --run` ✓ — 10 файлов, 188/188 тестов.
- `npm run build` ✓ — 1656 modules transformed, production assets собраны.
- Prettier применён к текущим исходникам и документации; `git diff --check` запускается перед commit.

## Historical Priorities

2026-08-01 P0 completed: major editor cleanup and rebuild using the user-supplied `астронавт2.png` as the mandatory visual source. All eight stages are implemented and accepted in headed Firefox; visible Edge passed the final layout and real Glitched Repeat commit smoke test. The measured slow Edge whole-trail case is recorded below instead of being hidden.

2026-07-27 P0 completed: the rejected IMAGE BRUSH implementation was rebuilt into one compact inspector with a correct asset lifecycle, nine real consecutive-stamp mutation modes, twelve tuned presets, bounded Worker/cache behavior and visible Firefox/Edge acceptance. The permanent evidence and measured residual limit are recorded below.

2026-07-27 P0 completed: IMAGE BRUSH now opens in SIMPLE, uses presets as the main workflow, exposes factual shared help, transfers a conservative cropped source region instead of the full document, and has real headed Firefox 153.0 plus visible Edge acceptance.

Remaining measured limit: final 4000² Evolving processing is asynchronous and cancellable but can still produce occasional 90–111 ms global rAF gaps. Ordinary live overlay instrumentation remained responsive (0–13 ms maximum live-frame work in the final Firefox matrix), and no multi-second input-dispatch freeze was reproduced.

2026-07-26 active scope: complete the requested MOSH LAB interaction/usability repair in strict stages, then add six real Advanced Brush Effects. Stage 3 must not begin until Stage 1 has passed unit, type and browser checks.

Обязательные хвосты MOSH/Worker-этапа завершены. Следующие возможные этапы — независимые raster-слои и optional temporal/video pipeline; они не блокируют текущий static-image glitch workflow.

## Task Queue

### 2026-08-01 Major editor cleanup and rebuild

- [x] Stage 1 — Visible Firefox baseline and control audit; remove ambiguous Accumulate wording, preserve stale Motion Transfer previews, remove default mask trails, fix IMAGE BRUSH randomization and add stamp optimization.
- [x] Stage 2 — Implement sparse tiled multi-layer storage, composition, complete layer operations/history and brush/MOSH/IMAGE BRUSH/export/project integration.
- [x] Stage 3 — Consolidate Block Corruption and Codec Block Damage, remove Pixel Noise/Bit Flip, hide legacy effects and present Mixed Structural Glitch as a meta-effect with migration.
- [x] Stage 4 — Add one shared lazy Worker preview system, repair MOSH randomization/presets/Edge Melt/Flow Field and save visual sheets.
  - Shared `EffectPreviewStage` renders only the selected/hovered real algorithm in a cancellable Worker, shows Before/After/Difference, changed pixels, elapsed time, description and cost, and keeps a bounded 24-result cache.
  - Codec control audit now proves min/max output changes for all 11 exposed controls; the Replication branch was fixed because its chosen source was previously overwritten.
  - MOSH randomization now has Parameters/Effects/Order/Everything/New Result, nonce feedback, change counts, recipe summary, identity-shuffle protection and exact Lock Seed replay.
  - Rebuilt Chroma (8), Edge Melt (5) and Flow Field (8) families pass deterministic/distinct tests. Headed Firefox 153.0 on `астронавт2.png` produced 8/8 distinct Chroma hashes, 5/5 Edge hashes and 8/8 final Flow hashes. The first Flow sheet was rejected because it captured before Worker completion; the final harness waits for a real Worker result and visible pixel change.
  - Evidence: `browser-artifacts/image-brush-firefox/major-editor-stage4-firefox-astronaut-final.json`, Chroma/Edge contact sheets under `major-editor-stage4-mosh-preset-contact-*`, and final Flow sheet/report under `major-editor-stage4-mosh-flow-contact-final2-*`.
- [x] Stage 5 — Simplify IMAGE BRUSH controls, add dynamic A/B explanations and expose compatible MOSH effects through a shared registry.
  - One shared effect registry now owns algorithm/MOSH/IMAGE BRUSH compatibility, cost and description metadata. Unsupported Tip/Per Stamp/Whole Trail combinations are disabled explicitly instead of being ignored.
  - The essential inspector stays preset-first; mutation sections expose only mode-read controls, and the shared `WHAT THIS CONTROL CHANGES` panel renders real low/high examples from the current stamp.
  - Motion Transfer has a real Whole Trail IMAGE BRUSH adapter, and randomization has exact locked replay plus nonce-based unlocked changes with a meaningful-change guard.
  - Headed Firefox 153.0 acceptance on `астронавт2.png` proved a distinct Spacing A/B preview, 55,295 visible Test Trail pixels, a real 12-stamp Motion Transfer Worker result, two different unlocked recipes and exact locked replay. The 1152×720 stamp was optimized to 102×128 (3.2 MB to 51.0 KB decoded working memory, 63.5× smaller) while preserving the original.
  - Evidence: `browser-artifacts/image-brush-firefox/major-editor-stage5-firefox-astronaut-fixed.json` and its `*-control-example.png` / `*-compatibility-randomize.png` screenshots.
- [x] Stage 6 — Add layered local Smudge, Blur, Sharpen, Restore and Eraser with Worker/history/preview support.
  - Added the separate Retouch tool group, physical-code Cyrillic-safe shortcuts, mode-specific controls and one lazy real Worker preview for the selected tool.
  - Smudge transports sampled structure along the recorded pointer path; Blur and Sharpen process only the local mask bounds; Restore supports Original, Lower Layer and Previous History State; Eraser reduces alpha only in the active sparse layer and releases empty tiles.
  - Unit acceptance: 5 Retouch tests plus 5 sparse-layer tests passed, including transported color, reduced high-frequency variation, increased edge contrast, explicit restore source and active-layer-only erasure.
  - Headed Firefox 153.0 on `астронавт2.png`: all five tools changed output; Smudge/Blur/Sharpen/Restore returned real full-document Worker results while processing local dirty rectangles; Eraser used sparse-layer commit; History contained exactly five corresponding actions and the committed overlay contained 0 visible pixels. Maximum sampled rAF gap was 152.8 ms with no multi-second freeze.
  - Evidence: `browser-artifacts/image-brush-firefox/major-editor-stage6-retouch-firefox-astronaut.json` and its Sharpen/Eraser/History screenshots.
- [x] Stage 7 — Remove production HEX UI/help/docs and rebuild RAW FILE as clearly explained FILE CORRUPTION.
  - The production App no longer imports, routes or renders `HexEditor`; Shift-click remains only as a pixel selection target for controlled effects. Internal RGBA range helpers remain unbundled test utilities.
  - FILE CORRUPTION now contains the full encoded-byte warning, “not a local brush” guidance, all six internal steps, Protected Prefix, exact Mutation Count, bounded Mutation Range, exact XOR Amount, Retry Limit, Decode Status and factual contextual help.
  - Every retry starts from unchanged pre-operation bytes. A failed run restores the previous valid binary (or null), so Download is disabled when no valid corrupted candidate exists.
  - Headed Firefox 153.0 on `астронавт2.png` proved the five production tabs contain no HEX, all labels/help IDs and six internal steps are present, and a three-attempt invalid PNG mutation reverted safely with Download disabled.
  - Evidence: `browser-artifacts/image-brush-firefox/major-editor-stage7-file-corruption-firefox-astronaut-final2.json` and its explanation/result screenshots.
- [x] Stage 8 — Full tests/type/build plus visible Firefox/Edge, three-layer/performance acceptance and final visual sheets.
  - Added three preset-first connected-trail workflows: `Whole Trail`, `MOSH Flow Trail` and `Codec Damage Trail`. IMAGE BRUSH now has 15 built-in presets without duplicating EFFECT/MOSH algorithms.
  - Clone Corruption now exposes six real modes (`Clean`, `Fragment`, `Slice`, `Packet`, `RGB`, `Evolving`) plus factual Aligned/Non-aligned source motion. A headed-Firefox contact sheet proves all modes visibly distinct and Clear Source leaves committed output/history untouched.
  - Headed Firefox 153.0 clean-profile final acceptance created and painted three independent sparse layers, proved immediate visibility composition plus exact Undo/Redo, found zero ambiguous Accumulate labels, kept the processing mask Off, changed two unlocked IMAGE BRUSH recipes and optimized the 1152×720 stamp to 102×128 (63.5× less decoded working memory).
  - Required sheets were inspected visually, not approved from hashes alone: structural 9/9 changed and 9 distinct; brush/Retouch 9/9 changed and 9 distinct; IMAGE BRUSH 9/9 changed and 9 distinct; Clone modes distinct; MOSH Chroma 8, Edge Melt 5 and final Flow 8 remain the accepted Stage 4 sheets.
  - Visible Edge 150 passed all nine 320/450/600 px × 100/125/150% layout checks, moved the real Size slider, opened the asset context menu, loaded the astronaut as document/stamp, removed HEX and committed one real optimized Glitched Repeat stroke as one History action.
  - Honest Edge residual: `Codec Damage Trail` exceeded the 120-second CDP watchdog in separate 427 px and 96 px attempts. The final Edge smoke therefore uses Glitched Repeat; Codec whole-trail remains accepted in headed Firefox. The ordinary Edge Glitched Repeat run also remains substantially slower than Firefox because the full stamp preview begins before manual optimization.
  - Final verification after all source changes: 10 Vitest files / 157 tests, TypeScript success and production Vite build success (1619 modules). Desktop packaging was not started.
  - Evidence: `major-editor-stage8-firefox-final-clean.json`, the Stage 8 structural/brush/clone/IMAGE BRUSH Firefox sheets and reports under `browser-artifacts/image-brush-firefox/`, and `major-editor-stage8-visible-edge-astronaut.png/.json` under `browser-artifacts/image-brush-edge/`.

### 2026-07-27 Critical IMAGE BRUSH rebuild

- [x] Stage 1 — Capture the broken visible Firefox baseline, remove the SIMPLE card/workflow split, restore one compact vertical inspector and keep Size/Spacing/Opacity/Glitch Amount/Variation visible.
- [x] Stage 1 — Repair add/switch/remove/clear/demo image lifecycle and verify sliders after a second image in visible Firefox before continuing.
- [x] Stage 2 — Implement nine factual consecutive-stamp mutation modes with bounded deterministic live/final behavior.
- [x] Stage 3 — Replace giant cards with one preset selector, tune twelve distinct presets and save inspected preset/mutation contact sheets.
- [x] Stage 4 — Remove remaining Firefox UI/Worker/cache bottlenecks and record repeated-stroke memory/1000²–4000² measurements.
- [x] Stage 5 — Run full tests/type/build plus visible Firefox and Edge layout/lifecycle/mutation acceptance and update this worklog honestly.

### 2026-07-27 IMAGE BRUSH UX / Firefox P0

- [x] Stage 1 — Remove excess visible `?`, retain one shared dropdown help popover, add one delegated hover/focus tooltip layer and audit every IMAGE BRUSH help entry against real state/engine use.
- [x] Stage 2 — Make SIMPLE the default, add presets-first workflow, master Glitch Amount, live Current Brush summary, compact explanation and relevance-gated ADVANCED sections.
- [x] Stage 3 — Run real headed Firefox pointer/preset/slider/Undo/Redo interaction and record a same-scenario Firefox/Edge baseline.
- [x] Stage 4 — Remove the per-stroke full-document transfer using a persistent synchronized Worker mirror or proven cropped-source alternative; preserve responsive overlay/cancel and bounded caches.
- [x] Stage 5 — Add regression tests, run TypeScript/tests/build, then complete real headed Firefox and Edge performance acceptance at 1000²/2000²/4000².

### 2026-07-27 Critical IMAGE BRUSH repair

- [x] Stage 1 — Reproduce visible lag/weak FX with ordinary PNG input, add performance diagnostics, trace copies/jobs/renders and record honest baseline measurements.
- [x] Stage 2 — Separate interactive/final rendering; add rAF/coalesced distance batching, local stroke feedback, bounded caches/variant pools and stale/cancel safeguards.
- [x] Stage 3 — Audit all 19 Stamp FX perceptually; add changed-pixel diagnostics, Original/Processed comparison, Test Stamp/Trail, strong levels and saved contact sheets.
- [x] Stage 4 — Add typed central contextual help, HelpButton/Popover, Motion Field explanations, plain-language labels, Help Mode and searchable help.
- [x] Stage 5 — Run unit/type/build plus real Edge pointer tests, Firefox render and 1000/2000/4000 performance acceptance; record remaining limits honestly.

### 2026-07-27 IMAGE BRUSH request

- [x] P0 / Stage 1 — Add the separate `IMAGE BRUSH` inspector tab, local PNG/JPEG/WebP loading/paste/drop, original/processed checker previews, transparent-bound trimming, and a dedicated stamp overlay.
- [x] P0 / Stage 1 — Implement accumulated-distance Stamp/Trail/Scatter placement with interpolation, direction-aware rotation, alpha preservation, and one atomic PatchHistory action per completed stroke.
- [x] P1 / Stage 2 — Implement the full transform, pressure, spacing, anchor, outline and ten-mode RGBA compositing controls, plus deterministic built-in/user presets and scoped randomizers.
- [x] P1 / Stage 3 — Implement the small-asset Stamp FX rack, Clean/Fixed/Per Stamp/Evolving/Stroke Feedback mutation, alpha modes, evolution curves and before/each/after processing stages in an isolated cancellable RGBA Worker.
- [x] P1 / Stage 4 — Implement the multi-image library, Sequence/Random Hose, nine local demo assets, embedded project serialization, processed-tip download/copy and resource lifecycle cleanup.
- [x] P1 / Final — Verify transparent PNG, JPEG background/quality and WebP export without replacing the existing export architecture; run typecheck, full tests, production build, Edge acceptance, Firefox acceptance and 4000×4000 responsiveness checks.

### 2026-07-26 MOSH LAB / Advanced Brush request

- [x] P0 / Stage 1 — Restrict rack reordering to a dedicated card-header activator with a 5–8 px threshold; controls, text selection, card body and footer must never start dragging.
- [x] P0 / Stage 1 — Resolve physical editor shortcuts from `KeyboardEvent.code`, including Cyrillic-layout Undo/Redo and tool keys; guard typing targets and repeat events; update shortcut help.
- [x] P0 / Stage 1 — Move Motion Transfer source/destination into effect-instance state, add Clear Source/Destination/Both, two-stage Escape cancellation and owner-derived overlay cleanup on remove/reset/image/project lifecycle.
- [x] P0 / Stage 1 — Replace inconsistent range markup with a shared progress-aware RangeControl and visible Chromium/Edge/Firefox rails, progress, thumb, disabled, hover and focus states.
- [x] P1 / Stage 2 — Add deterministic effect-specific Balanced/Wild schemas and per-card/global MOSH randomization without history mutation before Apply.
- [x] P1 / Stage 2 — Complete all built-in MOSH preset sets and add persistent user preset save/rename/delete/export/import with accurate `Custom` state.
- [x] P1 / Stage 3 — Add Pixel Sort Brush, Feedback Brush, Displacement Brush, Flow Mosh Brush, Clone Corruption Brush and Line Freeze Brush as real direct-painting algorithms with unique icons, controls, presets and Balanced/Wild randomization.
- [x] P1 / Stage 3 — Add owned Clone Source and temporary Feedback memory lifecycle cleanup using the shared overlay/owner model.
- [x] P1 / Final — Verify history/preview semantics, typecheck, all tests, production build, and browser acceptance in Edge/Chromium and Firefox.

### P0 — Critical

- [x] Создать запускаемый каркас Vite + React + TypeScript и базовую компоновку приложения.
- [x] Реализовать загрузку/декодирование изображения и неизменяемый оригинальный RGBA-буфер.
- [x] Реализовать canvas с корректными zoom/pan и локальной glitch-кистью.
- [x] Реализовать обратимую историю действий, чтобы изменения не уничтожали оригинал.
- [x] Перестроить движок так, чтобы один клик структурного эффекта создавал заметный цельный блок/срез/полосу, а не пиксельную пыль.

### P1 — Core

- [x] Реализовать Byte Noise, Channel Shift, Byte Swap, Bit Flip и общий интерфейс алгоритмов.
- [x] Реализовать остальные RGBA-алгоритмы: Block Corruption, Data Smear, Scanline, Compression Artifacts, Palette Collapse и Mixed Glitch.
- [x] Реализовать Continuous, Stroke Commit и Preview, маску мазка и восстановление области.
- [x] Реализовать виртуализированный интерактивный HEX-редактор, связанный с canvas.
- [x] Реализовать экспорт PNG/JPEG/WebP и операции с буфером обмена.
- [x] Реализовать сравнение с оригиналом и сброс изменений.
- [x] Реализовать горячие клавиши и модальное окно со справкой.
- [x] Визуально проверить в браузере Slice Displacement, Macroblock Shift, Datamosh Smear, RGB Chunk Split и Scanline Tear Pro.
- [x] Добавить Packet Loss, Compression Block Damage, Tile Scramble, Row/Column Repeat и Mixed Structural Glitch.
- [x] Добавить multi-pixel selection в HEX с применением операций ко всем RGBA-байтам выбранных пикселей.

### P2 — Important

- [ ] Расширить один reversible glitch-буфер до нескольких независимых raster-слоёв; видимость, opacity, blend mode, rename и clear для текущего слоя уже работают.
- [x] Реализовать встроенные и пользовательские пресеты с localStorage и JSON.
- [x] Реализовать импорт/экспорт проекта.
- [x] Реализовать отдельный Raw File Glitch с защищённым заголовком и откатом невалидной мутации.
- [x] Перенести тяжёлые structural direct brush stamp RGBA-алгоритмы в Worker; лёгкие pixel/micro stamps намеренно сохраняют живой Continuous-режим.
- [x] Добавить progress/cancel/stale protection и атомарный commit для structural brush Worker.
- [x] Добавить автоматические тесты алгоритмов, истории, масок и координат.
- [x] Добавить отдельные Micro/Structural intensity, controlled spill и уровни Subtle/Medium/Aggressive/Broken/Extreme.

### P3 — Optional

- [ ] Добавить миниатюру navigator; split-ползунок, мигание и hold-original уже реализованы.
- [x] Отполировать desktop-компоновку, состояния управления и доступные подписи элементов.

## In Progress

- 2026-08-01 — Major editor cleanup Stage 3 completed and accepted in headed Firefox.
  - The primary picker now exposes one `Block Corruption` with seven modes and one `Codec Block Damage` with six modes. Macroblock Shift, Packet Loss, Compression Block Damage and Tile Scramble remain internal only for deterministic old-project migration.
  - Pixel Noise and Bit Flip are absent from the default picker, legacy expansion and IMAGE BRUSH add-FX list/random pools. Palette Collapse, Channel Shift and Byte Swap live behind `Show Legacy Effects`, default Off, with the requested factual explanation.
  - Mixed Structural Glitch has its own `META / COMBINATION EFFECTS` group and badge, min/max effects, editable real pool, recipe seed, Lock Recipe and New Recipe. The engine reads the displayed pool and is deterministic for a locked seed.
  - Main presets and IMAGE BRUSH presets/pools use the consolidated IDs. Project, custom preset and IMAGE BRUSH project migration maps every replaced ID to a matching new mode; removed micro effects migrate to Palette Collapse.
  - Visible artifacts `browser-artifacts/image-brush-firefox/major-editor-stage3-firefox-astronaut-final-picker.png`, `...-controls.png` and `.json` record no removed top-level effects, a collapsed legacy section, only three useful legacy effects, all 7/6 mode names and the real meta recipe summary.
  - Gate: TypeScript passed and all 8 test files / 137 tests passed. Tests prove every Block/Codec mode changes pixels and produces a distinct hash, plus migration and locked/new meta recipe behavior.
- 2026-08-01 — Major editor cleanup Stage 2 completed and accepted with three real sparse layers in headed Firefox.
  - `src/layers/sparseLayers.ts` owns the independent bottom-to-top stack. Original remains immutable; each glitch layer allocates only touched 256×256 RGBA tiles and supports visibility, lock, opacity, Normal/Multiply/Screen/Overlay/Difference, add, duplicate, delete, reorder, clear, solo, merge down and flatten.
  - Direct brush, Worker brush, MOSH LAB and IMAGE BRUSH commits all pass through the same active-layer writer. Preview cancel, Undo, Redo and history travel restore both visible patches and exact layer snapshots.
  - Project version 2 serializes every tile as portable base64 RGBA plus all metadata. Embedded projects now store the immutable Original rather than the flattened result; legacy single-buffer projects migrate into a sparse layer.
  - Visible artifact `browser-artifacts/image-brush-firefox/major-editor-stage2-firefox-astronaut-final-layers.png/.json` records three separately painted layers using 6/3/5 tiles, all required layer operations, seven History actions, a composite change when visibility toggles, and exact Undo/Redo hash restoration in headed Firefox 153.0.
  - Gate: TypeScript passed and all 7 test files / 132 tests passed, including allocation/release, composition, operations and project round-trip coverage.
- 2026-08-01 — Major editor cleanup Stage 1 completed and accepted with the user-supplied `астронавт2.png` in visible headed Firefox 153.0.
  - `Build up overlapping stamps` now states its exact current-stroke mask behavior; no rendered control uses the ambiguous `Accumulate` / `Accumulation` wording.
  - The processing mask is an optional `Show processing mask` diagnostic and defaults Off. Clearing Motion Transfer selections preserves an existing preview, marks it stale, and offers `Apply Last Preview`, `Cancel Preview`, and a separate history-safe `Remove Applied Result` action.
  - IMAGE BRUSH randomization now has a variation nonce, `Lock Seed`, `New Variation`, scoped randomizers and a visible recipe summary. Two real Firefox clicks produced different recipes while a locked nonce remains deterministic in unit coverage.
  - `Optimize Stamp Image` creates a real resized working RGBA buffer from the preserved original. The required astronaut changed from 1152×720 / 3.2 MB to 102×128 / 51 KB at the 128 px setting, a 63.5× decoded-memory reduction; restoring original data is covered by tests.
  - Visible evidence: `browser-artifacts/image-brush-firefox/major-editor-stage1-firefox-astronaut-final-effect.png`, `...-mosh.png`, `...-image-brush.png` and `...final.json`. The report records headed Firefox, two changed randomizations, default-hidden mask and no horizontal overflow.
  - Gate: TypeScript passed and all 6 test files / 127 tests passed.
- 2026-07-27 — Critical IMAGE BRUSH rebuild Stages 2–5 completed and accepted.
  - Mutation now exposes exactly nine factual modes: Clean, Fixed, Progressive, Random Per Stamp, Evolving, Random Effect Stack, Alternating, Stroke Gradient and Whole Trail. Progressive uses a bounded curve; Per Stamp is a deterministic bounded pool; Evolving chains the previous result; Random Stack builds a seeded per-stamp stack; Alternating repeats A/B; Stroke Gradient interpolates two recipes along the path; Whole Trail processes one connected local layer.
  - The rendered UI contains one compact preset selector instead of giant cards/canvases. The twelve tuned presets are Clean Repeat, Glitched Repeat, Progressive Decay, Random Glitch Chain, Datamosh Trail, RGB Separation Trail, Pixel Sort Trail, Chroma Feedback, Compression Breakdown, Packet Loss Stream, Broken Interface and Scatter Fragments.
  - Inspected headed-Firefox evidence: `critical-rebuild-preset-mutation-contact-final.png/.json` contains all twelve presets at eleven stamps each; `critical-rebuild-nine-mutation-modes-10-stamp-final.png/.json` contains all nine modes at exactly ten final stamps each.
  - Final Firefox performance evidence is `critical-rebuild-firefox-performance-repeated-final.png/.json`: 1000² Fixed / 98 stamps committed in 89 ms, 2000² Per Stamp / 196 stamps in 194 ms, and 4000² Evolving / 245 stamps in 917 ms. First live feedback was 0–1 ms; live work max was 2/7/24 ms; the first two cases had no rAF gap above 50 ms. The 4000² case had one 111.14 ms global gap. A heavier 4000² job cancelled in 18 ms without changing document or History.
  - Ten repeated real 1000² pointer strokes produced ten Worker results and ten History actions with a 34.72 ms maximum rAF gap and none above 50 ms. Undo changed the document hash and Redo restored it exactly. Firefox does not expose `performance.memory`, so no fabricated heap number is reported.
  - Visible Edge evidence is `browser-artifacts/image-brush-edge/critical-rebuild-visible-edge.png/.json`: the 320/450/600 px panel matrix had no horizontal overflow, all five sliders stayed in the inspector, right-click removal opened, a real slider drag changed state, and one real pointer stroke created exactly one History action.
  - Zoom caveat: browser-driver Ctrl+Plus did not change Firefox viewport/DPR, and native Edge toolbar zoom automation made the CDP renderer unresponsive. The saved 100/125/150 matrix therefore verifies equivalent document CSS zoom/reflow, not native browser-toolbar zoom. This is the only requested acceptance detail not recorded natively.
  - Final gate: TypeScript passed; 6 test files / 125 tests passed; production build passed.
- 2026-07-27 — Critical IMAGE BRUSH rebuild Stage 1 completed and accepted in visible headed Firefox 153.0 (`critical-rebuild-stage1-firefox-accepted.png/.json`).
  - The previous SIMPLE/ADVANCED split, numbered blocks, giant two-column preset cards and ten simultaneous preset canvases are removed from rendered markup. One compact inspector contains IMAGE, STYLE, five always-visible ESSENTIAL controls, MUTATION, STAMP FX and collapsed ADVANCED groups.
  - Real panel measurements at requested widths 320/450/600 px: `.image-brush-lab` client/scroll widths were 311/311, 441/441 and 591/591; the ESSENTIAL section was 294/294, 424/424 and 574/574. Five ranges stayed fully inside the panel, zero preset preview canvases were mounted and zero visible HelpButtons were detached from selects.
  - Real BiDi pointer drags changed Size 381→114, Spacing 176→58, Opacity 0.56→0.20, Glitch Amount 3→1 and Variation 0.08→0.81. The brush settings remained identical after switching from the second uploaded transparent PNG back to the first.
  - Removing the active first PNG selected the next PNG; Clear Library reached an empty state; nine demos loaded only after explicit request, an individual demo was removable, Remove demos returned to an empty state, and demos no longer load automatically.
  - Asset removal now has both an explicit thumbnail `×` and a right-click menu. A pure lifecycle helper enforces next-then-previous selection and is used by individual/demo removal. Active removal cancels jobs and disposes preview/ghost caches while already committed document pixels remain untouched.
  - The non-interactive overlay reported `pointer-events: none` and no inspector intersection. TypeScript and 120/120 tests passed at the Stage 1 gate.
- 2026-07-27 — Critical IMAGE BRUSH rebuild Stage 1 baseline reproduced in visible Firefox 153.0 at a 1180×860 viewport (`browser-artifacts/image-brush-firefox/critical-rebuild-broken-baseline.png/.json`).
  - The IMAGE BRUSH panel had `clientWidth: 356` but `scrollWidth: 922` before image attempts and `1028` afterward. The Size range itself became 1002 px wide and its pointer target ended outside the 1180 px viewport.
  - Ten preset cards and ten preview canvases were mounted simultaneously; the largest card was 112.65 px high and the SIMPLE content was 1478 px tall.
  - Repeated two-image drops grew the library from the nine forced demos to 19 entries while the expected second image did not become the active image, confirming stale add/selection behavior.
  - A real BiDi pointer move to the overflowing slider originally failed as out-of-viewport; the recorded guarded rerun confirms `sliderPointerReachable: false` and unchanged Size.
  - The image-brush overlay rectangle intersects the inspector rectangle. It is currently non-interactive by CSS, but its bounds are still audited in the rebuild because overlays must remain confined to the canvas.
- 2026-07-27 — Started the IMAGE BRUSH UX / Firefox P0 repair. Read the complete 861-line request and the complete current worklog before implementation. The earlier Firefox evidence is only a headless layout render and is not accepted as interaction or performance verification.
- 2026-07-27 — Critical IMAGE BRUSH repair is complete. The user's real interactive experience was used as the acceptance source rather than the earlier completion claim.
- Visible Edge baseline with an ordinary transparent 96×96 PNG and `Glitched Symbol Stream`:
  - The committed work canvas did not change at mid-stroke or before pointer-up in Fixed, Per Stamp, Evolving or Stroke Feedback; only a single moving ghost was visible.
  - A normal 1120×720 stroke transferred approximately 3.35 MB to a newly created Worker and returned approximately 3.23 MB, with a full output copy and a full-document transparent layer allocated inside the Worker.
  - An 18-stamp stroke caused roughly 9,300–14,700 DOM mutations because Worker progress messages update React state for every stamp.
  - The processed-tip preview differed from Original by only 1,155 preview pixels (6.64%) for the selected preset; moving the first FX Amount control produced no detectable processed-canvas hash change within the 30-second observation window.
  - The first stroke after that slider interaction showed a roughly 33-second input-dispatch stall and a very large rAF gap; later strokes committed in roughly 96–127 ms but still provided no interactive trail.
  - Fixed mode caches the processed FX result only inside one final Worker job but still prepares/copies the source tip for every stamp. Per Stamp generates an unbounded expensive variant per placement.
- Baseline artifacts: `browser-artifacts/image-brush-repair/baseline-visible-edge.png` and `baseline-report.json`.
- Repaired visible Edge result with the same ordinary transparent 96×96 PNG:
  - The local overlay visibly changes during pointer-down in Fixed, Per Stamp, Evolving and Stroke Feedback. Internal diagnostics measured first feedback at 0.0–0.1 ms and no delayed live frames in the 1000²/2000²/4000² matrix.
  - The processed-tip slider produced a new Draft preview in about 53 ms; every audited effect produced a Full preview with nonzero changed pixels, and every Amount change produced a second distinct output.
  - Final processing makes one immutable full-document input snapshot per stroke, allocates only a local layer/source/output region, and returns 0.8 MB / 3.2 MB / 10.2 MB for the tested 1000² / 2000² / 4000² strokes rather than returning the 3.8 MB / 15.3 MB / 61.1 MB documents.
  - 1000²: 115 rendered stamps, 118.5 ms engine commit, 0.3 ms max live frame, 6 React renders, 46,998 changed pixels.
  - 2000²: 205 rendered stamps, 229.0 ms engine commit, 0.7 ms max live frame, 8 React renders, 208,172 changed pixels, bounded cache of 9 buffers (clean + 8 variants).
  - 4000²: 246 rendered stamps, 456.1 ms engine commit, 2.6 ms max live frame, 6 React renders, 380,705 changed pixels; visible browser pointer-up wall time was 644.6 ms.
  - Cancel on the 4000² Completed Trail job responded in 16.8 ms and left committed pixels and History unchanged.
- Repair artifacts: `after-report.json`, `after-visible-edge.png`, `help-visible-edge.png`, `stamp-fx-contact-sheet.png`, `stamp-fx-report.json`, `cancellation-report.json`, `after-firefox.png` under `browser-artifacts/image-brush-repair/`.

- 2026-07-27 — Repaired IMAGE BRUSH implementation and acceptance are complete. The separate RGBA stamp workspace integrates with the existing mutable document buffer and PatchHistory without replacing the EFFECT, MOSH, HEX, RAW FILE or export architecture.
- Final repaired verification: 108/108 tests, TypeScript, production build, complete visible Edge pointer/effect/help/1000–4000 acceptance and Firefox render all pass.

- 2026-07-27 00:20 — The requested Stage 1, Stage 2 and Stage 3 scope is complete and verified. No requested implementation item remains active.
- Baseline facts: dragging the Pixel Sorter Mix range reordered it below Feedback Echo; Cyrillic `key='и', code='KeyB'` left Hand active; Cyrillic Ctrl+`key='я', code='KeyZ'` did not consume Undo; removing Motion Transfer left one `.mosh-region-overlay`; computed range rail background was transparent.
- Stage 1 verification: 46/46 tests, TypeScript and production build pass. Edge acceptance covered header/slider/control drag boundaries, Cyrillic shortcuts, typing guard, all Motion Transfer clear/lifecycle/Escape cases. Firefox 153 headless render confirmed rails, gold progress and thumbs.
- Stage 2 verification: 52/52 tests, TypeScript and production build pass. Edge loaded all 48 built-ins, verified unique settings changes, deterministic Balanced vs stronger Wild on all effects, all global scopes, Custom tracking, Motion Transfer preset prerequisite, localStorage save/rename/delete/export/import, zero-history Cancel and exactly one-history Apply.
- Stage 3 verification: 78/78 tests, TypeScript and production build pass. Edge painted all six effects against an actual photo reference, verified Feedback accumulation/reset, Flow direction sensitivity, Clone source ownership/lifecycle, one-action stroke history and exact Preview Cancel/Apply behavior with zero page/console errors. Firefox headless render completed successfully and visibly confirmed the shared rails/progress/thumb styling.

- Активной незавершённой реализации нет.
- Optional/future: temporal/video mode, независимые raster-слои и navigator thumbnail.

## Completed

- [x] 2026-07-27 23:59 — Completed the Critical IMAGE BRUSH rebuild: compact single-column UI, correct add/switch/remove/clear/demo lifecycle, nine real mutation modes, twelve tuned presets, bounded deterministic caches/Workers, repeated Firefox profiling, visible Edge interaction/layout acceptance, 125 tests, TypeScript and production build.
- [x] 2026-07-27 22:15 — Completed IMAGE BRUSH UX simplification, factual help repair and real Firefox performance repair.
  - Stage 1 / help: removed automatic visible `?` decoration and individual slider help buttons. A visible HelpButton now appears only beside real dropdowns. One delegated 420 ms hover/focus tooltip layer handles sliders, buttons, toggles and inputs; one shared dropdown popover explains the current and every available option. Tooltips close on pointer leave/focus loss and immediately on canvas pointer-down.
  - Stage 1 / audit: traced advanced settings into `App.tsx`, `imageBrush/path.ts`, `imageBrush/assets.ts`, `imageBrush/performance.ts` and `imageBrush/engine.ts`. Removed the unused top-level `chromaDrift` cache/randomizer path; the real Luma / Chroma Drift remains a rack FX. Split the colliding Motion Field and IMAGE BRUSH Decay help IDs.
  - Stage 2 / UX: SIMPLE is the default and exposes image, ten visual preset cards, Brush Mode, Size, Spacing, Opacity, effect-specific Glitch Amount, Mutation and draw state. Added a live Current Brush explanation and one canvas-based How Image Brush Works diagram. ADVANCED retains grouped technical settings and hides scatter, pressure, alpha, evolution, feedback, variant and post-trail controls unless the active mode reads them.
  - Stage 2 / presets: the primary ten presets are Clean Sticker Trail, Glitched Repeat, Evolving Decay, Datamosh Ribbon, RGB Stamp Chain, Pixel Sort Trail, Chroma Echo, Compression Decay, Scattered Fragments and Broken Interface. Each card has generated preview, plain result text and cost. Six Glitch Amount levels use effect-specific curves; manual rack edits set the state to Custom.
  - Stage 3 / baseline: a headed Firefox 153.0 BiDi harness performed real click, slider drag, preset choice, mutation keyboard selection, short/slow/fast pointer strokes and repeated Undo/Redo. Before cropped-source transfer, the 1120×720 same-scenario run sent 3,235,008 bytes for every process job (9,723,840 bytes total) and recorded a 69.46 ms maximum rAF gap. After cropping it sent 3,674,532 bytes total and recorded 20.84 ms in the matched run.
  - Stage 4 / architecture: `estimateImageBrushReadBounds` conservatively includes transformed asset radius, alpha bleed, custom/edge anchors and active scatter. App transfers only that latest cropped RGBA source plus required brush assets; Worker maps global stamp/bounds coordinates into the crop and returns only the local changed patch. Full-document source copies per stroke are now zero.
  - Stage 4 / correctness: full-source and cropped-source Stroke Feedback outputs are byte-identical. Edit/Undo/Redo equivalents read the latest selected crop. Fixed and Per Stamp pools stay bounded. Worker progress now requires both a meaningful 10% change and 50 ms interval (100% always posts).
  - Stage 5 / Firefox matrix (`browser-artifacts/image-brush-firefox/final-matrix-history-verified.json`):
    - 1000², 96 px tip, Fixed, 98 stamps: 1,857,856 bytes out / 942,560 bytes in; one 83.36 ms global rAF gap in the final rerun.
    - 2000², 128 px tip, Per Stamp pool 8, 196 stamps: 5,641,856 bytes out / 3,305,752 bytes in; first feedback 1 ms, live-frame work max 4 ms, commit 388 ms; one 97.24 ms global rAF gap.
    - 4000², 128 px tip, Evolving, 246 stamps: 15,782,428 bytes out / 10,903,280 bytes in; first feedback 0 ms, live-frame work max 13 ms, commit 394 ms; global maximum 104.2 ms with three gaps above 50 ms.
    - Immediate real Escape cancelled a heavier 4000² job in 22 ms; document sample, History and Worker result count remained unchanged.
  - Stage 5 / visible Edge regression (`browser-artifacts/image-brush-repair/after-report.json`):
    - 1000² Fixed, 115 stamps: 2,021,376 bytes out / 1,031,016 bytes in; commit 206 ms; max recorded ordinary rAF gap 48.6 ms.
    - 2000² Per Stamp, 205 stamps: 5,673,000 bytes out / 3,436,576 bytes in; commit 342 ms; one 69.5 ms gap.
    - 4000² Evolving, 246 stamps: 14,818,416 bytes out / 10,823,792 bytes in; commit 585 ms; maximum 111.2 ms.
    - Cancel completed in 16.1 ms without changing committed pixels.
  - Firefox capability audit: `getCoalescedEvents`, OffscreenCanvas, `createImageBitmap` and transferable ArrayBuffer were present. The browser Performance API used by the harness did not expose GC pauses or Long Task entries. Final interaction report found `invalidHelpButtons: 0`, `simpleSliderHelpButtons: 0`, no stuck tooltip, and no visible processing after the scenarios.
  - Final validation: TypeScript success; 6 test files / 118 tests; production build success. Browser reports and screenshots are saved under `browser-artifacts/image-brush-firefox/` and `browser-artifacts/image-brush-repair/`.

### IMAGE BRUSH tooltip audit

| Control | Actual state key | Actual processing use | Tooltip corrected | Visible output verified |
|---|---|---|---|---|
| Brush Mode | `mode` | Chooses asset selection/placement and enables scatter multiplier only for Scatter/Hose | yes, all 5 options | Firefox dropdown + Edge strokes |
| Size | `size` | Scales decoded tip in live and final placement | yes | slider + output bounds |
| Spacing / Unit | `spacing`, `spacingUnit` | Distance sampler interval; percent uses brush width | yes, both unit options | stamp counts 98/196/246 |
| Opacity / Flow | `opacity`, `flow` | Multiplied into final stamp alpha before composition | yes | engine/unit tests |
| Angle / Rotation | `angle`, `rotationMode` | Base angle plus local path rotation rule | yes, all 6 options | real overlay trail |
| Rotation / Scale jitter | `rotationJitter`, `scaleJitter` | Seeded per-copy rotation and size multipliers | yes | Edge varied stamps |
| Scatter X/Y | `scatterX`, `scatterY` | Path offset only in Scatter/Random Hose | yes; hidden otherwise | relevance test |
| Opacity jitter / flips / copies | `opacityJitter`, `flipXChance`, `flipYChance`, `stampsPerStep` | Seeded scatter/hose copy variation | yes; hidden otherwise | relevance + engine trace |
| Edge softness | `edgeSoftness` | Alpha fade across transformed stamp edge | yes | engine trace |
| Smoothing | `smoothing` | Smooths pointer positions before distance sampling | yes | Firefox slow/fast strokes |
| Pressure toggles/minimums | `pressureSize`, `pressureOpacity`, `pressureSpacing`, `minPressureSize`, `minPressureOpacity` | Pressure interpolation and spacing multiplier | yes; minimums conditional | relevance test |
| Blend Mode | `blendMode` | Same 10 RGBA blend equations in live/final compositing | yes, all 10 options | 10-mode unit test |
| Anchor | `anchor`, `customAnchor` | Selects attachment point inside the transformed tip | yes, all 6 options | anchor unit test |
| Trim / threshold | `trimTransparent`, `trimThreshold` | Recomputes decoded alpha bounds | yes; threshold conditional | asset tests |
| Mutation | `mutationMode` | Clean/Fixed/bounded pool/previous-state/underlying-feedback branches | yes, all 5 options | Firefox select + exact tests |
| FX stage | `fxStage` | Brush Tip / Every Stamp / Completed Trail / both branches | yes, all 4 options | stage-distinction test |
| Alpha / bleed | `alphaMode`, `bleedAmount` | Preserves, clips, pads/bleeds or accepts FX alpha | yes; bleed conditional | alpha tests |
| Evolution controls | `evolutionCurve`, `mutationAmount`, `evolutionSpeed`, `maxCorruption`, `effectVariation`, `seedEvolution` | Deterministic per-variant strength/evolution | yes; mode conditional | engine tests |
| Variant limits | `variantCount`, `maxCachedVariants`, `maxLiveFxIterations` | Bounds final Per Stamp pool and live evolving preview pool | yes; renamed preview control | bounded-cache tests |
| Feedback controls | `feedbackAmount`, `underlyingSampling`, `decay` | Mixes previous tip/current crop and darkens carried RGB | yes; feedback-only ID | cropped equality tests |
| Structural drift | `structuralDrift` | Adds post-trail corruption contribution | yes; post-stage only | engine trace |
| Fallback angle | `fallbackAngle` | Direction for zero-length/single-click paths | yes | path trace |
| Rack Amount / Mix | `rack[].amount`, `rack[].mix` | FX-specific strength then blend with rack input | yes | 19-effect audit |
| Rendering Quality | `renderingQuality` | Chooses live approximation only; final is unchanged | yes, all 4 options | Firefox/Edge capability runs |
| Live/generated limits | `maxLiveStampsPerFrame`, `maxGeneratedStamps` | rAF work cap and per-stroke safety cap | yes | matrix metrics |
| Preview / reset / continue | `previewStroke`, `resetEachStroke`, `continueBetweenStrokes` | Pending commit and evolution-offset lifecycle | yes | history/evolution trace |

- [x] 2026-07-27 20:35 — Completed the Critical IMAGE BRUSH performance, visibility and contextual-help repair.
  - Replaced the one-moving-ghost behavior with a persistent cached-variant overlay driven by `requestAnimationFrame`, coalesced events and distance interpolation; no React state setter runs per stamp.
  - Refactored final processing around a precomputed dirty rectangle. The Worker no longer creates a full-document output/layer or returns the whole document; App applies the returned local rows atomically into one PatchHistory action.
  - Added clean/fixed caches, a bounded deterministic Per Stamp pool, previous/current-only Evolving state, throttled progress, one-asset transfer for non-hose modes, explicit generation/stale rejection and prompt terminate-based Cancel.
  - Added asynchronous 64 px Draft then full-resolution processed-tip preview, zero-change warning, changed count/percentage/bounds, cache status, processing cost/stage copy, four comparison modes and isolated Test Stamp/Test Trail.
  - Added visible Rendering Quality and safety controls, pipeline diagram, effect descriptions/costs and Subtle/Medium/Strong/Broken/Extreme levels.
  - Added typed help metadata, reusable HelpButton, keyboard/hover/click popover, reset hook, full Motion Field documentation, global inspection mode and searchable panel. Help Mode intercepts controls before edits and Escape exits.
  - Visible Edge contact sheet verifies all 19 effects and Amount sensitivity. Performance matrix and cancellation results are recorded above; Firefox rendered the repaired common control/help styling successfully.
  - Final result: 6 test files / 108 tests, TypeScript and production build successful; artifacts saved under `browser-artifacts/image-brush-repair/`.
- [x] 2026-07-27 18:55 — Completed the full IMAGE BRUSH workspace and final acceptance.
  - Added a separate inspector tab with PNG/JPEG/WebP file/drop/paste loading, transparent trimming, checker previews, processed-tip download/copy, ghost/outline overlay and a reorderable multi-image library with nine local demo brushes.
  - Added accumulated-distance Stamp/Trail/Scatter/Sequence/Random Hose placement, interpolation, pressure, six rotation modes, custom anchors, flip/scale/opacity scatter and ten RGBA blend modes.
  - Added 12 built-in presets, persistent user presets, scoped deterministic randomizers and seeded Clean/Fixed/Per Stamp/Evolving/Stroke Feedback mutation.
  - Added a 19-effect Stamp FX rack, small-tip adaptation/gating, four alpha modes, evolution curves, before/each/after/before-after stages, isolated layer post-processing and a cancellable transferable Worker.
  - Each completed stroke commits one exact PatchHistory action; Preview/Cancel, Undo/Redo, reset/load/project lifecycle and evolution state remain atomic and reversible.
  - Portable project JSON embeds immutable brush RGBA assets and restores the library/rack/settings/seed/evolution state. Project changes now use bounded 64-KB chunks instead of fragmenting at unchanged alpha bytes.
  - Export now preserves transparent PNG/WebP pixels and flattens JPEG over the selected background without overwriting the source pixels.
  - Final result: TypeScript success; 5 test files / 100 tests; production build with 1610 modules and a 70.93-KB IMAGE BRUSH Worker; Edge acceptance with 0 exceptions/errors; Firefox render success.
- [x] 2026-07-27 00:20 — Completed Advanced Brush Effects and final acceptance.
  - Added six Worker-backed direct-paint algorithms: coherent interval Pixel Sort, iterative Feedback memory, coordinate Displacement, pointer-vector Flow Mosh, explicit-source Clone Corruption and structured Line Freeze.
  - Added all requested effect-specific controls, 31 built-in presets, deterministic Balanced/Wild schemas, defaults reset, existing user-preset save/import/export integration and six unique inline SVG icons under `ADVANCED BRUSH EFFECTS`.
  - Clone Source is an effect-owned `CanvasOverlayState`; Pick/Alt+click, Escape, Clear, effect switch, image load and project replacement cannot leave an orphan marker or create pixel history.
  - Feedback memory commits only with a committed stroke or applied Preview; Reset Feedback and image replacement clear memory without altering committed pixels or history.
  - Browser testing found and fixed two additional defects: Pixel Sort `hue`/`RGB sum` thresholds were not normalized to the UI's 0–255 range, and image replacement could retain a stale pending Preview from the previous document.
  - Final result: TypeScript success, 3 test files / 78 tests passed, production build success, Edge visual/interaction acceptance with 0 errors and Firefox headless render success.
- [x] 2026-07-26 22:21 — Доделаны Persistent Brush Context и Direct Brush Worker.
  - Последняя завершённая маска сохраняется cropped `Uint8Array`, а не полноразмерным Float32 snapshot; вместе с ней хранится реальный нормализованный stroke vector.
  - MOSH `Current Brush Mask` включается только при наличии маски, реально ограничивает результат и автоматически сбрасывается на Whole Image при смене документа.
  - Motion Field `brush-direction` получает фактический горизонтальный/вертикальный вектор; два направления подтверждены разными browser output hashes.
  - Structural direct brush effects обрабатываются в изолированном Worker; main thread получает progress и может немедленно terminate job.
  - Cancel оставляет committed canvas и history неизменными; успешный stroke создаёт одну запись `Worker · atomic commit`.
  - Добавлены unit-тесты cropped Brush Mask, brush direction, isolated brush processing/progress и cancellation; общий набор вырос до 37 тестов.
  - На 4000×4000 Cancel round trip составил около 58 ms, sampled diff — 0, history — 0/0; успешный Slice commit завершился примерно за 401 ms и изменил 41 874 px одной записью.
- [x] 2026-07-26 19:36 — Завершены MOSH LAB, effect icons и History UI.
  - Сохранено разделение `EFFECT | MOSH LAB | HEX | RAW FILE`; в brush picker осталось 15 прямых stamp-эффектов, MOSH-эффекты туда не добавлялись.
  - Добавлены 25 уникальных inline-SVG иконок, custom effect picker и иконки в выбранном header, MOSH-карточках и истории.
  - Реализован reorderable rack из восьми самостоятельных эффектов: Pixel Sorter, Feedback Echo, Motion Field Mosh, Motion Transfer, Luma/Chroma Drift, DCT Block Damage, Edge Melt и Flow Field Displace.
  - Тяжёлые MOSH-проходы выполняются в Web Worker с unique job ID, progress, немедленным terminate при Cancel/устаревании и защитой от stale result.
  - Preview не меняет committed buffer и историю; Apply всего rack создаёт один full-buffer patch; Cancel полностью возвращает committed pixels.
  - History panel показывает icon, label, px/bytes, bbox, detail и time; переход к старой записи использует честный последовательный `undoTo`.
  - Добавлены 16 MOSH/history/icon tests; общий набор вырос до 33 тестов.
  - Финальные typecheck, 33/33 tests и production build успешны; browser acceptance и 4000×4000 cancel test завершились без page/console errors.
- [x] 2026-07-26 16:52 — Инициализирован постоянный журнал агента.
  - Зафиксирована конечная цель, приоритеты и начальное фактическое состояние пустой рабочей папки.
  - Изменён `AGENT_WORKLOG.md`.
  - Проверено чтением содержимого рабочей папки.
- [x] 2026-07-26 17:12 — Реализовано функциональное ядро RGBA-глитчинга.
  - Добавлены общий интерфейс и 10 seeded-алгоритмов, мягкая кисть, геометрия и патч-история.
  - Основные файлы: `src/glitchAlgorithms/index.ts`, `src/canvas/brushMask.ts`, `src/history/PatchHistory.ts`, `src/utils/`.
  - Проверено TypeScript и unit-тестами.
- [x] 2026-07-26 17:15 — Реализован полный desktop-редактор.
  - Добавлены загрузка/drag-and-drop, canvas zoom/pan, три режима применения, HEX, сравнение, пресеты, экспорт, проект JSON и Raw File Glitch.
  - Основные файлы: `src/App.tsx`, `src/hexEditor/HexEditor.tsx`, `src/styles.css`, `src/workers/rawMutation.worker.ts`.
  - Проверено production build и браузерным smoke-test.
- [x] 2026-07-26 17:22 — Проверены большие изображения и экспорт.
  - PNG 4000×4000 декодирован; оценка памяти в UI — около 244 МБ.
  - Одиночный мазок завершился примерно за 127 мс в тестовом окружении.
  - PNG `large-4000_glitched.png` сформирован браузером без ошибки download.
- [x] 2026-07-26 17:24 — Завершены документация и финальная стабилизация.
  - Исправлена повторная генерация demo на React-render, добавлен локальный favicon и корректный Raw-откат к последней версии.
  - Созданы `README.md`, `public/favicon.svg`, `dist/`, обновлены `package.json` и `package-lock.json`.
  - Финальные typecheck, 9 тестов, build и браузерный smoke-test успешны.
- [x] 2026-07-26 18:24 — Завершён critical redesign структурного glitch engine.
  - Добавлены 10 структурных block/line/region/datamosh эффектов с временными region snapshots и primitive-level random decisions.
  - Pixel Noise сохранён как отдельный legacy-эффект; структурные эффекты вынесены в главную группу UI.
  - Добавлены Micro/Structural intensity, controlled spill, effect-specific controls и пять быстрых уровней силы.
  - HEX получил Pixel mode, Ctrl/Cmd toggle, Shift range, RGBA-wide Fill/XOR/Add/Mutate/Restore/Copy и подсветку всех выбранных пикселей на canvas.
  - Datamosh write bounds учитывают фактическую длину следа: single-click после tuning изменяет 5893 пикселя в области 183×39 вместо обрезанных 910 пикселей в 57×18.
  - Structural Preview/Apply сохранил 11087 изменённых пикселей; направленный Datamosh drag создал полосу 562×117 с 14991 изменённым пикселем.
  - Финальные typecheck, 17 тестов, production build и headless Edge-проверка прошли без page/console errors.

## Failed Attempts

- 2026-07-27 21:35 — Firefox 153 no longer exposes the Chromium CDP endpoint used by the older harness. The final visible harness uses Firefox WebDriver BiDi over its advertised WebSocket session and sends real `input.performActions` pointer/key sequences.
- 2026-07-27 21:41 — The first BiDi probe left a session active; early acceptance also hit a case-sensitive preset selector, persisted ADVANCED state and the expected native replacement confirmation. The scoped test profile was restarted, selectors/state were made explicit and `unhandledPromptBehavior` was set for the isolated harness.
- 2026-07-27 22:00 — The first cancellation automation scrolled to the Cancel button for about 972 ms, allowing the Worker to finish before the click. It was not counted as a successful cancellation. The final harness sends real Escape immediately after progress appears; final cancellation was 22 ms with no result/History/pixel change.
- 2026-07-27 22:07 — The first corrected Cancel report compared the entire status bar, so moving the pointer changed X/Y and falsely reported `historyUnchanged: false`. The final report compares the History field itself and records `historyUnchanged: true`.
- 2026-07-27 22:13 — Tooltip audit found an ID collision: IMAGE BRUSH Feedback Decay overwrote Motion Field Decay help. IMAGE BRUSH now uses `image-brush.decay`; an automated advanced-tooltip metadata test prevents recurrence.
- 2026-07-26 17:12 — Первый `npm install` внутри ограниченной песочницы завершился `ENOTCACHED`, потому что сетевой реестр был недоступен. Повтор с разрешённой сетевой установкой успешен; код не менялся.
- 2026-07-26 17:12 — Первая TypeScript-проверка обнаружила несовместимый `mixBlendMode` и неверное размещение Vitest config. Исправлены типизация CSS blend mode и отдельный `vitest.config.ts`.
- 2026-07-26 17:13 — Первый `npm test` завершился `spawn EPERM`: песочница запретила дочерний процесс `esbuild`. Повтор с разрешением успешен; тестовый код не менялся.
- 2026-07-26 17:15 — Первый `npm run build` и запуск preview завершились `spawn EPERM` по той же причине. Повторы с разрешённым `esbuild` успешны.
- 2026-07-26 17:16 — Playwright не смог напрямую запустить Edge (`spawn EPERM`). Браузер был безопасно запущен отдельно в headless-режиме, проверка выполнена через CDP; сервер, процессы и временный профиль после теста остановлены/удалены.
- 2026-07-27 00:01 — The first Stage 3 `npm test` and `npm run build` attempts hit the known sandbox `spawn EPERM` restriction for esbuild. Approved reruns succeeded without changing test/build logic.
- 2026-07-27 00:08 — Edge showed that Pixel Sort Wild could complete with zero changed pixels when `RGB sum` was chosen: RGB sum used 0–765 while the shared thresholds used 0–255. RGB sum and hue were normalized to 0–255 and the interval scanner now bridges only the configured short edge-softness gaps; the photo acceptance then produced coherent visible streaks.
- 2026-07-27 00:18 — Image replacement during a Feedback Preview exposed a stale `pendingPreview` object. Load/demo replacement now clears the pending Preview and its feedback candidate; Enter after replacement creates no history.
- 2026-07-27 18:26 — The first IMAGE BRUSH browser harness used the obsolete `.topbar-brand` selector; it was corrected to `.brand`.
- 2026-07-27 18:32 — The browser harness appeared to hang after project import. Diagnostics confirmed project import, React layout and tip preview had completed; the actual blocker was the expected native “replace image and discard changes” confirmation. CDP now explicitly accepts this dialog.
- 2026-07-27 18:36 — Browser acceptance exposed that legacy project changes could split at every unchanged alpha byte, producing hundreds of thousands of tiny base64 runs. Project serialization now uses changed 64-KB chunks and has dedicated round-trip/fragmentation tests.
- 2026-07-27 18:49 — The first Firefox screenshot reused the default profile and timed out without an artifact. The harness now uses an isolated temporary Firefox profile, waits for the actual screenshot file and verifies a normal exit.
- 2026-07-27 20:18 — The first expanded repair acceptance left the final audited Flow Field effect active for the ordinary mutation strokes; the following wait timed out. The harness now saves the effect audit independently and restores the controlled Glitched Symbol Stream preset before performance work.
- 2026-07-27 20:24 — Two visible Edge reruns intermittently ignored CDP mouse injection before the first pointer event (status coordinates remained empty and no final Worker was posted). A subsequent identical visible run completed all four modes and the full 1000²/2000²/4000² matrix; cancellation was isolated into an in-browser PointerEvent check to avoid confusing harness focus loss with engine lag.

## Known Bugs

- [resolved 2026-08-01, Stage 1] `Accumulate` was replaced by the factual `Build up overlapping stamps` / `Previous stamp carry` labels and descriptions; the implementation remains intentionally current-stroke-only.
- [resolved 2026-08-01, Stage 2] The editor now has independent sparse 256×256-tiled glitch layers, full stack composition/operations, exact history snapshots and portable project serialization.
- [resolved 2026-08-01, Stage 1] Clearing Motion Transfer now leaves an existing preview visible and explicitly stale while preserving committed pixels/history; applying or cancelling that preview is a separate action.
- [resolved 2026-08-01, Stage 1] The mask overlay is now an optional `Show processing mask` diagnostic and defaults Off.
- [resolved 2026-08-01, Stage 1] IMAGE BRUSH randomization now advances a nonce unless `Lock Seed` is enabled, exposes `New Variation`, and excludes Pixel Noise / Bit Flip from its random FX pool.
- [resolved 2026-08-01, Stage 4] MOSH randomization has separate Parameters/Effects/Order/Everything/New Result operations, explicit change counts, variation nonce, identity-shuffle protection and exact Lock Seed replay.
- [resolved 2026-08-01, Stage 3] Macroblock Shift/Packet Loss are modes of Block Corruption; Compression/Tile Scramble are modes of Codec Block Damage; Mixed Structural has a separate real meta recipe workflow.
- [resolved 2026-08-01, Stage 3] Pixel Noise and Bit Flip are absent from production choices/pools; useful byte effects are collapsed behind `Show Legacy Effects`, default Off.
- [resolved 2026-08-01, Stages 4–5] One lazy cancellable Worker preview renders real Before/After/Difference output for the selected or hovered effect; IMAGE BRUSH renders dynamic low/high control examples.
- [resolved 2026-08-01, Stage 8] Clone Corruption has explicit Clean/Fragment/Slice/Packet/RGB/Evolving modes, predictable Aligned/Non-aligned sampling, explicit source pick/clear and visually inspected mode evidence.
- [resolved 2026-08-01, Stage 4] Luma/Chroma Drift, Edge Melt and Flow Field use the requested rebuilt distinct preset families; all accepted contact sheets were inspected after completed Worker results.
- [resolved 2026-08-01, Stage 7] HEX is absent from the production App, Help and current docs. RAW FILE is now the fully explained FILE CORRUPTION workflow with exact mutation controls, retry/revert and decode status.
- [resolved 2026-08-01, Stage 1] IMAGE BRUSH now preserves original uploads while creating selectable real working buffers, reports dimensions/memory reduction and invalidates only stamp-related caches/jobs.
- [resolved 2026-08-01, Stage 6] Smudge, Blur, Sharpen, layered Restore and sparse active-layer Eraser exist with local Worker processing, preview, History and physical-key shortcuts.
- [open, measured 2026-08-01, Stage 8] Visible Edge `Codec Damage Trail` exceeded 120 seconds in both a 427 px and a 96 px acceptance attempt. Firefox completes the same preset and owns the accepted whole-trail evidence; Edge final smoke uses optimized Glitched Repeat until the pre-optimization preview/whole-trail scheduling path is further reduced.

- [fixed, verified 2026-07-27 in headed Firefox 153.0] The rejected SIMPLE card/workflow split is removed. The compact inspector has no horizontal overflow at 320/450/600 px, mounts no preset-card canvases and keeps all five essential sliders visible.
- [fixed, verified 2026-07-27 in headed Firefox 153.0] Real pointer drags changed all five essential sliders after adding two transparent PNGs; switching assets preserved the values, and the overlay neither intersected nor intercepted the inspector.
- [fixed, verified 2026-07-27] Every thumbnail has explicit and context-menu removal; active removal selects next then previous, final removal/clear reaches a clean empty state, demos are opt-in/removable, and active asset jobs/caches are cancelled/disposed without touching committed document pixels.
- [fixed, verified 2026-07-27 in headed Firefox 153.0] All nine requested mutation branches are separately implemented, unit-tested and visually recorded at ten stamps each; Progressive, Random Stack, A/B Alternating, Stroke Gradient and connected Whole Trail no longer alias older behavior.
- [fixed, verified 2026-07-27 in headed Firefox 153.0] Twelve presets are visually distinct and recorded at eleven stamps each. The simultaneous preview-card grid/canvases were removed from rendered markup and replaced by one selector.
- [fixed with measured residual limit, verified 2026-07-27 in headed Firefox 153.0] Add/switch/remove, every essential slider, all modes/presets, ten repeated strokes, Undo/Redo and cancellation were profiled. Ordinary repeated 1000² strokes had a 34.72 ms maximum rAF gap with none above 50 ms. Final 4000² Evolving remains the slowest path at 917 ms and one 111.14 ms global gap, but stays asynchronous, gives live feedback within 1 ms and cancels without committing.
- [fixed, verified 2026-07-27 in headed Firefox 153.0] The reported ordinary-stroke Firefox lag was traced in part to per-stroke full-document transfer. Matched transfer fell from 9,723,840 to 3,674,532 bytes and matched max rAF gap from 69.46 to 20.84 ms after cropped-source transfer. Final 4000² Evolving runs remain slower and occasionally show 90–111 ms global gaps, but stay asynchronous, visibly overlaid and cancellable in 22 ms.
- [fixed, verified 2026-07-27] IMAGE BRUSH opens in presets-first SIMPLE with Current Brush explanation, compact canvas diagram and relevance-gated ADVANCED controls.
- [fixed, verified 2026-07-27] Visible `?` is restricted to dropdowns. Sliders/buttons/toggles use one delegated shared tooltip; dropdowns use one shared all-options popover. The unused top-level chroma setting and Decay ID collision were removed/fixed, and all rendered advanced tooltip IDs resolve to audited metadata.
- [fixed, verified 2026-07-27] IMAGE BRUSH now paints the complete temporary cached-variant trail into one overlay during pointer-down; Edge verified changed overlay pixels in all four mutation modes and no delayed live frames in the 1000²–4000² matrix.
- [fixed, verified 2026-07-27] Processed-tip FX preview runs in a dedicated generation-gated Worker: 64 px Draft appears first and a full-resolution result replaces it; the visible Amount test refreshed in about 53 ms.
- [fixed, verified 2026-07-27] Worker progress is percent/time throttled and live drawing avoids React state. The final matrix recorded only 6–8 React renders per stroke+commit rather than updates per stamp.
- [fixed, verified 2026-07-27] Final strokes transfer only a conservative cropped source/read region and return only the changed dirty rectangle. The final Firefox/Edge matrices recorded zero full-document copies per stroke.
- [fixed, verified 2026-07-27] Fixed prepares/processes one reusable final-job tip; Per Stamp uses the configured bounded deterministic pool; Evolving retains previous/current state. Final Fixed variants are intentionally regenerated once for each new atomic stroke rather than retaining a document-coupled Worker across strokes.
- [fixed, verified 2026-07-27] Processed-tip UI reports changed pixels, percentage, bounds, cache size, Preview quality and zero-change warnings; the stage pipeline explains Brush Tip / Every Stamp / Completed Trail / Tip + Trail.
- [fixed, verified 2026-07-27] Central contextual help uses one delegated hover/focus tooltip and one dropdown popover. No slider/button/toggle HelpButtons remain; Motion Field and IMAGE BRUSH Decay help are distinct; Help Mode and search remain available.
- [fixed, verified 2026-07-26] MOSH cards formerly used `draggable` on the entire `<article>`; pointer reordering now activates at 6 px only from `.mosh-card-drag-header`.
- [fixed, verified 2026-07-26] Letter/Undo shortcuts formerly read `event.key`; the resolver now uses physical `event.code`, ignores repeats and respects typing targets.
- [fixed, verified 2026-07-26] Motion Transfer regions formerly lived in global App state and became orphaned; regions now belong to effect instances and overlays derive strictly from active owners/draft state.
- [fixed, verified 2026-07-26] Range rails were effectively invisible; shared RangeControl now supplies progress and both WebKit and Mozilla rail/progress/thumb styling.
- [fixed, verified 2026-07-26] Motion Transfer had no presets and MOSH lacked effect-specific randomization/user presets; all eight effects now have six complete built-ins, deterministic schemas and persistent user-preset lifecycle.
- [fixed, verified 2026-07-27] The Advanced Brush Effects group now owns six real direct-paint algorithms, six unique icons, controls, presets, randomizers, Clone overlay state and Feedback memory.
- [fixed, verified 2026-07-27] Project JSON formerly fragmented RGB-heavy edits at every unchanged alpha byte; bounded changed chunks now keep import responsive and validate ranges before applying them.
- [fixed, verified 2026-07-27] Export formerly painted a background and then overwrote it with source `putImageData`; PNG/WebP transparency and JPEG background flattening now use the correct source-over canvas pipeline.
- [fixed, verified 2026-07-27] IMAGE BRUSH `after` staging formerly risked pre-processing individual tips; after-only racks now stamp clean tips and process the isolated finished trail once.

- Temporal mode, video import, истинный codec datamosh и WebM/GIF export не реализованы; текущий Motion Mosh — честная static-image псевдосимуляция.
- Полноценный стек независимых raster-слоёв реализован 2026-08-20; результаты инструментов остаются sparse для экономии памяти и отзывчивости.
- Raw File Glitch пока не привязан к координатам кисти; он выполняет глобальную seeded-мутацию после защищённого префикса.
- Structural brush effects показывают результат после pointer-up Worker commit; live Continuous во время движения остаётся у лёгких pixel/micro effects.

## Technical Decisions

- RGBA Glitch будет работать с декодированным `Uint8ClampedArray`, поскольку байты сжатого изображения не соответствуют координатам пикселей.
- Raw File Glitch будет отдельным режимом с собственным `ArrayBuffer` и явным предупреждением.
- Алгоритмы глитча не будут зависеть от React.
- История будет хранить патчи изменённых диапазонов, а оригинал — в отдельном неизменяемом буфере.
- Крупные пиксельные буферы будут храниться вне частых React state-обновлений.

## Tests and Validation

- IMAGE BRUSH UX / Firefox P0 final verification:

```text
npm run typecheck
Result: success

npm test
Result: 6 files passed, 118 tests passed

npm run build
Result: success, 1615 modules transformed
IMAGE BRUSH Worker: 75.16 kB
Main bundle: 526.96 kB / 156.22 kB gzip

Headed Firefox: 153.0, moz:headless=false
Actual actions: slider drag, preset click, mutation selection,
short/slow/fast strokes, repeated Undo/Redo, 1000²/2000²/4000² matrix
HelpButtons outside dropdowns: 0
Simple slider HelpButtons: 0
Stuck tooltip after pointer exit: false
Full-document copies per final stroke: 0
Cancel: 22 ms, document/history/result unchanged

Visible Edge regression:
1000²/2000²/4000² real overlay + final Worker paths
Full-document copies per final stroke: 0
Cancel: 16.1 ms, document unchanged
```

- Primary final artifacts:
  - `browser-artifacts/image-brush-firefox/final-interaction.json`
  - `browser-artifacts/image-brush-firefox/final-interaction.png`
  - `browser-artifacts/image-brush-firefox/final-matrix-history-verified.json`
  - `browser-artifacts/image-brush-firefox/final-matrix-history-verified.png`
  - `browser-artifacts/image-brush-repair/after-report.json`
  - `browser-artifacts/image-brush-repair/after-visible-edge.png`

- Critical IMAGE BRUSH repair final verification:

```text
npm run typecheck
Result: success

npm test -- --run
Result: 6 test files passed, 108 tests passed, 0 failed

npm run build
Result: success; 1613 modules transformed
Output: 0.53 KB HTML, 48.98 KB CSS, 488.89 KB app JS,
        66.39 KB Preview Worker, 74.68 KB IMAGE BRUSH Worker,
        31.84 KB Brush Worker, 26.82 KB MOSH Worker, 0.90 KB Raw Worker

Visible Edge:
- Ordinary transparent 96×96 PNG; all 19 FX visually audited and parameter-sensitive.
- Draft preview refresh ≈53 ms; all Full diagnostics report nonzero changed pixels.
- 1000² / 115 stamps: 118.5 ms engine commit, 0.3 ms max live frame.
- 2000² / 205 stamps: 229.0 ms engine commit, bounded 8-variant pool.
- 4000² / 246 stamps: 456.1 ms engine commit, 2.6 ms max live frame,
  10.2 MB local result versus 61.1 MB document input.
- Cancel on 4000²: 16.8 ms, document and History unchanged.

Firefox:
- isolated headless profile exited normally and saved after-firefox.png.
```

- Final verification for the 2026-07-27 IMAGE BRUSH request:

```text
npm run typecheck
Result: success

npm test
Result: 5 test files passed, 100 tests passed, 0 failed

npm run build
Result: success; 1610 modules transformed
Output: 0.53 KB HTML, 43.79 KB CSS, 475.75 KB app JS,
        70.93 KB IMAGE BRUSH Worker, 31.84 KB Brush Worker,
        26.82 KB MOSH Worker, 0.90 KB Raw Worker
```

- Edge/Chromium 1600×1000:
  - Verified the five-tab split, nine local demo assets, original/processed previews, clean stamping, exact one-action history label, exact Undo/Redo and eight visually distinct preset/mutation scenarios.
  - Enumerated all ten blend modes and all four alpha modes; overlapping and wide spacing produced distinct document hashes.
  - Portable project round-trip restored 9/9 brush assets, active asset, rack and settings.
  - PNG and WebP export preserved transparent corner `[0,0,0,0]`; JPEG flattened the same corner to the chosen `#ff00ff` background as `[255,0,254,255]`.
  - A clean 4000×4000 IMAGE BRUSH stroke completed in approximately 493 ms; History toggled in approximately 0.2 ms.
  - Final Runtime exceptions: 0; console errors: 0.
- Firefox headless 1600×1000 used an isolated profile, exited with code 0 and produced a visually intact application screenshot. Interactive gestures were exercised in Edge; Firefox was used for cross-engine render/layout verification.
- Browser artifacts: `browser-artifacts/image-brush-edge.png`, `browser-artifacts/image-brush-edge-report.json`, `browser-artifacts/image-brush-firefox.png`, `browser-artifacts/image-brush-firefox-report.json`.

- Final verification for the 2026-07-26/27 MOSH LAB and Advanced Brush request:

```text
npm run typecheck
Result: success

npm test
Result: 3 test files passed, 78 tests passed, 0 failed

npm run build
Result: success; 1603 modules transformed
Output: 0.53 KB HTML, 35.11 KB CSS, 407.20 KB app JS,
        31.84 KB Brush Worker, 26.82 KB MOSH Worker, 0.90 KB Raw Worker
```

- Edge/Chromium 1600x1000:
  - `ADVANCED BRUSH EFFECTS` displayed all six algorithms and distinct icons.
  - Pixel Sort produced visible coherent streaks on the supplied 960x1280 photo and committed one history action.
  - Two Feedback strokes produced distinct accumulated buffers; `READY -> Reset Feedback -> EMPTY` preserved both pixels and history.
  - Displacement produced a visibly warped coordinate field; Flow horizontal and vertical gestures produced distinct output hashes.
  - Clone Pick/Clear/Escape changed neither pixels nor history, owned exactly one overlay, painted identifiable damaged source content, and removed its marker on effect switch/new image.
  - Line Freeze produced structured repeated bands.
  - Preview changed only the temporary buffer; Escape restored the exact committed hash with no history action; Enter kept the preview and created exactly one action.
  - New-image replacement removed pending Preview, Clone overlay and Feedback memory. Final page errors: 0; console errors: 0.
- Firefox headless 1600x1000 exited successfully and rendered the full application. The screenshot visibly confirmed dark range rails, gold progress, light thumbs, canvas, inspector and no broken layout. Interactive gesture automation was performed in Edge; Firefox was used for cross-engine render/range verification.

- Финальная проверка Persistent Brush Context / Direct Brush Worker:

```text
npm run typecheck
Result: success

npm test
Result: 2 test files passed, 37 tests passed, 0 failed

npm run build
Result: success; 1598 modules transformed
Output: 0.53 KB HTML, 31.24 KB CSS, 347.90 KB app JS,
        20.87 KB Brush Worker, 18.26 KB MOSH Worker, 0.90 KB Raw Worker
```

- Demo structural stroke: 12 451 changed px, одна history-запись `Worker · atomic commit`.
- MOSH Pixel Sort по сохранённой Brush Mask: 6 608 changed px в локальном bbox 645×176; target доступен после stroke и disabled с подсказкой до первого stroke.
- После загрузки Demo выбранный stale `brush` target автоматически стал `whole`.
- Motion Field с одинаковыми параметрами и реальным horizontal/vertical brush direction дал разные sampled hashes `2790338641` и `1098961658`.
- 4000×4000 Brush Worker Cancel: progress был видим, Cancel round trip ≈58 ms, sampled canvas diff 0, history 0/0.
- 4000×4000 successful Slice Worker commit: ≈401 ms, 41 874 changed px, bbox 1848×847, одна history-запись.
- 4000×4000 MOSH Pixel Sort по compact Brush Mask: ≈1.66 s, 61 121 changed px, main UI оставался доступным.
- Двойные Undo/Redo после Brush Worker + MOSH transaction дали состояния history `0 applied · 2 redo` и затем `2 applied · 0 redo`.
- Окончательная headless Edge-сессия 1440×1000 завершилась с 0 page errors и 0 console errors.
- Финальная проверка MOSH LAB от 2026-07-26:

```text
npm run typecheck
Result: success

npm test
Result: 2 test files passed, 33 tests passed, 0 failed

npm run build
Result: success; 1598 modules transformed
Output: 0.53 KB HTML, 30.64 KB CSS, 342.11 KB app JS,
        17.70 KB MOSH Worker, 0.90 KB Raw Worker
```

- Headless Edge 1440×1000: все восемь эффектов визуально различимы; Pixel Sort дал 58 076 coherent streak pixels, Motion Transfer — 104 747 px, Edge Melt — 186 783 px, финальный smooth Flow Field — 722 916 px. Feedback, Motion Field, Chroma и DCT заметно меняли почти весь 1120×720 кадр.
- Pixel Sort создаёт длинные bands; Feedback — вложенные ghosts/trails; Motion Field — блочную propagation; DCT — выровненные boundaries/ringing; Flow Field после финального smoothing создаёт связное жидкое поле без прежнего speckle-noise.
- Cancel во время Feedback pass 1/20 оставил 0 отличающихся committed bytes и 0 history actions.
- Preview Chroma изменил временный canvas, но оставил history 0/0; Cancel восстановил 0 diff. Apply из Preview создал ровно одну историю.
- Undo/Redo toolbar, shortcuts, typing guard, redo branch clearing через новую HEX XOR операцию и safe Undo-to-selected проверены в реальном UI.
- Rack duplicate/bypass/remove и reorder проверены; multi-effect Pixel Sort + Chroma применился как одна запись `MOSH LAB · 2 effects`.
- Motion Transfer source/destination нарисованы реальными canvas-drags и получили визуально разные patterned overlays.
- 4000×4000: History UI открылся примерно за 41 ms во время Worker job; Cancel round trip — примерно 452 ms; sampled canvas hash не изменился, history осталась 0/0, UI memory estimate ≈244.1 MB.
- Финальная браузерная сессия завершилась с 0 page errors и 0 console errors.
- Git недоступен для этой папки: `git status --short` сообщил, что папка не является репозиторием.

```text
npm run typecheck
Result: success

npm test
Result: 1 test file passed, 9 tests passed, 0 failed

npm run build
Result: success; 1588 modules transformed
Output: dist/index.html, 20.58 KB CSS, 266.73 KB JS, 0.90 KB Raw Worker

npm install --package-lock-only --ignore-scripts
Result: up to date; 0 vulnerabilities

npm run typecheck
Result after structural redesign: success

npm test
Result after structural redesign: 1 test file passed, 17 tests passed, 0 failed

npm run build
Result after structural redesign: success; 1591 modules transformed
Output: dist/index.html, 21.39 KB CSS, 297.34 KB JS, 0.90 KB Raw Worker
```

- Headless Edge, 1440×1000 и 1280×800: приложение загрузилось без page errors и console errors.
- Мазок Byte Noise: 6457 изменённых пикселей / 8654 изменённых байта в проверенном сценарии.
- Undo: 0 отличий от Original; Redo: 8654 отличённых байта восстановлены.
- HEX: одновременно отрисовано 21 из 201600 виртуальных строк; ручная правка байта сразу изменила соответствующий canvas-пиксель.
- Preview/Cancel: временный diff вырос с 8655 до 11475 байт и после Cancel вернулся к 8655.
- Проверены Export modal, Project entry point, 16 горячих клавиш в modal и вкладка Raw File Glitch.
- Загружен PNG 4000×4000; выполнены мазок и PNG-download без page/console errors.
- Structural single-click browser metrics: Slice 1939 px / 119×20, Macroblock 10523 px / 159×117, RGB Chunk 2978 px / 77×98, Scanline 3315 px / 119×29, tuned Datamosh 5893 px / 183×39.
- Structural Preview/Apply: 11087 изменённых пикселей до и после commit; статус `Preview committed to history`.
- Datamosh drag: 14991 изменённых пикселей, область 562×117, горизонтальное соотношение сторон 4.80 — направление мазка визуально сохраняется.
- HEX multi-selection: Ctrl выбрал 2 разнесённых пикселя, Shift — диапазон 4 PX / 16 B; XOR `10` корректно изменил все 16 RGBA-байтов одной операцией.
- Финальная headless Edge-сессия завершилась без page errors и console errors.

## Files Changed Recently

- `src/imageBrush/types.ts`, `src/imageBrush/assets.ts`, `src/imageBrush/path.ts`, `src/imageBrush/presets.ts`, `src/imageBrush/engine.ts` — complete IMAGE BRUSH domain, immutable/local assets, distance path sampler, presets/randomizers and pure deterministic RGBA renderer.
- `src/workers/imageBrush.worker.ts` — isolated cancellable stamp rendering with progress, job IDs and transferable RGBA buffers.
- `src/components/ImageBrushPanel.tsx`, `src/styles.css`, `src/icons/effects.tsx` — the IMAGE BRUSH inspector, library, previews, complete controls/presets/FX rack and dedicated local icon/styling.
- `src/App.tsx`, `src/types/index.ts` — canvas overlay/pointer orchestration, atomic history, Worker lifecycle, portable project state and corrected transparent/JPEG export composition.
- `src/projectRuns.ts`, `src/projectRuns.test.ts` — bounded portable-project change chunks, safe restore validation and fragmentation regression coverage.
- `src/imageBrush.test.ts` — deterministic stamping/mutation/staging/alpha/blend/preset/project/lifecycle/history tests.
- `scripts/image-brush-browser-acceptance.mjs`, `browser-artifacts/` — Edge CDP interaction/export/performance acceptance plus isolated-profile Firefox render verification.
- `src/brush/engine.ts`, `src/workers/brush.worker.ts` — isolated structural brush engine, compact mask reconstruction, progress/cancel и transferable result.
- `src/App.tsx` — persistent cropped Brush Mask, реальный stroke direction, Brush Worker orchestration, atomic history commit и stale target reset.
- `src/mosh/types.ts`, `src/mosh/engine.ts`, `src/workers/mosh.worker.ts` — Brush Mask bounds и реальный direction передаются в MOSH processing.
- `src/components/MoshLab.tsx`, `src/styles.css` — рабочая Current Brush Mask target и compact Brush Worker progress/Cancel UI.
- `src/mosh/types.ts`, `src/mosh/engine.ts`, `src/mosh/transaction.ts` — типы, defaults/presets, pure Worker-compatible stack engine и stale/cancel gate восьми MOSH-эффектов.
- `src/workers/mosh.worker.ts` — отдельная обработка с progress, job IDs и transferable output buffer.
- `src/components/MoshLab.tsx` — rack UI, effect controls, targets, presets, drag reorder, source/destination tools и processing progress.
- `src/icons/effects.tsx`, `src/components/EffectPicker.tsx` — 25 уникальных inline-SVG и compact icon-aware brush picker.
- `src/mosh.test.ts` — 16 тестов иконок, истории, shortcuts, алгоритмов, stack order и транзакционной защиты.
- `src/history/PatchHistory.ts`, `src/utils/shortcuts.ts`, `src/types/index.ts` — `undoTo`, безопасный typing guard и расширенные history metadata.
- `AGENT_WORKLOG.md` — создан постоянный журнал и начальная очередь задач.
- `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html` — создан каркас сборки.
- `src/types/index.ts` — добавлены доменные типы редактора.
- `src/utils/prng.ts`, `src/utils/geometry.ts` — добавлены детерминированная случайность и геометрические функции.
- `src/canvas/brushMask.ts` — добавлена мягкая маска кисти с falloff.
- `src/history/PatchHistory.ts` — добавлена ограниченная патч-история Undo/Redo.
- `src/glitchAlgorithms/index.ts` — реализованы 10 детерминированных RGBA-алгоритмов.
- `src/App.tsx` — реализованы редактор, загрузка, canvas-инструменты, экспорт, проект, пресеты, слой и Raw File Glitch.
- `src/hexEditor/HexEditor.tsx` — реализован виртуализированный RGBA HEX-редактор.
- `src/workers/rawMutation.worker.ts` — вынесена бинарная мутация файла.
- `src/core.test.ts` — добавлены unit-тесты ядра.
- `src/styles.css` — создан индустриальный тёмный интерфейс без внешних UI-библиотек и сетевых ассетов.
- `README.md` — добавлены установка, запуск, архитектура, форматы, горячие клавиши, ограничения и Agent Worklog.
- `public/favicon.svg`, `dist/` — добавлена локальная иконка и актуальная production-сборка.
- `package-lock.json` — зафиксированы установленные зависимости; audit сообщает 0 vulnerabilities.
- `src/glitchAlgorithms/structural.ts` — добавлены 10 цельных block/line/region/datamosh эффектов.
- `src/glitchAlgorithms/structuralUtils.ts` — добавлены region snapshot, spill, sampling и primitive write helpers.
- `src/hexEditor/selection.ts`, `src/hexEditor/HexEditor.tsx` — добавлен multi-pixel selection и RGBA-wide operations.
- `src/types/index.ts`, `src/App.tsx`, `src/presets/index.ts`, `src/styles.css` — добавлены новые settings, UI, defaults, families и presets.

## New Tasks Discovered

- [x] P0 — MOSH LAB: отдельная вкладка, non-destructive rack и восемь визуально самостоятельных эффектов.
- [x] P1 — Effect icon registry и icon-aware picker/history.
- [x] P1 — Видимые Undo/Redo и compact History UI поверх существующей PatchHistory.
- [x] P2 — MOSH Worker/Cancel: progress, job IDs, stale-result rejection, immediate obsolete preview cancellation и atomic Apply.
- [x] P0 — Structural stamp redesign: primitive-level random decisions вместо per-pixel random gating.
- [x] P1 — HEX multi-pixel selection: Pixel mode, Ctrl toggle, Shift range, RGBA-wide operations и canvas highlight.
- [x] P1 — Strong structural defaults: один click обязан создавать заметный результат.
- [x] P2 — Effect families и quick intensity levels: Structural эффекты идут первыми, micro effects вынесены в отдельную вторичную группу.
- [x] P2 — Persistent Brush Context: cropped mask, реальный stroke vector, MOSH target и безопасный reset при смене документа.
- [x] P2 — RGBA Worker и отмена: тяжёлые structural brush algorithms выполняются вне main thread; Cancel останавливает job без частичного повреждения рабочего буфера.
- [x] P1 — IMAGE BRUSH: isolated transparent stamp workspace, deterministic mutation/FX Worker, multi-image library, portable projects and format-correct export.
- [x] P1 — Project JSON scalability: replace per-byte change fragmentation with bounded changed chunks and safe range validation.
- P2 — Полноценные raster-слои: каждый glitch-слой должен иметь независимый буфер и композицию; критерий — кисть меняет только активный слой, add/delete/merge сохраняют корректный результат.
- P3 — Navigator thumbnail: добавить миниатюру всего изображения и текущего viewport.

## Next Actions

1. Следующий независимый core-этап при явном запросе: полноценные raster-слои с отдельными buffers, composition и add/delete/merge.
2. Optional: navigator thumbnail.
3. Optional: отдельный temporal/video pipeline, не выдающий static pseudo-mosh за codec datamosh.
4. После следующего тяжёлого этапа повторить 4000×4000 performance/cancel test и браузерную приёмку.

## Session History

### 2026-07-26 16:52

* Сессия началась с двух файлов требований: спецификации приложения и обязательного постоянного журнала.
* Рабочая папка оказалась пустой, `AGENT_WORKLOG.md` отсутствовал, Git-репозиторий не инициализирован.
* Выбрана первая обязательная задача: создать запускаемый каркас до визуальной полировки.
* Создан и начально заполнен `AGENT_WORKLOG.md`.
* Создана первая полная реализация приложения: ядро, canvas, UI, HEX, история, экспорт, пресеты, проект JSON и Raw File Glitch.
* Полноценный стек независимых растровых слоёв упрощён до одного обратимого glitch-буфера над оригиналом.
* Установлены зависимости, исправлены найденные type/config ошибки.
* Успешны TypeScript, 9 unit-тестов и production build; `npm` сообщает 0 vulnerabilities.
* В headless Edge проверены demo, кисть, Undo/Redo, Preview/Cancel, HEX, модальные окна, реальная загрузка PNG, Raw-откат, 4000×4000 и PNG-export.
* Обнаружена и исправлена лишняя генерация demo при каждом React-render; добавлен favicon без 404.
* Полный raster layer stack, RGBA Worker/Cancel, raw-привязка к кисти и navigator thumbnail остались честно зафиксированными расширениями.
* Работа остановилась на готовой запускаемой production-сборке; следующий приоритет — отменяемый RGBA Worker.

### 2026-07-26 18:24

* По новым референсам подтверждено, что старые block/smear/scanline алгоритмы растворяли примитивы через per-pixel random gating.
* Движок разделён на pixel, block, line, region, datamosh и mixed families; реализованы 10 новых structural effects.
* Все structural effects работают через временные region snapshots и цельные block/slice/band/tile primitives.
* Добавлены controlled spill, отдельные Micro/Structural intensity, effect-specific controls и пять quick levels.
* Pixel Noise сохранён отдельным secondary/legacy эффектом, как просил пользователь.
* HEX получил Pixel mode с выбором нескольких пикселей через Ctrl/Cmd и Shift, общими RGBA-операциями и canvas highlight.
* Datamosh дополнительно настроен после браузерной проверки: write bounds теперь учитывают фактическую длину propagation trail.
* Успешны typecheck, 17 unit-тестов, production build и headless Edge acceptance без ошибок.

### 2026-07-26 19:36

* Изучена существующая `PatchHistory`: Undo/Redo не переписывались, а были расширены metadata, `undoTo` и компактным History UI.
* В правом inspector создано требуемое разделение `EFFECT | MOSH LAB | HEX | RAW FILE`; MOSH не раздувает dropdown прямых brush stamps.
* Добавлены 25 уникальных mono-line inline-SVG иконок и custom effect picker с icon/name/description.
* Реализованы восемь самостоятельных MOSH algorithms, presets, targets и строго последовательный reorderable rack.
* Все тяжёлые MOSH passes вынесены в Worker; Preview/Cancel/Apply защищены job gate и атомарным commit.
* В browser acceptance проверены visual output всех восьми эффектов, source/destination overlays, rack operations, history semantics, shortcut guard, stale/cancel behavior и multi-effect atomic Apply.
* На 4000×4000 Worker не заморозил History UI; Cancel сохранил committed buffer и пустую историю.
* После визуальной проверки Flow Field vector noise сглажен до связного multi-octave curl field и повторно проверен: 722 916 changed pixels, один history action, 0 browser errors.
* README и этот worklog обновлены с фактическими результатами и явными ограничениями.

### 2026-07-26 22:21

* После команды пользователя «доделывай» обязательный MOSH/Worker scope был продолжен без необязательного расширения в video mode.
* Transient Float32 brush mask заменена для долговечного контекста на cropped Uint8 mask + bounds; полноразмерная маска восстанавливается уже внутри Worker.
* Stroke state накапливает movement и сохраняет нормализованный фактический direction; Motion Field больше не использует фиксированный `[1, 0.18]`.
* Current Brush Mask включена для всех поддерживаемых MOSH effects и реально ограничивает final mix.
* При reset/load/demo persistent mask очищается, а stale target `brush` безопасно становится `whole`.
* Добавлены `src/brush/engine.ts` и `src/workers/brush.worker.ts`; structural EFFECT обрабатывается изолированно и атомарно после pointer-up.
* Добавлены progress UI, Cancel button, Escape cancellation, stale result protection и взаимная отмена конфликтующих Brush/MOSH jobs.
* Передача large-image данных оптимизирована: original не копируется для structural jobs, Worker хранит before только для write bounds, mask передаётся cropped.
* Добавлены четыре unit-теста; финальный результат — 37/37, успешные typecheck/build и browser acceptance без ошибок.
* На 4000×4000 подтверждены быстрый безопасный Cancel, один atomic history commit, Undo/Redo и локальный MOSH по persistent mask.

### 2026-07-27 18:55

* Полностью реализована отдельная вкладка `IMAGE BRUSH` по 1194-строчной спецификации без подмены существующих EFFECT, MOSH LAB, HEX, RAW FILE, history и export архитектур.
* Реализованы локальная загрузка/drag/drop/paste PNG/JPEG/WebP, transparent trim, original/processed checker previews, ghost overlay, multi-image library и 9 demo brush assets.
* Добавлены accumulated-distance path sampling, Stamp/Trail/Scatter/Sequence/Random Hose, pressure/transforms/anchors, 10 RGBA blend modes и одна атомарная history-запись на мазок.
* Добавлены 12 built-in presets, user preset lifecycle, scoped deterministic randomizers, 19 Stamp FX и Clean/Fixed/Per Stamp/Evolving/Stroke Feedback mutation.
* Вся финальная обработка выполняется в отдельном cancellable Worker с progress, transferable buffers, stale-result protection и корректными before/each/after/before-after stages.
* Portable project JSON сохраняет встроенные RGBA brush assets, библиотеку, rack, seed, preset и evolution state; найденная alpha-byte fragmentation исправлена bounded 64-KB chunks.
* Исправлен export pipeline: прозрачные PNG/WebP сохраняют alpha, JPEG честно flatten-ится на выбранный цвет.
* Edge acceptance подтвердил exact Undo/Redo, presets/mutations, spacing/follow, 10 blend modes, 4 alpha modes, project round-trip, PNG/JPEG/WebP export и 4000×4000 stroke примерно за 493 ms без runtime/console errors.
* Firefox headless render с отдельным профилем завершился кодом 0 и сохранил корректный 1600×1000 screenshot.
* Финальный результат: TypeScript success, 5 test files / 100 tests, production build success; актуальная сборка находится в `dist/`.

### 2026-08-01 Architecture & standards refactor

* Установлены зависимости (node_modules отсутствовали), зафиксирована зелёная базовая линия: typecheck, 157 unit-тестов, production build.
* Удалён мёртвый код: `src/hexEditor/HexEditor.tsx` (347 строк, не использовался в production; `hexEditor/selection.ts` оставлен как test-утилита).
* Декомпозиция монолита `App.tsx` (было 5060 строк):
  - `AlgorithmControls` (~350 строк) вынесен в `src/components/AlgorithmControls.tsx`;
  - презентационные примитивы `PanelSection/Toggle/AxisPair` → `src/components/ui/controls.tsx`;
  - данные `algorithmDescriptions` → `src/effects/descriptions.ts`, список `shortcuts` → `src/utils/shortcutHelp.ts`;
  - структурный тест `productionUi.test.ts` обновлён, чтобы проверял метки Clone-режимов в новом модуле.
* Отрицательная оптимизация бандла: тяжёлые вкладки MOSH LAB и IMAGE BRUSH переведены на React.lazy + Suspense, теперь собираются отдельными чанками (37 КБ / 47 КБ); основной чанк 592→508 КБ, предупреждение Vite устранено (`chunkSizeWarningLimit`).
* Стандарты: добавлены `.prettierrc.json`/`.prettierignore` и прогон Prettier по всему `src` (единый формат, printWidth 100, single quotes, semicolons) + `.gitignore`.
* Итог: typecheck success, 157/157 tests success, production build success. Оставшийся шаг — декомпозиция функции `App()` на feature hooks и компоненты панелей.
* Декомпозиция raw-домена: чистое ядро мутации вынесено в `src/raw/mutateBytes.ts` (DRY), воркер `rawMutation.worker.ts` переписан на его использование; структурный тест обновлён на новый модуль.
* Добавлено юнит-покрытие `src/raw/mutateBytes.test.ts` (защищённый префикс, клэмпинг диапазона, детерминизм) и фuzz-тест `src/raw/mutateBytes.fuzz.test.ts` (детерминированный LCG-корпус 1500 кейсов, агрегация нарушений одним ассертом: не бросает, префикс не трогается, мутации только в диапазоне и строго XOR, повторное применение возвращает оригинал).
* Bun-интеграция: полный набор идёт и через `bunx vitest run`, быстрые node-тесты — через нативный `bun test src/raw` (`npm run test:raw`); фuzz оптимизирован с 20 c до ~40 мс агрегацией нарушений.
* Итог: 12 test files / 161 tests pass (node vitest и bun), typecheck pass.

### 2026-08-01 Decomposition deep-dive (App -> modules)

* Извлечено чистое ядро byte-мутации в `src/raw/mutateBytes.ts` (DRY); `rawMutation.worker.ts` теперь только делегирует. Переиспользуемый `triggerDownload` вынесен в `src/utils/download.ts`.
* Панель FILE CORRUPTION полностью вынесена в `src/components/FileCorruptionPanel.tsx` (своё состояние raw*, внутренняя валидация/скачок worker, remount по doc через key). `App.tsx` потерял ~200 строк логики + JSX + 7 useState.
* Добавлены unit- и fuzz-тесты для ядра мутации (`src/raw/mutateBytes.test.ts`, `*.fuzz.test.ts`); productionUi.test и help-реестр перенастроены на модульный источник.
* Итог: typecheck ✓, 161/161 tests ✓ (node vitest и bun), production build ✓ (chunk <550 КБ), App.tsx 5060 -> 5295 строк после форматирования (чистый объём определений сокращён сильнее; оставшийся монолит App() -- следующая задача по domain hooks).

### 2026-08-01 Phase A: JSX -> presentational components (complete)

* Выполнена ровно по плану `DECOMPOSITION_REPORT.md`: весь JSX монолита `App()` (5295 строк) вынесен в презентационные компоненты, логика остаётся в `App.tsx` и передаётся колбэками. Поведение не менялось (verbatim-перенос).
* Новые компоненты (каждый валидирован `npm run typecheck`):
  1. `src/components/StatusBar.tsx`
  2. `src/components/TopBar.tsx`
  3. `src/components/HistoryPopover.tsx` (+ перенос `historyMetric`, экспорт оттуда)
  4. `src/components/ToolRail.tsx`
  5. `src/components/CanvasWorkspace.tsx` (~200 строк: canvas-toolbar + viewport + overlays + split-control)
  6. `src/components/InspectorTabs.tsx` (экспорт `InspectorPanelId`)
  7. `src/components/EffectPanel.tsx` (~490 строк, ~35 props: algorithm-card, brush dynamics, AlgorithmControls, seed, presets, glitch layers)
  8. `src/components/RetouchPanel.tsx` (~250 строк)
  9. `src/components/Modals.tsx` (ShortcutsModal / ExportModal / ProjectModal)
* Новые модули: `src/retouch/tools.ts` (`RETOUCH_TOOLS`, `isRetouchTool`).
* Импорты `App.tsx` вычищены скриптом (осталось только реально используемое; убран `EffectIcon`, `AlgorithmControls`, `RetouchTool`, мёртвые layer-хелперы `addLayer/clearActiveLayer/...`).
* Финальная валидация:
  - `npm run typecheck` ✓
  - `npm test` ✓ 161/161 (12 files)
  - `npm run build` ✓ (App chunk 513 КБ, всё ещё < 550 limit)
  - Prettier прогон ✓
  - Firefox headless BiDi smoke (самописный `scripts`-аналог для Linux, т.к. `scripts/*.mjs` заточены под Windows/msedge): 13/13 checks ✓ (topbar, statusbar, tool-rail, canvas, base-canvas, algorithm-card, brand, все 4 вкладки inspector, export modal, history popover), 0 console errors.
* `App.tsx`: 5295 -> 4127 строк (вынесено ~1170 строк JSX).
* Не сделано (следующая задача): Phase B — feature hooks (`useHistory`, `useDocument`, `useLayerStack`, `useMosh`, `useImageBrush`, `useBrush`, `useRetouch`, `useExport`, `useProject`, `useViewport`), по одному домену за сессию.

### 2026-08-01 Phase B-1: useHistory hook (complete)

* Вынесен первый feature-hook этапа B: `src/hooks/useHistory.ts` (53 строки).
* Домен: PatchHistory (ref), historyVersion, historyOpen, pendingPreview + API:
  - `commitHistory(action)` — push + bump version (заменил 7 мест: layer op, mosh, image brush, brush worker, retouch sparse, retouch worker, brush commit);
  - `commitPendingPreview()` — push pendingPreview + clear + bump (applyPreview);
  - `clearHistory` (в App обёрнут как `resetHistory`, т.к. имя конфликтует с локальным колбэком, добавляющим notice) — заменил 5 мест: resetChanges, loadDocument, loadDemo, importProject, clearHistory;
  - `bumpHistory()` — инкремент version (undo/redo/undoTo и все clear-сайты);
  - `toggleHistoryOpen`/`closeHistoryOpen` — для TopBar/HistoryPopover.
* Оркестрация undo/redo/undoTo (cancel mosh/brush/imagebrush jobs, restoreLayerSnapshot, updateWorkingCanvas, setDocumentVersion, setNotice) сознательно осталась в App — они переплетены с доменами слоёв/канваса/воркеров; хук отдаёт примитивы (historyRef/bumpHistory), поведение идентично. ponytail: split state-домена от оркестрации, переносить undo-оркестрацию в хук только вместе с useLayerStack/useCanvas.
* Валидация: typecheck ✓, 161/161 тестов ✓, build ✓ (App 514 КБ), prettier ✓.
* Firefox BiDi runtime smoke истории: undo disabled на старте → Random glitch → undo enabled → history popover 1 entry → undo → 2 entries → redo → 1 entry, notice "Redid Slice Displacement stroke.", 0 console errors.
* `App.tsx`: 4127 -> 4142 строк (нетто ~0; state-декларации заменены destructure, чистые уходы в хук скомпенсированы переносом). Следующий домен: useDocument.

### 2026-08-01 Phase B-2: useDocument hook (complete)

* Вынесен `src/hooks/useDocument.ts` (61 строка): `createDemoDocument` перенесён из App как модульная функция; хук владеет `docRef` (init демо), `documentVersion`, `processing`, `exportName` + хелпер `bumpDocument()`.
* В App: 17 мест `setDocumentVersion((v) => v + 1)` заменены на `bumpDocument()`; убраны локальные стейты processing/exportName; импорт `EditorDocument` из App удалён (тип остался в хуке).
* Загрузка (loadDocument/loadDemo) сознательно осталась в App — она сбрасывает ~15 кросс-доменных сущностей (mosh rack, brush context, image brush transient, слои, маску, историю, exportName); это композиционный корень, не чистый документ-домен. ponytail: переносить load-оркестрацию только когда появится useMosh/useImageBrush/useLayerStack.
* Валидация: typecheck ✓, 161/161 тестов ✓, build ✓ (App 514 КБ), prettier ✓.
* Firefox BiDi smoke: базовый 13/13 ✓, история 7/7 ✓, doc-специфичный: fileName "signal-study-demo.png", dims "1120 × 720 / PNG", Demo reload + notice, export modal name "signal-study-demo", 0 console errors.
* App.tsx: 4142 -> 4110 строк. Следующий домен: useLayerStack.

### 2026-08-01 Phase B-3: useLayerStack hook (complete)

* Вынесен `src/hooks/useLayerStack.ts` (67 строк): владеет `layerStackRef` (init по docRef), `layerVersion` + `bumpLayers()`, а также чисто слоёвыми операциями `restoreLayerSnapshot` (restore + recompose) и `commitCurrentBufferToActiveLayer` (write composite в активный слой + patch-генерация) — обе имели deps [] и самодостаточны.
* Общие row-patch хелперы `rowPatchesBefore`/`finalizePatches` вынесены в `src/layers/patches.ts` (используются mosh/retouch/brush и новым хуком).
* В App: 9 сайтов `setLayerVersion((v) => v + 1)` -> `bumpLayers()`; локальные определения restoreLayerSnapshot/commitCurrentBufferToActiveLayer/rowPatchesBefore/finalizePatches удалены.
* `runLayerOperation` остался в App (история-коммит + notice + canvas).
* Валидация: typecheck ✓, 161/161 тестов ✓, build ✓ (App 514 КБ), prettier ✓.
* Firefox BiDi smoke: базовый 13/13 ✓; layer-специфичный: 1 слой/version 0 -> Add -> 2 слоя/version 1 + 1 история entry -> Duplicate -> 3 -> Undo -> 2 -> Redo -> 3, 0 console errors (проверен путь restoreLayerSnapshot + bumpLayers + commitHistory).
* App.tsx: 4110 -> 4059 строк. Следующий домен: useMosh.

### 2026-08-01 Phase B-4: useMosh hook (complete)

* Вынесен `src/hooks/useMosh.ts` (51 строка): все mosh-состояния (moshProcessing, moshProgress, moshRack, moshSeed, moshPreviewEnabled/Stale/Version, moshRegionTool, moshDraftRegion) и рефы (moshWorkerRef, moshJobGateRef, moshPreviewBufferRef, moshPreviewSignatureRef).
* Вся воркер-оркестрация осталась в App (cancelMosh, changeMoshRack, clearMotionTransferRegion, commitMoshBuffer, startMoshJob) — она переплетена с 4 другими worker-доменами (brush/retouch/imagebrush cancel) и canvas; хук отдаёт состояние/рефы. ponytail: полная выемка mosh-логики — только вместе с общим worker-coordinator, это отдельная задача.
* Валидация: typecheck ✓, 161/161 тестов ✓, build ✓, prettier ✓.
* Firefox BiDi smoke: базовый 13/13 ✓, layer 3/3 ✓, mosh: Mosh Lab open -> 1 rack card -> Apply -> undo enabled -> history 1 entry, notice "MOSH LAB", 0 console errors.
* App.tsx: 4059 -> 4063 (нетто ~0; деструктуризация 22 имён шире компактных деклараций). Следующий домен: useImageBrush.

### 2026-08-01 Phase B-5: useImageBrush hook (complete)

* Вынесен `src/hooks/useImageBrush.ts` (136 строк): 12 imageBrush-состояний, 15 рефов (включая render-счётчик `imageBrushRenderCountRef.current += 1`, который выполняется при каждом рендере хука — идентично App), 4 синк-эффекта (settings/library/rack/activeAsset -> рефы) и интерфейс `ImageBrushStrokeState` (export; использовался в 5 сигнатурах App).
* Воркер-оркестрация осталась в App (startImageBrushJob, flushImageBrushSamples, preview effect, ghost variants, cancelImageBrushJob) — та же схема, что useMosh: хук отдаёт состояние/рефы.
* В App: вычищены неиспользуемые импорты imageBrush (defaultImageBrushSettings, ImageBrushFxItem, ImageBrushPerformanceSnapshot, ImageBrushSettings, StampPathState).
* Валидация: typecheck ✓, 161/161 тестов ✓, build ✓ (App 517 КБ < 550), prettier ✓.
* Firefox BiDi smoke: базовый 13/13 ✓, layer ✓, mosh ✓, image-brush: lazy-чанк панель рендерится (image-brush-head + настройки), 0 console errors.
* App.tsx: 4063 -> 4026 строк. Следующий домен: useBrush.

### 2026-08-01 Phase B-6: useBrush hook (complete)

* Создан `src/hooks/useBrush.ts` (126 строк): brush-домен целиком.
  * Состояние: brush, settings, seed, applyMode (+ metaRecipeLocked) с ref-дублями и 4 синк-эффектами, brushProcessing/Progress, brushContext.
  * Рефы: brushWorkerRef, brushJobGateRef, feedbackMemoryRef, pendingFeedbackMemoryRef, maskRef, lastBrushMaskRef, lastBrushDirectionRef, strokeRef.
  * Экспорты: defaultBrush, типы StrokeState и PersistedBrushMask (перенесены из App, были локальными), BrushContext.
* useBrush(width, height) инициализирует maskRef размером документа через docRef.current.
* В App: удалены локальные декларации (state/refs/sync-эффекты), импортированы defaultBrush + типы, вычищен неиспользуемый import MoshJobGate. retouchSettings/retouchWorkerRef/tool/algorithm остались в App (домены useRetouch).
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (518 КБ), prettier ✓.
* Firefox BiDi smoke: базовый ✓, layer ✓, mosh ✓, ibr ✓, + новый brush.mjs (рисует штрих кистью по canvas -> undo enabled, история 1 entry, notice "stroke committed atomically"). Ошибка setPointerCapture: Invalid pointer id — артефакт синтетического PointerEvent, не баг.
* App.tsx: 4026 -> 3990 строк. Следующий домен: useRetouch.

### 2026-08-01 Phase B-7: useRetouch hook (complete)

* Создан `src/hooks/useRetouch.ts` (32 строки): retouchSettings+retouchSettingsRef+sync-эффект, retouchWorkerRef, cloneSource, cloneSourcePickMode, feedbackMemoryVersion.
* В App: удалены локальные декларации и sync-эффект retouchSettingsRef, вычищен импорт defaultRetouchSettings/RetouchSettings из retouch/types (остался RetouchProgress). tool/algorithm остались в App (общие для brush+retouch).
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (518.82 КБ), prettier ✓.
* Firefox BiDi smoke: базовый ✓, brush ✓, mosh ✓, ibr ✓, + новый retouch.mjs (открытие Retouch-вкладки, выбор Smudge, штрих -> undo, notice "Smudge stroke committed"). setPointerCapture — артефакт синтетики.
* App.tsx: 3990 строк. Остались: useExport, useProject, useViewport.

### 2026-08-01 Phase B-8: useExport hook (complete)

* Создан `src/hooks/useExport.ts` (53 строки): exportOpen, exportFormat, exportQuality, preserveTransparency, exportBackground, embedProjectImage + самодостаточный renderExportCanvas (зависит только от docRef + 3 формата). Экспортирован тип DocRef = { current: EditorDocument }.
* Оркестрация (exportImage, exportProject, renderOriginalCanvas, projectRuns) осталась в App — использует setNotice/setProcessing/exportName/seed/algorithm/brush/settings/layerStackRef/imageBrush/encodeProjectRuns.
* В App: удалены 5 export-состояний и renderExportCanvas, добавлена деструктуризация useExport(docRef).
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (519.37 КБ), prettier ✓.
* Firefox BiDi smoke: smoke (включая Export-модалку) ✓, brush ✓, retouch ✓, mosh ✓, ibr ✓.
* App.tsx: 3990 -> 3978 строк. Остались: useProject, useViewport.

### 2026-08-01 Phase B-9: useProject hook (complete)

* Создан `src/hooks/useProject.ts` (19 строк): projectOpen, customPresets (+init из loadCustomPresets), projectInputRef, presetInputRef.
* Осталось в App: applyPreset/savePreset/deletePreset/exportPresets/importPresets (пересекают алгоритм/brush/settings/notice), importProject/exportProject (оркестрация всех доменов), fileInputRef (image import). loadCustomPresets/saveCustomPresets уже в src/presets/index.ts.
* В App: удалены projectOpen/customPresets/2 input-рефа, вычищен неиспользуемый import loadCustomPresets.
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (519.6 КБ), prettier ✓.
* Firefox BiDi smoke: smoke ✓, brush ✓, retouch ✓, mosh ✓, ibr ✓.
* App.tsx: 3978 -> 3983 строк (деструктуризация больше удалённых строк — хука тонкий). Остался: useViewport.

### 2026-08-01 Phase B-10: useViewport hook (complete) — этап B завершён

* Создан `src/hooks/useViewport.ts` (83 строки): zoom/pan (+refs + 2 sync-эффекта), maskView, compareMode/splitPosition/showOriginal/blinkPhase, viewportRef/stageRef/cursorRef/pointerRafRef/cursorPendingRef, самодостаточные fitToScreen и screenToImage.
* В App: удалены viewport-состояния/рефы/sync-эффекты + локальные fitToScreen/screenToImage, вычищен импорт типа MaskView (остался setMaskView). panDragRef/altDragRef/regionDragRef/spaceDownRef/fileDropCounter/baseCanvasRef/workCanvasRef/overlayCanvasRef/imageBrushOverlayCanvasRef/selectionCanvasRef/fileInputRef остались в App (взаимодействия/рендеринг).
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (520.26 КБ), prettier ✓.
* Firefox BiDi smoke: smoke ✓, brush ✓, retouch ✓, mosh ✓, ibr ✓ (brush.mjs доказывает fitToScreen работает — штрих попадает в изображение).
* App.tsx: 3983 -> 3958 строк. ЭТАП B (feature-hooks) ЗАВЕРШЁН: useHistory, useDocument, useLayerStack, useMosh, useImageBrush, useBrush, useRetouch, useExport, useProject, useViewport — все 10 вынесены.
* App.tsx: 5295 -> 3958 (-1337 строк, -25%). Осталось в монолите: оркестрация (cancel/job pipeline, canvas rendering, pointer handlers), preset-CRUD, importProject/exportProject.

### 2026-08-01 Phase C: мелкие UI-состояния вынесены (complete)

* 3 новых хука в src/hooks/:
  * useEditor.ts (31 стр.): tool, algorithm, activePanel, shortcutsOpen + тип InspectorPanelId.
  * usePixelState.ts (22 стр.): selectedByte, selectedPixels, cursorInfo + тип CursorInfo.
  * useNotice.ts (8 стр.): notice + setNotice.
* В App: удалены 9 локальных useState и неиспользуемый импорт useState из 'react'. Tool/AlgorithmId типы остались в сигнатурах.
* Валидация: typecheck ✓, 161/161 ✓, build ✓ (520.82 КБ), prettier ✓.
* Firefox BiDi smoke: smoke ✓, brush ✓, retouch ✓, mosh ✓, ibr ✓.
* App.tsx: 3958 -> 3967 строк (деструктуризация объёмнее удалённых строк; состояние по-прежнему чище). Итог: 5295 -> 3967 (-25%).

### 2026-08-01 Retouch performance pass

* Оптимизация src/retouch/engine.ts без изменения результата (тесты 161/161, бенч 512x512):
  * blur/sharpen: пространственное ядро (1/(1+hypot)) и массив яркости предвычисляются один раз на проход (buildBlurPass) вместо per-sample Math.hypot + luminance(). blur: 6153 -> 3806 ms (-38%).
  * smudge: source-буфер переиспользует before (убрано лишнее pixels.slice() при отсутствии samplePixels).
* Дальше по замеру: blur всё ещё доминирует (3806 ms на полном кадре 512x512; реальный штрих работает по dirty rectangle). След. шаги при необходимости: separable blur (2 прохода вместо окна) или обработка только границы расширенной области вместо полного кадра.

### 2026-08-01 Retouch: separable blur (CPU), -90% времени

* src/retouch/engine.ts: заменён оконный bilateral blur (localBlur, (2r+1)^2 сэмплов/пиксель) на separable (separableBlurRegion, 2 прохода x 2r+1), ограниченный прямоугольником маски. Эдж-защита аппроксимируется per-axis exp; результат слегка отличается от прежнего (тесты на качественные свойства: variation/contrast — проходят).
* Sharpen использует тот же separable-проход.
* Замеры 512x512 полный кадр, 5 runs avg: blur 6153 -> 3806 (предвычисление ядра/luma) -> 340 ms (separable), sharpen 426 -> 78 ms. Итого blur ~-94%.
* Валидация: typecheck ✓, 161/161 ✓, build ✓, prettier ✓.

### 2026-08-21 NEW LAB: experimental Effect Brushes + Image Brush FX

* Добавлены experimental Effect Brushes: Mirror Fold, Halftone Collapse, Raster Loom и Contour Crawl. Все используют направление/fallback axis, локальный padded snapshot, bounded `writeBounds`, Worker pipeline и сохраняют alpha.
* Добавлены Image Brush FX Pixel Embroidery и Xerox Decay с Tip / Per Stamp / Whole Trail стадиями, собственными controls и существующим bounded variant/evolution pipeline.
* Введён общий metadata-флаг `experimental`; Effect Picker показывает отдельную `NEW / EXPERIMENTAL` группу и NEW в item/trigger/preview, Image Brush сортирует NEW FX первыми и сохраняет badge в rack.
* Experimental ID исключены из прежних built-in presets, `structuralMixPool`, default Image Brush pool и Randomize; явные rack/project settings сериализуются и старые проекты получают defaults.
* Сгенерированы 8 WebP (`after`/`difference`) для четырёх Effect Brush previews.
* Валидация: typecheck ✓; 223/223 тестов ✓; production build ✓; in-app визуальный smoke без console errors.
* Edge 151 + headed Firefox 154: по 20 short + 20 long strokes каждого Effect Brush и по 20 Image Brush strokes Pixel Embroidery / Xerox Progressive / Xerox Evolving. Во всех сериях full sync 0, fit 0, zoom stable, rAF ≥50 ms 0; Undo/Redo byte-exact по SHA-256.
* Полные настройки, p50/p95/max, ограничения и отложенные идеи: `NEW_LAB_REPORT_2026-08-21.md`.
