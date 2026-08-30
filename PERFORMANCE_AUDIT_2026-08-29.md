# Аудит производительности Glitch Brushes — 2026-08-29

> Измерения и исправления завершены 2026-08-30. Имя файла оставлено по заданию. Commit и push не выполнялись.

## Часть A — понятное резюме

Главный вывод: обычное рисование на тестовом документе 1280×960 не блокируется тяжёлой обработкой. Эффекты, Retouch и Image Brush считают результат в Worker, а главный поток принимает его за 0,1–1,6 мс, коммитит слой обычно за 0,8–11,5 мс и обновляет только dirty rectangle. Долгий Worker (например, Image Brush Evolving около 96 мс или Mosh rack из пяти эффектов около 3 с) означает ожидание результата, но не зависание интерфейса: в измеренных сериях кадры продолжали идти и gaps ≥50 мс отсутствовали.

Реальные проблемы были в другом:

1. При первом открытии непрозрачная фотография дублировалась без необходимости, а полноразмерная `Float32Array` маска создавалась до первого мазка. Теперь immutable raster разделяется безопасно, а маска создаётся лениво.
2. Structural Effect и Retouch на `pointerdown` собирали полноразмерный selected-layer buffer, который затем не использовали. Аллокация оставлена только pixel-family пути, где она действительно нужна.
3. Layer-backed Undo/Redo сначала проигрывал byte patches, а затем всё равно восстанавливал authoritative layer snapshot. Лишний проход удалён; byte-exact результат сохранён.
4. History memory accounting не видел raster snapshots и повторно обходил все actions. Учёт теперь считает уникальные raster/tile buffers и не выполняет ненужный patch replay.
5. PSD ограничивался только после тяжёлого `readPsd`. Заголовок PSD теперь проверяется до decode; лимит совпадает с реальным лимитом документа — 1920 px по стороне и 2 000 000 пикселей.

Редкий cold-start Long Task остался: baseline имел 2 из 6 запусков ≥100 мс, финальная серия — 1 из 10, максимум 334 мс. Измеренные подэтапы приложения при этом малы: module ready около 22 мс, decode 17–25 мс в Worker, adoption около 2,5 мс, initial compose около 1 мс. Большие headless rAF-паузы часто не имели соответствующего Long Task, поэтому их нельзя честно приписать коду приложения; это хвост запуска процесса Edge/планировщика ОС, требующий отдельного browser trace на машине пользователя.

Soak из 200 мазков и 100 Undo/Redo прошёл без full canvas sync, fit-to-screen, потери zoom и расхождения пикселей. Heap был пилообразным, а не монотонным: 29 → 122 → 94 → 84 → 98 → 120 → 129 МБ. Это согласуется с GC и bounded History; без forced GC нельзя доказать отсутствие любой утечки, но runaway-тренд не обнаружен.

Стоит ли оптимизировать дальше: только после профиля конкретного зависания на пользовательском компьютере. Persistent Workers, GPU, OffscreenCanvas, WASM и полный rewrite Layers сейчас не оправданы — основной post-result main-thread путь уже укладывается в один кадр.

## Часть B — технический отчёт

### Исходное состояние

- Ветка: `diagnostic/lagging-layer-version-2026-08-21`.
- HEAD: `92aeb441366759ebe5dc5b1b7e1131e9e4a3662a`.
- Worktree до аудита был грязным; изменения пользователя сохранены, reset/restore/stash/clean не применялись.
- До аудита уже присутствовали незакоммиченные Layers transform, PSD import/export, resize/transform workers и связанные UI/README/package изменения.
- В текущем commit уже находились NEW Effect Brushes, JPEG Resample, Image Brush Pixel Embroidery/Xerox Decay, compact browsers, splitter и предыдущие post-stroke jank fixes.
- Baseline был снят до audit-fix, но поверх этого же dirty worktree.

Существовавшие до аудита modified-файлы:

