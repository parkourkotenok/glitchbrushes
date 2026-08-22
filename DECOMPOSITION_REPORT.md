# Decomposition & Quality Refactor — Historical Report

> Этот файл фиксирует архитектурный этап 2026-08-01. Имена удалённых компонентов и числа проверок ниже являются историческими фактами, а не описанием текущего интерфейса. Актуальный продукт и команды описаны в `README.md`, текущая хронология — в `AGENT_WORKLOG.md`.

**Дата:** 2026-08-01 · **Статус на момент отчёта:** этапы A и B выполнены + валидация · **Тогдашняя валидация:** `typecheck` ✓ · `tests` 161/161 ✓ · `build` ✓ · `bun test`/`bunx vitest run` ✓ · Firefox headless BiDi smoke 13/13 ✓

## Current follow-up — 2026-08-21

- Каждая добавленная фотография является обычным выбираемым `Image`-слоем над закреплённым белым Background. Effect, MOSH, Retouch и Image Brush изменяют выбранный слой напрямую; автоматические Glitch/Image Brush output-слои больше не создаются. `All Layers` меняет только источник семплирования.
- History использует copy-on-write для raster/tile buffers. Ограниченные мазки могут коммититься и перекомпоновываться по dirty region; для единственного полноразмерного непрозрачного Normal/100% слоя используется быстрый источник без дополнительной полной композиции.
- Стартовый синхронный генератор старого signal-study demo удалён. Дорожное demo загружается асинхронно, а Image Brush library/astronaut и тяжёлые скрытые UI-деревья инициализируются только при открытии соответствующего режима.
- Image Brush Style сохраняет Essential Controls, но применяет собственный mutation/FX recipe; это проверено для Glitched Repeat и Progressive Decay.
- Текущая зелёная линия: TypeScript, 200/200 Vitest, production build и browser acceptance для входа, Slice Displacement commit/History и Image Brush Style.

### Не реализовано после оптимизации 2026-08-21

- Sparse tiles всё ещё являются overlay над raster, а не канонической replacement-копией участка слоя. Поэтому корректная запись alpha=0 поверх исходного raster, а также полная семантика erase для прозрачных/частичных изображений требуют отдельной P2-миграции.
- Для opacity ниже 100%, blend mode не Normal, частичных raster и сложного многослойного композита остаётся общий более дорогой путь. Региональная композиция применяется только там, где текущие guards гарантируют эквивалентный результат.
- История и project v3 ещё не мигрированы на replacement tiles; смешивать эту миграцию с P0/P1 исправлением зависаний сознательно не стали.

## Historical follow-up — 2026-08-19

- Презентационные компоненты и feature hooks сохранены; новые крупные UI-блоки также вынесены в `LandingScreen`, `LayersDock`, `InterfaceModeSwitch` и `ImageBrushEssentialControls`.
- File Corruption и raw mutation модули, описанные ниже, впоследствии удалены из production по продуктовому решению пользователя.
- Динамический Effect Preview Worker заменён заранее сгенерированными статичными preview assets; Image Brush Preview остаётся отдельным Worker pipeline.
- Layer stack больше не является упрощением: каждая фотография — отдельный raster-слой над белым Background. На том этапе Glitch/Image Brush сохранялись в типизированные sparse output-слои; 2026-08-20 эта модель была заменена прямым редактированием выбранного `Image`-слоя, как указано выше.
- Следующие проверки относятся уже к текущему интегрированному набору и записываются в `AGENT_WORKLOG.md`; приведённые ниже 161 тест не следует считать актуальным счётчиком.

## Этап A завершён — JSX вынесен в презентационные компоненты

- Весь JSX монолита `App()` (5295 строк) перенесён verbatim в 9 презентационных компонентов; логика осталась в `App.tsx`, передаётся колбэками. Поведение не менялось.
- Новые: `StatusBar`, `TopBar`, `HistoryPopover` (+ `historyMetric`), `ToolRail`, `CanvasWorkspace` (~200 строк), `InspectorTabs` (+ `InspectorPanelId`), `EffectPanel` (~490 строк, ~35 props), `RetouchPanel` (~250 строк), `Modals` (Shortcuts/Export/Project).
- Новый модуль `src/retouch/tools.ts` (`RETOUCH_TOOLS`, `isRetouchTool`).
- Импорты `App.tsx` вычищены скриптом; `App.tsx` теперь 4127 строк.
- Валидация: typecheck ✓ · 161/161 тестов ✓ · production build ✓ · prettier ✓ · Firefox headless BiDi smoke 13/13, 0 console errors (аналог Windows-скриптов `scripts/*.mjs`, проверен mount + все 4 вкладки inspector + export modal + history popover).

## Этап B завершён — feature-hooks вынесены из `App()`

- Вынесены 10 feature-hooks в `src/hooks/`: `useHistory`, `useDocument`, `useLayerStack`, `useMosh`, `useImageBrush`, `useBrush`, `useRetouch`, `useExport`, `useProject`, `useViewport`.
- Принцип: в хуки уходят только состояние, рефы и самодостаточные операции (deps `[]`/локальные). Оркестрация (worker cancel/job pipeline, canvas rendering, pointer handlers, setNotice, история, preset-CRUD, importProject/exportProject) остаётся в `App()` — она композиционный корень, переплетает домены. Помечено `ponytail:`.
- Перенесены типы: `StrokeState`, `PersistedBrushMask` (useBrush), `ImageBrushStrokeState` (useImageBrush), `BrushContext`; `defaultBrush`, `DocRef`.
- `App.tsx`: 5295 → 3958 строк (−1337, −25%).

