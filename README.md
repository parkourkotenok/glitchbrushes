# imgfuck

`imgfuck` — локальная игрушка для разрушения изображений и художественного глитчинга PNG, JPEG и WebP. Изображения не отправляются на сервер: декодирование, слои, кисти, MOSH LAB, IMAGE BRUSH, история, FILE CORRUPTION и экспорт выполняются в браузере.

## Рабочие пространства

- **EFFECT** — локальные структурные RGBA-эффекты и обычная glitch-кисть.
- **RETOUCH** — Smudge, Blur, Sharpen, Restore и Eraser для активного слоя.
- **MOSH LAB** — последовательный rack эффектов с Preview, Apply, Cancel и отдельными целями.
- **IMAGE BRUSH** — PNG/JPEG/WebP как штамп с пресетами, мутацией и совместимыми MOSH FX.
- **FILE CORRUPTION** — экспериментальная мутация байтов закодированного файла с проверкой декодирования.

Интерактивный HEX-редактор больше не входит в production-интерфейс. Низкоуровневые функции выбора RGBA-диапазонов оставлены только как внутренние тестовые утилиты; кнопки, вкладки, маршрута и справки HEX в обычном приложении нет.

## Основные возможности

- Неизменяемый Original и независимые sparse glitch-слои на прозрачных тайлах 256×256.
- Добавление, дублирование, удаление, переименование, блокировка, solo, видимость, порядок, opacity, blend mode, Merge Down и Flatten Visible.
- Один атомарный History action на завершённый мазок, MOSH Apply или операцию со слоем.
- Block Corruption объединяет shift/repeat/dropout/neighbor/swap/stretch и packet-loss поведение.
- Codec Block Damage объединяет compression loss, tile scramble, coefficient dropout, repeat и recompression.
- Pixel Noise и Bit Flip удалены из обычного выбора; полезные старые byte-level эффекты скрыты за **Show Legacy Effects**.
- Один lazy Worker preview для выбранного/hovered эффекта; stale-задачи отменяются, результаты кэшируются ограниченно.
- MOSH LAB имеет раздельные Randomize Parameters, Randomize Effects, Shuffle Order, Randomize Everything и New Result, а Lock Seed воспроизводит рецепт точно.
- IMAGE BRUSH использует общий FX registry, показывает совместимость Tip / Per Stamp / Whole Trail, реальные A/B-примеры и оптимизацию рабочего stamp image без удаления оригинала.
- Processing mask по умолчанию скрыта; временные overlay не остаются после commit/cancel.

## Retouch

Все Retouch-инструменты изменяют только активный редактируемый glitch-слой и создают одно действие History на мазок.

- **Smudge** переносит выбранный цвет и структуру вдоль пути; Pickup, Wetness и давление меняют перенос, это не простой blur.
- **Blur** локально снижает высокочастотную детализацию; доступны Radius, Iterations и Edge Protection.
- **Sharpen** использует локальный high-pass/unsharp подход с Radius, Threshold и Protect Noise.
- **Restore** читает из Original, Lower Layer или Previous History State.
- **Eraser** уменьшает альфу только активного glitch-слоя; Original не стирается, пустые sparse-тайлы освобождаются.

Для Smudge, Blur и Sharpen можно переключить **Sample Merged Layers**. Тяжёлая обработка выполняется в Worker внутри локального dirty rectangle.

## FILE CORRUPTION

Этот режим изменяет байты внутри сжатого PNG, JPEG или WebP, а не декодированные пиксели. Закодированные байты не соответствуют видимым координатам: небольшая мутация может повредить удалённую часть изображения, изменить весь кадр или сделать файл нечитаемым.

- **Protected Prefix** — неизменяемое начало файла, минимум 64 байта.
- **Mutation Count** — точное число операций над байтами за попытку.
- **Mutation Range** — допустимый диапазон внутри незащищённой части файла; это не координаты изображения.
- **XOR Amount** — точная 8-битная XOR-маска.
- **Retry Limit** — максимальное число независимо seeded попыток декодирования.
- **Decode Status** — результат проверки браузером.