`README.md`, `package.json`, `package-lock.json`, `src/App.tsx`, `src/components/CanvasWorkspace.tsx`, `src/components/LayersDock.tsx`, `src/components/Modals.tsx`, `src/components/TopBar.tsx`, `src/hooks/useExport.ts`, `src/layers.test.ts`, `src/layers/sparseLayers.ts`, `src/styles.css`, `src/types/index.ts`.

Существовавшие до аудита untracked-файлы:

`src/components/LayerTransformOverlay.tsx`, `src/layers/resizeRgba.ts`, `src/layers/resizeRgba.test.ts`, `src/layers/transformClient.ts`, `src/psd/`, `src/workers/layerTransform.worker.ts`, `src/workers/psd.worker.ts`.

### Окружение и методика

- Windows 10/11 host, production Vite build.
- Edge `152.0.4191.53`, Firefox `154.0.1`.
- Основной fixture: `parkour-kotenok-road.jpg`, 1280×960, JPEG, один непрозрачный image layer над белым canvas background.
- Каждый основной stroke-case: 5 warm-up и 20 measured strokes; короткие и representative длинные серии.
- Свежий временный browser profile на запуск.
- Проверки: SHA-256 canvas до Undo/после Redo, zoom stability, full sync count, fit count, rAF p50/p95/p99/max.
- Headed Edge и headed Firefox проверены отдельно.
- Bounded `window.__GLITCH_PERF__` включается только `?perf=1`, хранит последние 500 событий и 500 rAF samples, имеет `reset(scope?)`, `snapshot()` и `exportJson()`.

Компактные числа находятся в:

- `performance-results/baseline.json`;
- `performance-results/final.json`;
- `performance-results/summary.json`.

### Карта pipeline

```text
Effect
Pointer → lazy full mask + path → cropped/padded Worker source
→ transferable Worker result → regional adoption → sparse layer commit
→ shared/COW layer snapshot History → dirty canvas upload → React status update

Retouch
Pointer samples → compact dirty mask + selected/full source preparation
→ Retouch Worker → result adoption → active-layer regional commit
→ History snapshot → dirty canvas upload

Mosh
UI/region target → required composition → Mosh Worker passes
→ full preview/result → Apply/Cancel gate → History → full canvas upload

Image Brush
Pointer/path + prepared asset variants → Image Brush Worker
→ bounded result region → regional adoption → active-layer commit
→ History → dirty canvas upload

Layers
Immutable imported raster + sparse editable tiles → compose full or region
→ thumbnails/UI; tile buffers use copy-on-write when shared by History

Import
File/Blob → document decode Worker → size validation → immutable raster stack
→ initial composition → canvas upload → fit

PSD import
26-byte header validation → PSD Worker/ag-psd → raster layer stack → compose

History
Action patches + shared layer snapshots → bounded retention/accounting
→ snapshot restore on Undo/Redo → canvas refresh

Export/project
Layer composition/serialization → canvas/toBlob or JSON/base64
→ download. These remain intentional full-document paths.
```

### Полноразмерные выделения

На fixture 1280×960 один RGBA buffer = 4 915 200 bytes (4,69 MiB), одна full `Float32Array` mask = столько же bytes. На лимите 2 MP каждый такой buffer = 8 000 000 bytes (7,63 MiB).

| Путь | Тип | Размер | Частота | Поток | Результат аудита |
| --- | --- | ---: | --- | --- | --- |
| Decoded image/raster | RGBA | `w×h×4` | import | Worker→main transfer | immutable; shared for opaque original/raster |
| Working document | RGBA | `w×h×4` | document | main | необходим |
| Brush mask | Float32 | `w×h×4` | document | main | теперь lazy, не startup |
| Pixel-family selected layer | RGBA | `w×h×4` | pixel stroke | main | необходим этому пути |
| Structural pointerdown selected layer | RGBA | `w×h×4` | structural stroke | main | удалён как неиспользуемый |
| Retouch source | RGBA | `w×h×4` | Retouch stroke | main→Worker transfer | остаётся; prep p95 1,2–1,4 мс |
| Retouch sample/source | RGBA | до `2×w×h×4` | отдельные режимы | main→Worker | остаётся по семантике |
| Image Brush result | RGBA | dirty region | stroke | Worker→main | regional |
| Structural result | RGBA | writeBounds | stroke | Worker→main | regional |
| History raster | shared buffer | reference | action | main | unique accounting, не копируется |
| History sparse tiles | tile RGBA | touched tiles | action | main | shared/COW |
| Project/base64/export | full document | зависит от stack | explicit operation | main | редкий intentional full path |

