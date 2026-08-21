# Post-stroke production performance — 2026-08-21

База сравнения: `c59c5361de47699dfb65c3ea570184025954e1c2`. Документ во всех интерактивных сериях — встроенный JPEG 1280×960 (1,228,800 pixels), один полноразмерный непрозрачный Image-слой, Normal, opacity 100%. Сборка запускалась через `vite preview`; `?perf=1` включает bounded diagnostics (не более 120 последних samples на метрику).

## Что изменено

- `documentVersion` остаётся pixel revision для signatures/stale-preview/UI. Новый `documentSurfaceVersion` управляет только canvas initialization/full sync и automatic fit при replace/import/add-image/original/dimensions change.
- Bounded stroke явно обновляет только dirty bounds и больше не получает второй full upload/fit в следующем rAF.
- Brush Worker возвращает `writeBounds.width × writeBounds.height × 4` bytes. Полноразмерный source input пока сохранён; это позволяет измерять его отдельно и не смешивает P1 с region-aware algorithm migration.
- Успешные one-shot Brush, Image Brush, Retouch и Mosh Workers закрываются через `self.close()` после transferable result. Main thread использует `terminate()` только для cancel, timeout, obsolete/error lifecycle.
- Image Brush diagnostics разделены на `pointerUpToResultMs`, `resultAdoptionMs`, `layerCommitMs`, `canvasUploadMs`; прежнее неверное имя `pointerUpCommitMs` удалено.
- Full mask не выделяется заново после Worker stroke: очищаются только строки `stroke.bounds`.
- History memory пересчитывается только при push/undo/redo/clear/eviction; getter O(1), shared COW ArrayBuffers учитываются один раз. App memoizes History по `historyVersion`, layers по `layerVersion`.

## Baseline → final, Chromium production

20 коротких Slice Displacement strokes:

| Метрика | `c59c536` | Final |
| --- | ---: | ---: |
| Dirty canvas uploads | 20 | 20 |
| Повторные full canvas sync | 20 | 0 |
| Automatic fit-to-screen | 20 | 0 |
| Layer commit p50 / p95 / max | 1.5 / 6.8 / 7.0 ms | 1.5 / 5.1 / 6.9 ms |
| Full sync p50 / p95 / max | 0.3 / 0.4 / 0.5 ms | не вызывается |
| Fit p50 / p95 / max | 0.0 / 0.1 / 0.3 ms | не вызывается |
| Pointer-up p50 / p95 / max | 1.5 / 1.9 / 2.8 ms | 1.6 / 2.1 / 2.5 ms |

Дополнительные final серии, по 20 strokes:

| Сценарий | Result adoption p50/p95/max | Layer commit p50/p95/max | Dirty upload p50/p95/max |
| --- | ---: | ---: | ---: |
| Pixel Sort Brush | 0.0 / 0.1 / 0.2 ms | 1.5 / 2.6 / 2.7 ms | 0.1 / 0.2 / 0.2 ms |
| Displacement Brush | 0.0 / 0.1 / 0.1 ms | 1.6 / 2.8 / 3.1 ms | 0.1 / 0.2 / 0.2 ms |
| Slice Displacement, long | 0.1 / 0.3 / 0.3 ms | 5.8 / 7.6 / 13.4 ms | 0.1 / 0.2 / 0.2 ms |
| Image Brush Glitched Repeat | 0.0 / 0.1 / 0.1 ms | 0.9 / 2.6 / 3.0 ms | 0.1 / 0.2 / 0.3 ms |
| Image Brush Progressive Decay | 0.0 / 0.1 / 0.1 ms | 0.7 / 0.9 / 0.9 ms | 0.1 / 0.2 / 0.3 ms |

Image Brush Glitched Repeat: synchronous pointer-up p50/p95/max = 0.4/0.5/1.2 ms. Асинхронный pointer-up→Worker-result = 74.3/94.2/101.4 ms; это Worker latency, а не main-thread block. History memory getter был прочитан ровно 20 раз на 20 завершённых действий, а не на progress renders.

## Headed browsers

Оба браузера запущены с отдельным временным профилем на production build, по 20 Slice strokes:

| Browser | Full sync / fit | Adoption p50/p95/max | Commit p50/p95/max | Canvas p50/p95/max | rAF max / gaps ≥50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Edge 151 | 0 / 0 | 0.0 / 0.1 / 0.1 ms | 1.5 / 5.8 / 7.4 ms | 0.1 / 0.2 / 0.3 ms | 7.1 ms / 0 |
| Firefox 154 headed | 0 / 0 | 0 / 0 / 0 ms | 2 / 6 / 6 ms | 0 / 2 / 5 ms | 6.96 ms / 0 |

Zoom оставался неизменным в обеих сериях. Test harness: `scripts/performance-browser-acceptance.mjs`.

## Full-canvas пути, которые остались

- Replace document/demo и Project import: новая document surface, resize/full sync/fit ожидаемы.
- Add image: dimensions сохраняются, но меняется `original` identity; выполняется явный full composite/upload и один surface refresh.
- Layer metadata/visibility/reorder/merge/flatten, Reset, Undo/Redo и explicit full restore по-прежнему могут полностью перекомпоновать и загрузить документ.
- Effect/Retouch/Mosh Worker input всё ещё использует full source copy. Effect result уже region-only; region-aware input оставлен следующей отдельной оптимизацией, если source copy проявится как измеренный long task.
- Retouch и Mosh result пока полноразмерные. Image Brush передаёт cropped document region, но всё ещё копирует нужные asset buffers для каждого one-shot job.
- Feedback Brush сохраняет full feedback memory для прежней семантики; его изменённый участок обновляется из region result.

## Не реализовано и ограничения

- P2 replacement-tile migration не начиналась: alpha=0 поверх raster, настоящий erase и materialized replacement tiles остаются отдельной задачей.
- LayerTileDelta/History только для изменённых tile refs не понадобился: измеренный `layerCommitMs` не превысил frame budget даже в длинной серии (max 13.4 ms).
- Persistent Image Brush Worker и transferable Float32 path не внедрялись: синхронный pointer-up max 1.2 ms, adoption/commit/canvas укладываются в frame; оставшиеся 74–101 ms проходят асинхронно в Worker.
- Низкоуровневая instrumentation не доказывает плавность произвольного железа. Она доказывает отсутствие прежних повторных full-sync/fit и отсутствие ≥50 ms rAF gaps в перечисленных production-сериях.

## Проверки

- `npm run typecheck`
- `npm test -- --run` — 204/204
- `npm run build`
- Региональный Brush result byte-exact совпадает с crop полноразмерного обработанного результата в regression test.
- History unique/shared-buffer accounting и static lifecycle assertions для surface version, mask reuse, production launcher и Worker `self.close()` покрыты тестами.