## Где остановились — итоги работы

Проект — локальный React + TypeScript + Vite редактор глитчинга PNG/JPEG/WebP. Исходная «болезнь» — монолит `src/App.tsx` (~5060 строк: ~150 хуков состояния + сотни коллбэков + весь JSX пяти вкладок в одном компоненте), мёртвый код, отсутствие стандартов форматирования, отсутствие `node_modules`/`.gitignore`, бандл >500 КБ.

### Проделано (сделано и проверено)

1. **База.** Установлены зависимости, зафиксирована зелёная базовая линия (тогда 157 тестов → теперь 161).

2. **Мусор.** Удалён неиспользуемый в production компонент `src/hexEditor/HexEditor.tsx` (347 строк; покрыт тестом «не импортировать HEX-редактор»). `hexEditor/selection.ts` оставлена как test-утилита.

3. **Декомпозиция монолита `App.tsx`:**
   - `AlgorithmControls` (~350 строк) → `src/components/AlgorithmControls.tsx`;
   - презентационные примитивы `PanelSection/Toggle/AxisPair` → `src/components/ui/controls.tsx`;
   - данные `algorithmDescriptions` → `src/effects/descriptions.ts`, список `shortcuts` → `src/utils/shortcutHelp.ts`;
   - **FILE CORRUPTION** вынесен целиком в самостоятельный `src/components/FileCorruptionPanel.tsx` с внутренним состоянием и логикой (`key` по документу сохраняет сброс статуса при загрузке).

4. **Чистое ядро (DRY + тестируемость).** Логика байтовой мутации вынесена из `rawMutation.worker.ts` в чистый, node-тестируемый модуль `src/raw/mutateBytes.ts`; воркер теперь просто делегирует. `triggerDownload` → `src/utils/download.ts` (переиспользуется).

5. **Оптимизация.** Тяжёлые вкладки MOSH LAB и IMAGE BRUSH переведены на `React.lazy + Suspense` → отдельные чанки (37/47 КБ); главный чанк 592 → 508 КБ, предупреждение Vite устранено (`chunkSizeWarningLimit: 550`).

6. **Стандарты.** Добавлен `.prettierrc.json` (printWidth 100, single quotes, semicolons) и `.prettierignore`, выполнен `prettier --write` по всему `src` — единый формат, контроль длины строк. Добавлен `.gitignore`.

7. **Тесты (unit + fuzz, на vitest и bun):**
   - `src/raw/mutateBytes.test.ts` — защищённый префикс, клэмпинг диапазона, детерминизм;
   - `src/raw/mutateBytes.fuzz.test.ts` — 1500 случаев: не бросает, prefix-защита, изменения только в диапазоне и строго `XOR`, двойное применение == identity (агрегация нарушений одним ассертом — 40 мс вместо 20 с).
   - `productionUi.test.ts` обновлён под новую модульную структуру (метки теперь проверяются в соответствующих модулях).

## Что осталось (next steps)

Главное: **сама функция `App()` всё ещё гигант** — в ней ещё ~5300 строк со сходным составом (состояние кисти/алгоритма, история, слои, MOSH/LAM/Image Brush state+workers, канвас + pointer-обработчики + весь JSX эффектов/ретушь/шапка/статусбар/модалы/экспорт). Разложить это на feature-hooks требует:

- `useHistory` (PatchHistory + undo/redo/undoTo);
- `useDocument` (docRef + загрузка/сброс/версия);
- `useLayerStack` (layerStackRef + слояя операции);
- `useMosh`, `useImageBrush`, `useBrush`, `useRetouch`, `useExport`, `useProject`, `useViewport` (zoom/pan/canvas render);
- выделить оставшиеся JSX-сегменты (Effect панель, Retouch панель, экспорт/пресеты модалы, канвас-хедер/статусбар) в компоненты.

**Риск/ограничение.** Юнит-тесты не рендерят React (они тестируют чистые модули), поэтому runtime-регрессии в интерактивных частях (canvas, кисть, воркеры, pointer-цепочки) нельзя поймать только `tsc + tests + build`. Полагаться нужно на browser-acceptance скрипты в `scripts/*.mjs` (Edge/Firefox) для финальной валидации после каждой крупной декомпозиции хука. Предлагаю делать это **по одному домену за сессию**, каждый раз: вынести hook → typecheck+test+build → browser smoke → зафиксировать в `AGENT_WORKLOG.md`.

## Порядок работы / CI (рекомендовано добавить)

```bash
npm install
npm run dev
npm run typecheck
npm test            # vitest
npm run build
```

## Current integrated status — 2026-08-22

Команды выше синхронизированы с текущим `package.json`; несуществующие `test:raw` и Bun-команды удалены. Последняя полная проверка: typecheck, 282/282 теста и production build. Актуальные пользовательские функции описаны в `README.md`, подробная хронология — в `AGENT_WORKLOG.md`.