### Основные проблемы

| Приоритет | Сценарий | Baseline | Причина | Исправление | Final |
| --- | --- | ---: | --- | --- | ---: |
| P0 | oversized PSD import | decode до проверки | 60 MP guard был после `readPsd` | ранний 26-byte header guard, cap 2 MP/1920 | reject до decode; regression test |
| P0/P1 | cold editor startup | 2/6 Long Task ≥100 мс; max 253 | eager full mask + лишнее opaque raster copy были частью startup traffic | lazy mask, immutable opaque sharing, subphase metrics | adoption median 2,5; compose 1,0; 1/10 environment tail ≥100 |
| P1 | structural/Retouch pointerdown | лишний full selected-layer compose | buffer создавался до выбора pipeline | compose только для pixel family | short commits p95 1,4–7,2; 0 full-sync |
| P1 | layer History Undo/Redo | patch replay + snapshot restore | один результат применялся двумя путями | skip patches для layer snapshots | 100 cycles byte-exact |
| P1 | History memory | raster omitted, repeated scans | accounting видел patches/tiles, но не raster uniqueness | unique raster/tile counting + measured recalculation | bounded, тест на shared raster |

### Startup

| Метрика | Baseline | Final |
| --- | ---: | ---: |
| Edge cold runs | 6 | 10 |
| Runs с Long Task ≥100 мс | 2/6 | 1/10 |
| Long Task max | 253 мс | 334 мс (intermittent tail) |
| Module ready median | не разделено | 22,2 мс |
| Document decode | не разделено | 17,3–24,8 мс Worker roundtrip |
| Document adoption median | не разделено | 2,5 мс |
| Initial compose median | не разделено | 1,0 мс |

Warm reload baseline был около 10,6 мс load и без Long Task. Финальная работа не ухудшает warm reload: audit-only API отключён без `?perf=1`.

### Stroke pipeline

| Инструмент | Source prep / pointer | Worker p95 | Adoption p95 | Commit p95 | Canvas p95 | rAF max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Slice short | pointerdown <1 мс в sampled trace | async | 0,1 | 1,6 | 0,2 | 7,2 |
| Slice long | — | async | 0,2 | 14,5 | 0,2 | 7,1 |
| Flow Mosh short | — | async | 0,2 | 7,2 | 0,2 | 7,2 |
| Mixed long | — | async | 0,2 | 10,6 | 0,2 | 8,1 |
| Smudge short | 1,2 | 34,5 | 1,0 | 0,8 | 0,1 | 7,1 |
| Finger short | 1,3 | 41,1 | 1,4 | 0,9 | 0,1 | 7,1 |
| Blur short | 1,2 | 79,1 | 1,6 | 1,2 | 0,1 | 7,1 |
| Sharpen short | 1,4 | 49,4 | 1,6 | 1,3 | 0,1 | 7,1 |
| Image JPEG Progressive | — | 90,7 | 0,1 | 1,4 | 0,1 | 8,1 |
| Image JPEG Evolving | — | 95,6 | 0,1 | 1,7 | 0,1 | 8,1 |
| Image Pixel Embroidery | — | 21,0 | 0,1 | 0,9 | 0,1 | 8,4 |
| Image Xerox Decay | — | 22,2 | 0,1 | 0,9 | 0,1 | 8,1 |

