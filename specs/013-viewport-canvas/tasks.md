---

description: "Task list for viewport-canvas"
---

# Tasks: Viewport Canvas

**Input**: Design documents from `/specs/013-viewport-canvas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/viewport-api.md, quickstart.md. Adds a barebones SvelteKit skeleton (`vite.config.ts` with the SvelteKit config, `src/app.html`, `src/app.d.ts`, `src/routes/`), the module `src/lib/viewport/` (`types.ts`, `projection.ts`, `expand.ts`, `Viewport.svelte`, `index.ts`), a real-mouse Vitest browser command in `tests/setup/`, and tests in `tests/unit/viewport/`. Modifies `package.json`, `tsconfig.json`, `.gitignore`, and `vitest.config.ts`. Nothing under `src/core/` changes; `vitest.tick-bench.config.ts` and `eslint.config.js` are unchanged.

**Tests**: Included. The spec (SC-001 to SC-005) and constitution Principle IV require vitest tests with real buffers and a real DOM (no mocks) plus a benchmark proving zero JS heap allocation and the time budget for the expansion loop.

**Organization**: Tasks are grouped by user story: US1 = Render a Frame Crisply at Any Display Size (P1), US2 = Stay Fitted When the Layout Changes (P1), US3 = Primary Pointer Routes to the Kinematic Compositor (P1), US4 = Middle-Mouse Drag Routes to Windowing (P1), US5 = The Engine Never Sees the DOM (P1). Phase 1 scaffolds SvelteKit before any component work. Phase 2 holds the shared types and the real-mouse test command. `Viewport.svelte` is built up across US1 (canvas, context, `render`, CSS), US2 (`ResizeObserver` and fit), US3 (primary pointer route), and US4 (windowing route); each story adds to the same file, so those component tasks run in order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, never chain commands with `&&`, `||`, or `;` beyond the mandatory prefix, and always use `npx vitest run` (never watch mode). If a run prints no output, rerun it with its output redirected to a file under `/tmp` and read that file back; do not assume success without evidence
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V); the same applies inside `<script lang="ts">` blocks in `.svelte` files (ESLint does not lint `.svelte` files, so check them with the search tool for `;` at line ends and for `any`)
- Styling: vanilla CSS only, in the component's own `<style>` block or standard `.css` files (constitution III); no Tailwind, Sass, Less, or CSS-in-JS
- Hot path (`expandGrayscale` and `render`): indexed `for` loop over existing arrays and one `putImageData`; no destructuring, object or array literals, closures, spreads, `for...of`, array methods, template strings, `try`/`catch`, or new typed arrays or `ImageData` (FR-010, FR-011). Validation in `render` runs before any write and allocates nothing on success
- No polyfills, fallbacks, or inline feature checks (constitution VII); errors are thrown at the failing call
- Edit tools run in parallel with terminal commands when called in the same step, so run `git add` in a separate step after the file edits
- Tests mount the real component with Svelte's `mount`/`unmount` into a real container, read real canvas pixels with `getImageData`, and drive input through the real-mouse command from T012. They mirror the style of `tests/unit/headless-renderer/renderer.test.ts` (real objects, explicit cleanup in `afterEach`). Component tests may import the component with a relative path (`../../../src/lib/viewport/Viewport.svelte`); the Kit-only `$lib` alias is not available under `vitest.config.ts`

---

## Phase 1: Setup (SvelteKit Skeleton)

**Purpose**: Turn the repo into a barebones SvelteKit app beside `src/core` before any component work (FR-015). SPA mode, static adapter, one placeholder route, nothing else.

- [X] T001 Declare the SvelteKit dev dependencies. Run `fnm env --shell fish | source; and fnm use 24; and npm install --save-dev --legacy-peer-deps @sveltejs/kit@^3.1.0 @sveltejs/adapter-static@^4 @sveltejs/vite-plugin-svelte@^7.3.1 svelte@^5.57.0 svelte-check@^4.7.0` (these versions are already in `node_modules` and were verified against Vite 8 and TypeScript 6; keep `typescript` pinned as is). Then edit `package.json` `scripts` to add `"dev": "vite dev"`, `"build": "vite build"`, `"preview": "vite preview"`, `"prepare": "svelte-kit sync"`, and `"check": "svelte-check --tsconfig ./tsconfig.json"`, keeping the existing `test`, `test:watch`, `test:tick-bench`, `lint`, and `typecheck` scripts unchanged
- [X] T002 [P] Superseded: SvelteKit 3 no longer reads `svelte.config.js` (`svelte-kit sync` fails with `config_file_unsupported`), so the config lives in `vite.config.ts` (T003) and no `svelte.config.js` is created
- [X] T003 [P] Create `vite.config.ts` at the repo root with the whole SvelteKit config (Kit 3 takes it here): `import adapter from '@sveltejs/adapter-static'`, `import { sveltekit } from '@sveltejs/kit/vite'`, `import { defineConfig } from 'vite'`, `export default defineConfig({ plugins: [sveltekit({ adapter: adapter({ fallback: 'index.html' }) })] })` (SPA fallback; no prerender, no server adapter). Do not put test configuration here; `vitest.config.ts` stays separate and wins for Vitest (research section 1) (depends on T001)
- [X] T004 [P] Create `src/app.html` (standard SvelteKit shell: `<!doctype html>`, `<html lang="en">`, `<head>` with `<meta charset="utf-8" />`, `<meta name="viewport" content="width=device-width, initial-scale=1" />`, `%sveltekit.head%`, and `<body data-sveltekit-preload-data="hover"><div style="display: contents">%sveltekit.body%</div></body>`) and `src/app.d.ts` containing only the standard empty `declare global { namespace App {} }` plus `export {}` (no semicolons)
- [X] T005 [P] Create the routes: `src/routes/+layout.ts` exporting `export const ssr = false` (the engine uses `OffscreenCanvas` and the component touches the DOM; one-line comment saying so); `src/routes/+layout.svelte` rendering `{@render children()}` with `let { children } = $props()` and a scoped `<style>` that sets `:global(html, body) { margin: 0; height: 100%; background: #101010; }`; `src/routes/+page.svelte` with a single `<h1>Conrad</h1>` placeholder (replaced in T036). No other routes, hooks, stores, or server files (Constitution VII) (depends on T001)
- [X] T006 Wire the config: add `.svelte-kit/` as a new line in `.gitignore` (alongside the existing `build/`); change `tsconfig.json` to `"extends": "$app/tsconfig"` (Kit 3 generates `node_modules/$app/tsconfig.json`, not `.svelte-kit/tsconfig.json`) with `"types": ["$app/types", "node"]`, while keeping every existing compiler option (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules`, `noEmit`) and `include: ["src", "tests"]`; then run `fnm env --shell fish | source; and fnm use 24; and npx svelte-kit sync` and confirm it prints no warnings. Kit forces `verbatimModuleSyntax: true`; if `tsc` later cannot resolve `*.svelte` imports from `.ts` files, add `"svelte"` to `types`; if Kit's defaults conflict with a strict flag, fix the source, never loosen the flag (plan open flag 1) (depends on T001, T005)
- [X] T007 In `vitest.config.ts` import `{ svelte } from '@sveltejs/vite-plugin-svelte'` and add `plugins: [svelte({ configFile: false })]` at the top level of `defineConfig` (there is no `svelte.config.js` to load); keep `include`, `exclude`, `globalSetup`, and the whole `browser` block as they are. Leave `vitest.tick-bench.config.ts` untouched (depends on T001)
- [X] T008 Checkpoint verification, each as its own command: `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`, then `... npm run lint`, then `... npm run check`, then `... npm test`, then `... npm run build`. All must pass with the existing core suites unchanged and `build/` holding a static site (`index.html` plus `_app/`). Fix scaffold issues here; if the skeleton cannot be made to work without changing `src/core` or weakening strict mode, halt and flag it (Principle VI) (depends on T002-T007)
- [X] T009 Commit the skeleton per constitution V: `git add package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json .gitignore src/app.html src/app.d.ts src/routes` as its own command, then `git commit -m "chore: scaffold sveltekit skeleton"` as its own command (depends on T008)

**Checkpoint**: A SvelteKit app builds statically and every pre-existing test still passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and error class, and the real-mouse command needed by the pointer stories.

- [X] T010 In `src/lib/viewport/types.ts` define, matching the style of `src/core/headless-renderer/types.ts` and `data-model.md`: `import type { GrayscaleImage } from '../../core/image-loader'`; `export type ViewportGrid = { width: number; height: number }` (positive integers); `export type PointerPayload = { x: number; y: number; buttons: number }` with a one-line comment that `x`/`y` are continuous grid coordinates clamped to `[0, width]` and `[0, height]` and `buttons` is the live bitmask; `export type WindowPayload = { x: number; y: number; dx: number; dy: number }` with a one-line comment that `dx`/`dy` are grid-space deltas from the previous sample and the press is the initial sample; `export const buttonPrimary = 1`, `export const buttonSecondary = 2`, `export const buttonMiddle = 4`; `export type ViewportErrorReason = 'invalid-grid' | 'invalid-frame' | 'canvas-unavailable'`; `export class ViewportError extends Error` with `readonly reason: ViewportErrorReason`, constructor `(reason, message)`, `this.name = 'ViewportError'`, same shape as `RendererError`; and `export type { GrayscaleImage }`. No identifier `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement` anywhere in this file (FR-013)
- [X] T011 In `src/lib/viewport/index.ts` export `ViewportError`, `buttonPrimary`, `buttonSecondary`, `buttonMiddle` and the types `ViewportGrid`, `PointerPayload`, `WindowPayload`, `ViewportErrorReason`, `GrayscaleImage` from `./types` (the `Viewport` component export is added by T019) (depends on T010)
- [X] T012 [P] Create `tests/setup/mouse-command.ts` defining real-mouse Vitest browser commands with `defineBrowserCommand` from `@vitest/browser-playwright`: `mouseMove(x, y)`, `mouseDown(button)`, and `mouseUp(button)` calling Playwright's `page.mouse.move`, `down`, and `up` (`button` is `'left' | 'middle' | 'right'`), registered in `vitest.config.ts` under `test.browser.commands`. In this Vitest 5 setup the command context has `page` and `frame()`; the command translates iframe-relative coordinates using the iframe bounding box. `tests/unit/viewport/mouse-command.test.ts` mounts a real div listening to down/move/up and verifies middle down/up coordinates and button masks. The exact API works; no fallback was needed.

**Checkpoint**: Shared types compile; real mouse input, including the middle button, reaches page elements at known coordinates.

---

## Phase 3: User Story 1 - Render a Frame Crisply at Any Display Size (Priority: P1) MVP

**Goal**: `Viewport` mounts a canvas with the engine's native backing store and draws a `GrayscaleImage` byte-exactly via one reusable `ImageData`, with crisp rendering settings.

**Independent Test**: `npx vitest run tests/unit/viewport/expand.test.ts tests/unit/viewport/viewport.test.ts` passes, and `npx vitest bench` style run of `expand.bench.ts` meets its budget.

### Tests for User Story 1

- [X] T013 [P] [US1] Create `tests/unit/viewport/expand.test.ts` testing `expandGrayscale(source, target32)` with real typed arrays (no mocks): tests opaque packed pixels and little-endian RGBA bytes, both supported source array types, empty buffers, input immutability, target-length truncation, and opaque black for missing source bytes. Spec US1/2
- [X] T014 [P] [US1] Create `tests/unit/viewport/expand.bench.ts` with a varying 512x512 `Uint8Array` and reusable `Uint32Array`; assert mean expansion under 1 ms and bounded heap growth against an allocating control using `performance.memory` and the existing `--enable-precise-memory-info` launch flag. Both benchmark checks pass. Constitution IV, SC-003
- [X] T015 [P] [US1] Create `tests/unit/viewport/helpers.ts` with `mountViewport(options)`, which mounts the real component in a fixed-position container and returns the canvas, component exports, resize helper and cleanup; include `nextFrame()` and `canvasOrigin(canvas)`. The helper calls Svelte `flushSync()` after mount so `onMount` has initialized the canvas before tests call `render`. No mocks.
- [X] T016 [US1] Create `tests/unit/viewport/viewport.test.ts` verifying native backing dimensions, byte-exact RGBA canvas pixels, second-frame overwrite, `image-rendering: pixelated`, `touch-action: none`, disabled smoothing, `invalid-frame` errors without canvas mutation, and synchronous `invalid-grid` errors for invalid widths and heights. `canvas-unavailable` remains untested because it cannot be triggered without mocking. Spec US1/1-6

### Implementation for User Story 1

- [X] T017 [US1] In `src/lib/viewport/expand.ts` export `expandGrayscale(source: Uint8Array | Uint8ClampedArray, target32: Uint32Array): void` with an indexed `for` over `target32.length` doing `target32[index] = opaqueBlack | ((source[index] ?? 0) * 0x010101)` where `const opaqueBlack = 0xff000000`, matching `updateBuffer` in `src/core/headless-renderer/renderer.ts`. No DOM or Svelte imports; no allocation. The test verifies missing bytes map to opaque black. FR-010, FR-011
- [X] T018 [US1] Create `src/lib/viewport/Viewport.svelte` using Svelte 5 runes, typed props and a fixed-grid canvas. It validates grid dimensions synchronously, initializes the 2D context and reusable image buffers in `onMount`, sets `imageSmoothingEnabled = false`, exposes `render(frame)` with validate-before-write behavior, and uses only scoped vanilla CSS with `image-rendering: pixelated` and `touch-action: none`. Initial grid validation is wrapped in `untrack` to avoid Svelte's initial-prop capture warning. The mount helper uses `flushSync()` before invoking `render` (depends on T010, T017)
- [X] T019 [US1] In `src/lib/viewport/index.ts` export `default as Viewport` from `./Viewport.svelte` (depends on T011, T018)
- [X] T020 [US1] Run focused expansion and viewport tests, the 512x512 expansion benchmark, `npm run typecheck`, `npm run check`, and `npm run lint`. Results: 18 viewport checks pass (16 behavior tests plus 2 benchmark checks); typecheck and lint pass; svelte-check reports zero errors and warnings. (depends on T013, T014, T016, T019)

**Checkpoint**: A frame renders byte-exactly on a fixed-resolution, crisp canvas with a zero-allocation expansion path.

---

## Phase 4: User Story 2 - Stay Fitted When the Layout Changes (Priority: P1)

**Goal**: The container's observed size drives a uniform fit of the canvas; the backing store is never touched.

**Independent Test**: `npx vitest run tests/unit/viewport/projection.test.ts tests/unit/viewport/layout.test.ts` passes.

### Tests for User Story 2

- [X] T021 [P] [US2] Create `tests/unit/viewport/projection.test.ts` covering uniform fit, constrained dimension, exact/fractional scaling, below-native fit, and zero extents. Spec US2/1, US2/3
- [X] T022 [P] [US2] Create `tests/unit/viewport/layout.test.ts` verifying initial fit and centering, updates at multiple observed sizes, unchanged native backing dimensions and rendered pixels, zero-size layout, and no errors after observer teardown. Spec US2/1-4 (depends on T015)

### Implementation for User Story 2

- [X] T023 [US2] In `src/lib/viewport/projection.ts` export pure `fitScale(containerWidth, containerHeight, gridWidth, gridHeight)` returning the smaller container-to-grid ratio. No DOM or Svelte imports; not exported from `index.ts`. FR-002
- [X] T024 [US2] In `src/lib/viewport/Viewport.svelte` observe only the container with `ResizeObserver`, read the latest `contentBoxSize`, and derive CSS canvas dimensions from `fitScale`. The observer disconnects on teardown; zero extents produce zero CSS dimensions; canvas backing attributes are assigned only during initial mount. FR-002, FR-003
- [X] T025 [US2] Run the projection, layout, and US1 render regression suites plus `npm run check`; also validate with `npm run typecheck` and `npm run lint`. Projection 4 tests, layout 2 tests, and render regression 12 tests pass; typecheck/lint pass and svelte-check reports zero errors/warnings. (depends on T021, T022, T024)

**Checkpoint**: Resizing the container re-fits the canvas uniformly without touching the backing store.

---

## Phase 5: User Story 3 - Primary Pointer Routes to the Kinematic Compositor (Priority: P1)

**Goal**: The primary pointer's position, projected to engine grid coordinates with the live scale, reaches `onpointer` as plain numbers.

**Independent Test**: `npx vitest run tests/unit/viewport/projection.test.ts tests/unit/viewport/pointer.test.ts` passes.

### Tests for User Story 3

- [X] T026 [US3] In `tests/unit/viewport/projection.test.ts` add `toGrid` tests for linear and fractional mapping, low/high clamping, determinism, and grid endpoints. Spec SC-002 (depends on T021)
- [X] T027 [P] [US3] Create `tests/unit/viewport/pointer.test.ts` using the real-mouse commands and real mounted component. Tests verify projection at scale 2 and after resizing to scale 4, near-corner coordinates, primary button down/up masks, pointer capture with out-of-canvas clamping, plain numeric payload shape and fresh objects, and no payload when the canvas is zero-sized. The non-primary guard is verified in the component; real multi-touch is out of scope. Spec US3/1-4 (depends on T012, T015)

### Implementation for User Story 3

- [X] T028 [US3] In `src/lib/viewport/projection.ts` add pure `toGrid(offset, cssExtent, gridExtent)` mapping with clamping to `[0, gridExtent]`. FR-004
- [X] T029 [US3] In `src/lib/viewport/Viewport.svelte` add primary-pointer down/move/up handlers. They ignore non-primary pointers, capture on down, project offsets using current derived CSS dimensions, dispatch fresh `{ x, y, buttons }` numerical payloads, and keep a `windowing` branch point for T032. `touch-action: none` remains scoped CSS. FR-004, FR-005, FR-008
- [X] T030 [US3] Run projection, pointer, and layout suites plus `npm run check`, `npm run typecheck`, and `npm run lint`. Results: projection 7 tests, pointer 3, layout 2 pass; Svelte diagnostics, typecheck, lint pass. (depends on T026, T027, T029)

**Checkpoint**: Pointer positions reach the consumer in engine grid units at any display scale.

---

## Phase 6: User Story 4 - Middle-Mouse Drag Routes to Windowing (Priority: P1)

**Goal**: A middle-button drag yields grid-space deltas for windowing and never reaches the kinematic route.

**Independent Test**: `npx vitest run tests/unit/viewport/windowing.test.ts` passes.

### Tests for User Story 4

- [X] T031 [P] [US4] Create `tests/unit/viewport/windowing.test.ts` using the real mouse and mounted component. The suite verifies exact middle-drag deltas, exclusive callback routing, default suppression, current-scale deltas after resizing mid-drag, clamping after dragging outside, payload shape, and continued primary-button routing. All 3 tests pass; `pointercancel` is handled in T032 but cannot be generated by the real mouse. Spec US4/1-5

### Implementation for User Story 4

- [X] T032 [US4] In `src/lib/viewport/Viewport.svelte` add exclusive middle-button windowing with `windowing`, `lastX`, and `lastY`. Middle down prevents default, captures the pointer and records the initial projected position; moves dispatch `{ x, y, dx, dy }` and update the sample; middle up ends routing; `pointercancel` ends routing and releases capture. Primary routing is suppressed while windowing. FR-006, FR-007
- [X] T033 [US4] Run the windowing and pointer regression suites plus `npm run check`, `npm run typecheck`, and `npm run lint`. Windowing 3 tests and pointer 3 tests pass; Svelte diagnostics, typecheck, and lint pass. (depends on T031, T032)

**Checkpoint**: Middle-drag windowing and primary pointer routing both work and never overlap.

---

## Phase 7: User Story 5 - The Engine Never Sees the DOM (Priority: P1)

**Goal**: The dependency arrow points only from UI to engine, and the public types expose no DOM types; enforced by a test.

**Independent Test**: `npx vitest run tests/unit/viewport/boundary.test.ts` passes.

- [X] T034 [US5] Create `tests/unit/viewport/boundary.test.ts` using Vite raw `import.meta.glob` source imports to verify core dependency direction, DOM-free public types/pure helpers, and scoped vanilla CSS in the Svelte component. Spec US5/1-3, FR-013
- [X] T035 [US5] Run `npx vitest run tests/unit/viewport/boundary.test.ts`; all 3 boundary tests pass and no source violations needed correction.

**Checkpoint**: All five stories verified.

---

## Phase 8: Polish & Cross-Cutting

- [X] T036 Replace `src/routes/+page.svelte` with a SvelteKit manual-check harness: 64x64 generated grayscale gradient, `$lib/viewport` component import, render on mount, explicit responsive stage, and live pointer/window readouts. No engine or animation loop; vanilla scoped CSS only.
- [X] T037 Run `npm test` (38 files, 317 tests pass), `npm run test:tick-bench` (6 tests pass), `npm run typecheck`, `npm run lint`, `npm run check` (0 errors/warnings), and `npm run build` (static output succeeds). Search found no TS semicolon terminators, `any`, or `@ts-ignore`; CSS semicolons are normal declarations. Kit emits a deprecation warning for the explicit `$lib` compatibility alias. (depends on T036)
- [X] T038 Audit Quickstart scenarios 1-9: component behavior, projection, resize, windowing, boundary, errors and benchmark are covered by passing tests; dev and static preview harness were smoke-tested in Chromium with correct grayscale pixel, 64x64 backing store, pointer/window readouts and no page errors. The OS-specific middle-click autoscroll / primary-selection behavior remains a manual check; non-primary multi-touch is out of scope. No additional tests were required. (depends on T037)
- [X] T039 Commit per constitution V with Conventional Commits under 50 characters, staging with `git add` as its own command and committing as its own command. The milestones are committed as `5135771` (canvas rendering), `77ff659` (container fit), `2269595` (primary pointer), `6e34874` (windowing), `a140cf4` (boundary test), `ec5d2ae` (manual harness), and `e52c2bc` (task completion). Never stage `.specify/feature.json`.

---

## Dependencies & Execution Order

- **Setup (T001 -> T002, T003, T004, T005, T007 in parallel -> T006 -> T008 -> T009)** blocks everything. T006 needs T001 and T005; T007 needs T001.
- **Foundational**: T010 -> T011; T012 needs T007 and can run alongside T010/T011. They block all stories.
- **US1**: T013 || T014 || T015; T016 needs T015; T017 needs T010; T018 needs T010, T017; T019 needs T011, T018; T020 after T013, T014, T016, T019.
- **US2**: needs US1; T021 || T022; T023 needs T010; T024 needs T018, T023; T025 after T021, T022, T024.
- **US3**: needs US2; T026 needs T021; T027 needs T012, T015; T028 needs T023; T029 needs T024, T028; T030 after T026, T027, T029.
- **US4**: needs US3; T031 needs T012, T015; T032 needs T029; T033 after T031, T032.
- **US5**: needs T018; T034 then T035 (T035 also after T032 so the boundary test sees the final component).
- **Polish** after all stories: T036 -> T037 -> T038 -> T039.

### Parallel Opportunities

- T002 || T003 || T004 || T005
- T012 || T010/T011
- T013 || T014 || T015
- T021 || T022
- T027 can be written while T028 is implemented (different files); T031 || T027 (different files, both need only T012 and T015)
- US5 test authoring (T034) can proceed in parallel with US3/US4 work once T018 exists; only the final run (T035) waits for the component to be complete
- `Viewport.svelte` is edited by T018, T024, T029, and T032 in that order and must not be edited in parallel

### Parallel Example

```text
Task: "Create vite.config.ts with the SvelteKit config" (T003)
Task: "Create vite.config.ts" (T003)
Task: "Create src/app.html and src/app.d.ts" (T004)
Task: "Create the src/routes skeleton" (T005)
```

## Implementation Strategy

### MVP First

1. Setup and Foundational: T001-T012 (a building SvelteKit skeleton, shared types, real-mouse commands)
2. US1 (T013-T020): a crisp, byte-exact, zero-allocation render path on a fixed-resolution canvas; stop and validate, then commit

### Incremental Delivery

1. Add US2 (T021-T025): uniform fit driven by `ResizeObserver`
2. Add US3 (T026-T030): projected primary pointer payloads
3. Add US4 (T031-T033): middle-drag windowing, exclusive of the primary route
4. Add US5 (T034-T035): architectural boundary enforced by a test
5. Polish (T036-T039): manual-check page, full verification, quickstart walkthrough, commits