Каждая повторная попытка начинается с неизменённых байтов до операции. Невалидные кандидаты отбрасываются, а валидный бинарный результат можно скачать напрямую без повторного pixel encoding. Для контролируемого локального редактирования используйте EFFECT, MOSH LAB, IMAGE BRUSH или RETOUCH.

## IMAGE BRUSH

Основной workflow остаётся preset-first. Всегда видны активный stamp, Style Preset, mutation mode, Size, Spacing, Opacity, Glitch Amount, Variation, Optimize Stamp Image и текущий preview. Параметры, которые выбранный mutation mode не читает, скрыты.

Оптимизация хранит исходный asset отдельно и создаёт уменьшенную рабочую копию Auto/64/128/256/512 px. Whole Trail поддерживает подходящие MOSH FX, включая Motion Transfer; несовместимые Tip/Per Stamp сочетания блокируются с явным объяснением.

Встроены 15 Style Presets. Для связного постпроцессинга доступны отдельные `Whole Trail`, `MOSH Flow Trail` и `Codec Damage Trail`; они используют тот же общий FX registry, что EFFECT и MOSH LAB. Clone Corruption имеет шесть явных режимов: Clean, Fragment, Slice, Packet, RGB и Evolving, а Aligned/Non-aligned отдельно объясняют движение источника.

## Горячие клавиши

Клавиши определяются через `KeyboardEvent.code`, поэтому работают при русской раскладке.

| Клавиша                         | Действие                                      |
| ------------------------------- | --------------------------------------------- |
| `B`                             | Glitch Brush                                  |
| `H`                             | Hand / pan                                    |
| `S`                             | Smudge                                        |
| `U`                             | Blur                                          |
| `J`                             | Sharpen                                       |
| `E`                             | Restore                                       |
| `X`                             | Eraser                                        |
| `G`                             | Random seeded glitch                          |
| `[` / `]`                       | Уменьшить / увеличить кисть                   |
| `Space + drag`                  | Временный pan                                 |
| `Ctrl + Z`                      | Undo                                          |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo                                          |
| `\\`                            | Удерживать для Original                       |
| `F`                             | Fit image                                     |
| `1`                             | 100% zoom                                     |
| `Enter` / `Escape`              | Apply / Cancel Preview                        |
| `Shift + click`                 | Выбрать пиксель для selection-target эффектов |

## Запуск и проверка

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Все тесты проходят и на Bun (рантайм): полный набор через `bunx vitest run`, а быстрые чистые node-тесты (напр. raw-corruption ядро) через нативный `bun test src/raw` / `npm run test:raw`. Чистое ядро raw-мутации (`src/raw/mutateBytes.ts`) покрыто юнит- и фuzz-тестами (детерминированный корпус, инварианты защищённого префикса/диапазона/повторного применения).

Production-сборка создаётся в `dist/`. Desktop packaging в текущую задачу не входит.

## Структура

```text
src/
  brush/              structural brush Worker engine
  components/         editor panels and shared previews
    ui/controls.tsx     PanelSection / Toggle / AxisPair primitives
    AlgorithmControls.tsx  per-algorithm EFFECT controls
  effects/            shared EFFECT/MOSH/IMAGE BRUSH registry (+ descriptions.ts)
  glitchAlgorithms/   deterministic RGBA algorithms
  hexEditor/          internal/test-only selection helpers; no production UI
  history/            patch-based Undo/Redo
  imageBrush/         assets, presets, path and rendering engine
  layers/             sparse tiled layer stack and composition
  mosh/               rack effects, presets and transactions
  retouch/            Smudge/Blur/Sharpen/Restore engine and types
  utils/              geometry, prng, shortcuts (+ shortcutHelp.ts list)
  workers/            brush, preview, MOSH, retouch and file-corruption Workers
```

Интерактивные вкладки MOSH LAB и IMAGE BRUSH загружаются лениво (React.lazy + Suspense) и собираются в отдельные чанки, чтобы основной бандл оставался компактным. Форматирование единообразно через Prettier (`.prettierrc.json`).

Фактические этапы, измерения, известные ограничения и browser-артефакты записываются в [`AGENT_WORKLOG.md`](./AGENT_WORKLOG.md).