Все строки выше: 5 warm-up + 20 measured, 0 automatic fit, 0 full canvas sync, Undo/Redo byte-exact. Worker latency не суммируется с rAF: Worker не блокирует main thread.

### Effect coverage

Короткая Edge-матрица охватила 18 текущих picker entries. 17 создали изменения: Mirror Fold, Raster Loom, Contour Crawl, JPEG Resample, Pixel Sort, Feedback, Displacement, Flow Mosh, Line Freeze, Slice, Block Corruption, Datamosh Smear, RGB Chunk Split, Scanline Tear Pro, Codec Block Damage, Row/Column Repeat, Mixed Structural Glitch. Их commit p95 лежал в диапазоне 1,4–7,2 мс.

Clone Corruption был запущен, но без выбранного clone source корректно вернул no-op; его performance run нельзя выдавать за визуальную acceptance. Representative long matrix включила JPEG, Pixel Sort, Feedback, Flow Mosh, Line Freeze и Mixed: commit p95 10,4–11,5 мс, rAF max 8,4 мс, gaps ≥50 мс = 0.

Один RGB run показал rAF max 187,6 мс. Три независимых повтора дали max 7,1/7,1/7,2 мс и 0 gaps ≥50 мс, поэтому единичный результат классифицирован как внешний outlier.

### Retouch

Smudge, Finger, Blur и Sharpen прошли по 20 strokes. Restore Original на неизменённом fixture — no-op по определению. Eraser работает по sparse editable tiles и на immutable photo raster не нашёл overlay pixels; это функциональная граница текущей layer-модели, а не исправляемый performance hot path. Restore Lower Layer требует многослойного setup и в автоматическую single-layer серию не входил.

Retouch всё ещё передаёт полноразмерный processing buffer. Это потенциальный архитектурный P1, но на fixture preparation p95 всего 1,2–1,4 мс, adoption p95 1–1,6 мс, а rAF ≥50 мс = 0. Регионализация всего Retouch protocol сейчас имеет больший correctness-риск, чем измеримая польза, поэтому отложена.

### Mosh

Harness перед каждым сценарием удаляет дефолтный Pixel Sorter, поэтому rack содержит ровно заявленное число эффектов. Preview/Cancel во всех трёх сериях не изменил History.

| Rack | Apply | Изменившие пиксели | p50 | p95 | max | rAF max | gaps ≥50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPEG Resample | 10 | 8; ещё 2 корректных no-op после насыщения | 123,5 | 133,4 | 148,2 | 27,8 | 0 |
| JPEG + Pixel Sort + Feedback | 10 | 10 | 1318,6 | 1352,5 | 1363,3 | 13,9 | 0 |
| JPEG + Pixel Sort + Feedback + Flow Field + DCT | 10 | 10 | 2891,4 | 3006,8 | 3014,3 | 13,9 | 0 |

Это Worker/job latency, а не main-thread stall: даже 5-card серия продолжала выдавать кадры без gap ≥50 мс. Mosh возвращает full-document result и вызывает full canvas path; для explicit full-image Mosh это ожидаемо. Motion Transfer, target-mode matrix и near-cap fixture остаются browser-benchmark follow-up; deterministic unit tests покрывают processing/cancel/presets.

### Image Brush

| Режим / FX | Worker p95 | Worker max | Adoption p95 | Commit p95 | gaps ≥50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| JPEG Clean | 17,1 | 18,4 | 0,1 | 1,0 | 0 |
| JPEG Fixed | 45,6 | 50,6 | 0,1 | 0,9 | 0 |
| JPEG Progressive | 90,7 | 100,2 | 0,1 | 1,4 | 0 |
| JPEG Evolving | 95,6 | 98,6 | 0,1 | 1,7 | 0 |
| JPEG Stroke Gradient | 93,8 | 95,7 | 0,1 | 1,1 | 0 |
| JPEG Whole Trail | 33,7 | 37,7 | 0,1 | 0,9 | 0 |
| Pixel Embroidery Fixed | 21,0 | 22,2 | 0,1 | 0,9 | 0 |
| Xerox Decay Fixed | 22,2 | 22,3 | 0,1 | 0,9 | 0 |

