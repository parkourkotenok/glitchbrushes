# NEW LAB — experimental brushes report (2026-08-21)

> Historical report. Halftone Collapse was retired from the production build in the subsequent compact-browser/JPEG Resample pass; its rows below document the earlier benchmark only.

## Реализовано

Все шесть инструментов помечены общим metadata-флагом `experimental: true`; React-компоненты не содержат отдельного списка экспериментальных ID.

### Effect Brushes

| Инструмент        | Simple                                             | Advanced                                                                 |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Mirror Fold       | Fold Side, Axis, Fold Offset, Mix                  | Repetitions, RGB Slip, Edge Mode, Falloff, Fallback Angle                |
| Halftone Collapse | Cell Size, Collapse, Dot Gain, Color Mode          | Grid Angle, Drift, Channel Offset, Shape, Background Mix, Fallback Angle |
| Raster Loom       | Strip Width, Source Offset, Weave Depth, Direction | Gap, RGB Slip, Alternation, Edge Softness, Mix, Fallback Angle           |
| Contour Crawl     | Edge Threshold, Crawl Length, Repeat Count, Decay  | Line Width, RGB Split, Side Drift, Edge Polarity, Mix, Fallback Angle    |

Все четыре эффекта используют реальное направление или fallback-угол мазка, обрабатываются существующим Brush Worker, возвращают только `writeBounds`, сохраняют alpha и читают только clipped/padded локальный snapshot. Число повторов, spill и padding ограничены сверху. Новые ID не входят в `structuralMixPool`, built-in presets или прежний Advanced randomizer.

### Image Brush FX

| FX               | Настройки                                                                                                           | Стадии                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Pixel Embroidery | Grid Size, Stitch Type, Palette Levels, Thread Angle, Missing Stitches, Thread Jitter, Background Transparency, Mix | Tip, Per Stamp, Whole Trail |
| Xerox Decay      | Threshold, Toner Loss, Speckle, Edge Erosion, Banding, Black Crush, Mono/Duotone, Mix                               | Tip, Per Stamp, Whole Trail |

Pixel Embroidery строит настоящую сетку cross/diagonal/bead/square-стежков с квантованием цвета. Xerox Decay использует существующие amount/evolution режимы, включая Progressive, Evolving, Stroke Gradient и Whole Trail, без параллельной системы progression. Оба FX работают внутри локального tip/stamp/trail buffer и существующего bounded variant Worker; `maxGeneratedStamps` не изменён.

## UI и совместимость

- В Effect Picker добавлена верхняя группа `NEW / EXPERIMENTAL`; experimental-элементы не дублируются в обычных группах.
- `NEW` сохраняется в строке списка, trigger и статическом Effect Preview. Image Brush FX отсортированы первыми и сохраняют бейдж в rack.
- Новые FX не входят в built-in Image Brush presets/default pool, а Randomize фильтрует experimental definitions. Явно добавленный rack/project сохраняет ID и настройки.
- Настройки новых FX опциональны в persisted type; движок и UI заполняют отсутствующие поля стабильными defaults, поэтому старые проекты открываются без миграционной ошибки.

## Статичные Effect previews

Созданы отдельные `after` и `difference` WebP для:

- `mirror-fold-brush`
- `halftone-collapse-brush`
- `raster-loom-brush`
- `contour-crawl-brush`

Файлы находятся в `public/assets/effect-previews/`; общий original — прежний `parkour-kotenok-road` preview. Генератор остаётся `npm run generate:effect-previews`.

## Автоматические проверки

- `npm run typecheck` — pass.
- `npm test -- --run` — 223/223, 11 files.
- `npm run build` — pass, Vite production build.
- Тесты Effect Brush покрывают byte-exact seed, seed variation, реальное изменение, alpha, `writeBounds`, края/малые bounds, fallback movement и экстремальные bounded settings.
- Тесты Image Brush покрывают детерминизм, прозрачность, grid result, Progressive/Evolving Xerox, стадии и project round-trip.
- Production UI assertions покрывают NEW-группу/бейджи, отсутствие дублей и исключение из default/random pools.

## Browser acceptance

Production build проверен на opaque 1280×960 Image layer, Normal, opacity 100%. На каждый Effect Brush выполнено 20 коротких и 20 длинных мазков в Microsoft Edge 151 и headed Firefox 154. Для Image Brush выполнено по 20 мазков Pixel Embroidery и Xerox Decay Progressive/Evolving.

Во всех сериях:

- 20/20 bounded dirty uploads;
- full-sync delta `0`;
- fit-to-screen delta `0`;
- zoom стабилен;
- rAF gaps ≥50 ms: `0`;
- Undo/Redo восстанавливает byte-exact SHA-256 холста.

### Effect Brush main-thread path, ms

Adoption во всех Edge-сериях: p50 ≤0.1, p95 ≤0.2, max ≤0.2. Canvas upload: p50 ≤0.1, p95 ≤0.2, max ≤0.5. В Firefox adoption: p50 0, p95 ≤1, max ≤1; canvas upload: p50 0, p95 ≤1, max ≤5.

| Browser / Effect            | Stroke | Commit p50 |  p95 |  max |
| --------------------------- | ------ | ---------: | ---: | ---: |
| Edge / Mirror Fold          | short  |        1.2 |  4.7 |  5.0 |
| Edge / Mirror Fold          | long   |        6.1 | 13.4 | 18.5 |
| Edge / Halftone Collapse    | short  |        1.3 |  4.6 |  5.1 |
| Edge / Halftone Collapse    | long   |        5.0 | 12.8 | 17.3 |
| Edge / Raster Loom          | short  |        1.2 |  4.4 |  4.5 |
| Edge / Raster Loom          | long   |        4.7 | 18.3 | 18.9 |
| Edge / Contour Crawl        | short  |        1.1 |  4.2 |  4.4 |
| Edge / Contour Crawl        | long   |        5.2 | 10.0 | 24.2 |
| Firefox / Mirror Fold       | short  |          2 |    5 |    9 |
| Firefox / Mirror Fold       | long   |          5 |    7 |   10 |
| Firefox / Halftone Collapse | short  |          1 |    2 |   12 |
| Firefox / Halftone Collapse | long   |          6 |    6 |    7 |
| Firefox / Raster Loom       | short  |          1 |    1 |    2 |
| Firefox / Raster Loom       | long   |          5 |    6 |   11 |
| Firefox / Contour Crawl     | short  |          1 |    2 |    2 |
| Firefox / Contour Crawl     | long   |          5 |    6 |    6 |

Отдельный повторный Edge Undo/Redo прогон Mirror Fold показал более шумный commit p50/p95/max 2.8/17.4/22.9 ms, но сохранил 0 rAF gaps ≥50 ms и все invariants.

### Image Brush main-thread path, ms

| Browser / FX               | Mode / stroke       | Commit p50 | p95 | max | Adoption p95 | Upload p95 |
| -------------------------- | ------------------- | ---------: | --: | --: | -----------: | ---------: |
| Edge / Pixel Embroidery    | Clean / long        |        1.7 | 3.8 | 9.5 |          0.1 |        0.2 |
| Edge / Xerox Decay         | Progressive / long  |        2.1 | 6.1 | 8.2 |          0.1 |        0.2 |
| Edge / Xerox Decay         | Evolving / short    |        0.7 | 0.9 | 2.6 |          0.1 |        0.1 |
| Firefox / Pixel Embroidery | Clean / short       |          1 |   2 |   2 |            0 |          1 |
| Firefox / Xerox Decay      | Progressive / short |          1 |   1 |   2 |            0 |          1 |
| Firefox / Xerox Decay      | Evolving / short    |          1 |   4 |   9 |            1 |          1 |

Worker latency остаётся асинхронной и не входит в main-thread commit numbers. Harness ждёт завершения каждого Worker job перед следующим мазком, поэтому пропущенные/obsolete результаты не маскируются.

## Ограничения и следующая пачка

- Halftone Collapse v1 поддерживает Mono/RGB, но не CMYK.
- Очень длинные плотные Evolving trail с большим исходным stamp могут заметно дольше считаться в Worker; UI остаётся отзывчивым, а рабочую копию можно уменьшить через Optimize Stamp Image.
- Experimental-инструменты намеренно не участвуют в автоматических комбинациях до пользовательского одобрения.
- Сознательно отложены: Ribbon Warp, Ink Bleed, Cellular Fracture, Posterize Melt, Chromatic Ribbon, Alpha Ghost, Stencil Cutout, Tile Mosaic, Shadow Offset, Turbulence Trail и Rubber Stamp Offset.

## Current integrated status — 2026-08-22

Этот отчёт фиксирует первоначальный NEW LAB. После него Halftone Collapse полностью удалён из production и мигрирует на Slice Displacement; добавлен общий JPEG Resample для Effect/Mosh/Image Brush, а Image Brush получил smooth Progressive Decay и независимый Fade along stroke. Текущая проверка: typecheck, 282/282 теста и production build.