Все случаи: 5 warm-up + 20 strokes, exact History, 0 full-sync, 0 fit. IndexedDB custom-library churn, multiple source assets и near-cap imported asset не повторялись в этой финальной browser session.

### UI, Layers и React

- Production UI acceptance прошла: Effect browser/keyboard focus preview, 4 unique NEW effects, collapsed legacy, Mosh registry, 17 Image Brush styles, splitter persistence/clamp/reset.
- Изолированная 30-layer серия: 29 Duplicate p95 11,75 мс; 20 Selection p95 7,90 мс; 20 Visibility p95 12,14 мс; 20 Reorder p95 12,26 мс; 20 Opacity p95 17,15 мс; 20 All Layers toggles p95 4,21 мс. Long Tasks и fit отсутствуют, rAF max 8,1 мс.
- 89 full canvas sync в layer-серии точно соответствуют 29 Duplicate + 20 Visibility + 20 Reorder + 20 Opacity. Selection и All Layers не вызвали full sync. Это ожидаемые полнохолстовые операции метаданных, а не скрытый per-frame путь.
- `react-post-commit` в 30-layer серии: p50 1,5 мс, p95 1,9 мс, max 2,3 мс. Массовая слепая memoization не оправдана.
- Bounded diagnostics не публикует растущий JSON в DOM и очищает собственные `performance.measure` entries при reset.

### Память

| Сценарий | Start | Checkpoints / Peak | End | History | Leak |
| --- | ---: | --- | ---: | --- | --- |
| 200 Slice + 100 Undo/Redo | 29,5 МБ | 121,9 / 93,6 / 84,0 / 98,1 / 120,2 МБ | 128,7 МБ | bounded snapshots/tiles retained | не доказана; saw-tooth GC |
| Baseline 20 Slice | — | — | +57,6 МБ | expected | не доказана |
| Baseline 20 Image Brush | — | — | +38,2 МБ | expected | не доказана |

Soak сделал 200 dirty uploads, 0 full sync, 0 fit, 100 exact Undo/Redo, rAF max 8,5 мс и 0 gaps даже ≥25 мс. `performance.memory` не даёт ArrayBuffer/History breakdown и forced GC не был доступен. Поэтому вывод ограничен отсутствием монотонного runaway, а не абсолютным доказательством отсутствия утечки.

### Браузеры

| Browser | Scenario | p50 | p95 | p99 | max | gaps ≥50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Edge headless | Slice short commit | ~1,3 | 1,6 | 1,7 | 1,9 | 0 |
| Edge headless | Image JPEG Progressive Worker | ~87–90 | 90,7 | 90,7 | 100,2 | 0 main-thread gaps |
| Firefox headless | Slice short commit | 2 | 3 | 3 | 5 | 0 |
| Firefox headless | Image JPEG Progressive Worker | 85 | 94 | 94 | 99 | 0 |
| Edge headed | Slice short commit, 3 strokes | 4,6 | 4,6 | 4,6 | 5,4 | 0 |
| Firefox headed | Slice short commit, 5 strokes | 2 | 3 | 3 | 3 | 2 (max 78,2; 0 ≥100) |

Firefox не предоставляет `performance.memory` и Long Task API; там использовались rAF gaps и BiDi. Edge headed automation требует `Page.bringToFront` и focus emulation; без этого синтетические pointer events не доходили до canvas, что было исправлено в harness, а не в приложении.

### Оставшиеся full-document paths

| Путь | Где | Почему пока нужен | Частота | Может стать regional | Приоритет |
| --- | --- | --- | --- | --- | --- |
| Retouch input/result | `startRetouchJob` / worker | engine и sample modes ожидают document coordinates | stroke | да, после protocol rewrite | P1 deferred; prep уже <1,4 мс p95 |
| Mosh full target | Mosh Apply | full-image/rack semantics | explicit Apply | region targets частично да | P2 |
| Compose after layer metadata | Layers actions | visibility/blend/order меняют весь result | explicit operation | иногда | P2 |
| Project serialization | layer/project codec | весь проект должен сохраниться | explicit save/load | Worker возможен | P2 |
| Export canvas/toBlob | `useExport` | full-resolution output | explicit export | нет по смыслу | P2 |
| Immutable raster Eraser | layer model | sparse transparent overlay не может вычесть underlying raster | explicit eraser | требует erasure mask/COW raster | product decision, не perf fix |

### Исправления и инварианты

- `src/utils/performance.ts`: bounded event/rAF rings, summaries, Long Task observer, reset/snapshot/export.
- `src/App.tsx`: lazy mask, conditional selected-layer compose, startup/Retouch/canvas metrics, opaque raster adoption.
- `src/workers/documentDecode.worker.ts`: Worker вычисляет opaque один раз и возвращает hint.
- `src/layers/sparseLayers.ts`: optional opaque hint при создании initial image stack.
- `src/history/PatchHistory.ts`: layer snapshot — authoritative Undo/Redo; raster-aware unique memory accounting.
- `src/psd/codec.ts`: early PSD header validation.
- `scripts/performance-browser-acceptance.mjs`: Edge/Firefox, headless/headed, startup/UI/Effect/Retouch/Mosh/Image Brush, warm-ups, exact History, rAF, heap checkpoints, configurable strokes/history cycles.
- Tests проверяют bounded diagnostics, reset scope/generation, Long Task/rAF buckets, PSD oversize reject до decode, shared raster memory counted once и layer-backed Undo/Redo snapshot semantics.

### Bundle

Baseline main: 565,85 KiB / 172,33 KiB gzip. Текущий финальный build после статичных Image Brush style previews: 569,98 KiB / 173,83 KiB gzip; CSS 109,25 / 20,62 KiB. Увеличение связано главным образом с диагностикой, доступной только при `?perf=1`, startup metadata и лёгкой раскладкой готовых thumbnail. Vite warning >550 KiB остаётся; Mosh и Image Brush панели уже lazy chunks, поэтому слепой manual chunking без загрузочного профиля не применялся.

### Что не измерено полностью

- Полная combinatorial матрица 512×512 + near-cap + transparent/noise/faces/text для каждого инструмента.
- Все Effects в long/large/slow/fast/All Layers/12-layer комбинациях; short all-tools и representative long выполнены.
- Clone Corruption с заданным source; Restore Lower Layer с multi-layer setup.
- Mosh Motion Transfer, все target modes и near-cap fixture; точные 1/3/5-card серии выполнены.
- Near-cap multi-layer matrix, полный project import/export и все форматы export в browser profiler; изолированная 30-layer action-серия выполнена.
- Forced-GC heap snapshot, detached DOM и ArrayBuffer census.

Эти пункты не скрыты и не выданы за пройденные. Они являются отдельной большой матрицей, а не основанием задерживать подтверждённые безопасные P0/P1 fixes.

### Отложенные архитектурные идеи

- persistent Image Brush/Retouch Worker;
- packed path arrays;
- region-aware Retouch protocol;
- full tile-delta History/replacement tiles;
- thumbnail bitmap cache после 30-layer профиля;
- worker-side project serialization;
- OffscreenCanvas/WASM/GPU только после нового подтверждённого main-thread bottleneck.

### Финальная проверка

Финальные `npm run typecheck` ✓; `npm test -- --run` ✓ — 298/298 (20 files); `npm run build` ✓ — 1666 modules, main 569,98 KiB / 173,83 KiB gzip. `git diff --check`, `git status --short` и `git diff --stat` зафиксированы в финальном ответе; commit/push не выполнялись.
