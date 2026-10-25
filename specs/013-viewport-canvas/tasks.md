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

- [ ] T026 [US3] In `tests/unit/viewport/projection.test.ts` append `toGrid(offset, cssExtent, gridExtent)` tests: `toGrid(100, 200, 100)` is `50`; `toGrid(0, 200, 100)` is `0`; `toGrid(200, 200, 100)` is `100`; `toGrid(-5, 200, 100)` is `0` (clamped low); `toGrid(250, 200, 100)` is `100` (clamped high); `toGrid(100, 400, 100)` is `25`; fractional results are preserved (`toGrid(50, 400, 100)` is `12.5`); the function is pure (same inputs give the same output). Spec SC-002 (depends on T021)
- [ ] T027 [P] [US3] Create `tests/unit/viewport/pointer.test.ts` using `mountViewport`, `canvasOrigin`, `nextFrame`, and the real-mouse commands (collect payloads in a plain array through `onpointer`): grid `100 x 50` in a `200 x 100` container (scale `2`): move the real mouse to canvas-local CSS `(100, 50)` (client = origin + offset) and expect a payload `{ x: 50, y: 25, buttons: 0 }`; `setContainerSize(400, 200)`, `await nextFrame()`, and moving to canvas-local `(100, 50)` gives `{ x: 25, y: 12.5, buttons: 0 }`; the canvas corners project to `(0, 0)` and `(100, 50)` and the center to `(50, 25)` at several container sizes (SC-002); `mouseDown('left')` produces a payload with `buttons` of `1` and `mouseUp('left')` one with `buttons` of `0`; a left drag that moves far outside the canvas (and the container) keeps delivering payloads with `x` in `[0, 100]` and `y` in `[0, 50]` (pointer capture and clamping); each payload is a plain object whose keys are exactly `x`, `y`, `buttons` and whose values are numbers (`typeof` check, no event or element reference); with a zero-size container no payload arrives; payloads are fresh objects (two consecutive payloads are not the same reference). Non-primary pointers are produced only by multi-touch, which is out of scope for the real-mouse command, so US3/5 is covered by inspection of the `isPrimary` guard added in T029. Spec US3/1-4 (depends on T012, T015)

### Implementation for User Story 3

- [ ] T028 [US3] In `src/lib/viewport/projection.ts` add `toGrid(offset: number, cssExtent: number, gridExtent: number): number` returning `Math.min(Math.max((offset * gridExtent) / cssExtent, 0), gridExtent)`. FR-004 (depends on T023)
- [ ] T029 [US3] In `src/lib/viewport/Viewport.svelte` add `onpointerdown`, `onpointermove`, `onpointerup` handlers on the canvas (private `PointerEvent` typing only inside the component). Each handler returns immediately if `!event.isPrimary`. Compute `x = toGrid(event.offsetX, cssWidth, width)` and `y = toGrid(event.offsetY, cssHeight, height)` from the live derived CSS size. On `pointerdown` call `canvas.setPointerCapture(event.pointerId)`; capture is not checked or wrapped (constitution VII). Dispatch `onpointer?.({ x, y, buttons: event.buttons })` for down, move, and up (a fresh object each time). Keep the handlers structured so T032 can add the windowing branch (a boolean `windowing` flag checked first) without changing the primary path. Confirm `touch-action: none` is in the scoped CSS (added in T018). FR-004, FR-005, FR-008 (depends on T024, T028)
- [ ] T030 [US3] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/viewport/projection.test.ts`, then `... npx vitest run tests/unit/viewport/pointer.test.ts`, then `... npx vitest run tests/unit/viewport/layout.test.ts`, then `... npm run check`; fix failures (depends on T026, T027, T029)

**Checkpoint**: Pointer positions reach the consumer in engine grid units at any display scale.

---

## Phase 6: User Story 4 - Middle-Mouse Drag Routes to Windowing (Priority: P1)

**Goal**: A middle-button drag yields grid-space deltas for windowing and never reaches the kinematic route.

**Independent Test**: `npx vitest run tests/unit/viewport/windowing.test.ts` passes.

### Tests for User Story 4

- [ ] T031 [P] [US4] Create `tests/unit/viewport/windowing.test.ts` using `mountViewport`, `canvasOrigin`, `nextFrame`, and the real-mouse commands, with grid `100 x 50` at scale `2`, collecting `onpointer` and `onwindow` payloads in separate arrays: `mouseMove` to canvas-local `(20, 20)`, `mouseDown('middle')`, move to `(40, 30)`, then `(40, 50)`, `mouseUp('middle')` gives `onwindow` payloads `{ x: 20, y: 15, dx: 10, dy: 5 }` then `{ x: 20, y: 25, dx: 0, dy: 10 }` (the press at grid `(10, 10)` is the initial sample); no `onpointer` payload is recorded between the middle press and release (only the pre-press hover move and later moves may appear); after release, a hover move reaches `onpointer` again and `onwindow` stays silent; a middle `pointerdown` on the real canvas has `defaultPrevented === true` (add a `pointerdown` listener on the container before pressing; it runs after the canvas handler during bubbling, and records `event.defaultPrevented`); resizing the container mid-drag (`setContainerSize(400, 200)`, `await nextFrame()`) makes the next delta use the new scale (the same CSS movement now gives half the grid delta); a drag that leaves the canvas continues and stays clamped to `[0, 100] x [0, 50]`; payloads are plain number objects with keys exactly `x`, `y`, `dx`, `dy`; a left drag produces `onpointer` payloads only and no `onwindow` payload. `pointercancel` cannot be produced by the real mouse, so the cancel branch is covered by inspection in T032. Spec US4/1-5 (depends on T012, T015)

### Implementation for User Story 4

- [ ] T032 [US4] In `src/lib/viewport/Viewport.svelte` add the windowing branch to the handlers from T029 plus an `onpointercancel` handler and two plain locals `lastX`, `lastY` and a `windowing` boolean. On `pointerdown` with `event.button === 1`: call `event.preventDefault()`, `canvas.setPointerCapture(event.pointerId)`, set `windowing = true`, set `lastX`/`lastY` to the projected press position, and dispatch nothing. On `pointermove` while `windowing`: project, call `onwindow?.({ x, y, dx: x - lastX, dy: y - lastY })`, update `lastX`/`lastY`, and do not call `onpointer`. On `pointerup` while `windowing` and `event.button === 1`: set `windowing = false` and do not call `onpointer` (capture releases automatically on `pointerup`). `pointercancel` sets `windowing = false` and releases capture with `canvas.releasePointerCapture(event.pointerId)`. A non-middle `pointerdown` during a middle drag is ignored. All other behavior from T029 is unchanged. FR-006, FR-007 (depends on T029)
- [ ] T033 [US4] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/viewport/windowing.test.ts`, then `... npx vitest run tests/unit/viewport/pointer.test.ts` to confirm US3 still passes, then `... npm run check`; fix failures (depends on T031, T032)

**Checkpoint**: Middle-drag windowing and primary pointer routing both work and never overlap.

---

## Phase 7: User Story 5 - The Engine Never Sees the DOM (Priority: P1)

**Goal**: The dependency arrow points only from UI to engine, and the public types expose no DOM types; enforced by a test.

**Independent Test**: `npx vitest run tests/unit/viewport/boundary.test.ts` passes.

- [ ] T034 [US5] Create `tests/unit/viewport/boundary.test.ts` reading source text with Vite's `import.meta.glob` using `{ query: '?raw', import: 'default', eager: true }` (add `/// <reference types="vite/client" />` at the top of the file or `vite/client` to `types` in `tsconfig.json` if `import.meta.glob` is not typed): `import.meta.glob('/src/core/**/*.ts', ...)` must match at least one file, and no matched file's text contains an import specifier of `svelte`, `$lib`, `@sveltejs`, or a path containing `/lib/viewport` or `src/lib` (check with regular expressions over `from '...'` and `import('...')` forms); `src/lib/viewport/types.ts` and `src/lib/viewport/index.ts` texts contain none of the identifiers `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement` (word-boundary match, comments excluded or confirmed absent); `src/lib/viewport/Viewport.svelte` raw text has exactly one `<style>` block containing `image-rendering: pixelated`, has no `<style lang=` attribute (no Sass or Less), and no `@import` or `@apply` rule; `src/lib/viewport/projection.ts` and `expand.ts` contain no `document`, `window`, or `svelte` import. Spec US5/1-3, FR-013 (depends on T010, T018)
- [ ] T035 [US5] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/viewport/boundary.test.ts`; fix violations in the source (never by editing the test to weaken it) (depends on T034, T032)

**Checkpoint**: All five stories verified.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T036 Replace the placeholder `src/routes/+page.svelte` with a minimal manual-check harness that mounts `Viewport` (import via `$lib/viewport`) with a `64 x 64` grid inside a parent `<div class="stage">` styled in the scoped `<style>` with an explicit size (`width: 80vw; height: 80vh;` so the container has a definite size and the `ResizeObserver` has no layout feedback loop), renders one generated gradient `GrayscaleImage` (`data[y * 64 + x] = (x * 4) & 255`, built once in the script block) after mount with `bind:this`, and shows the latest `onpointer` and `onwindow` payloads as text. No engine, no `requestAnimationFrame` loop, no stores, no new routes (the page is a manual verification aid, not a demo). Vanilla CSS only (depends on T019)
- [ ] T037 Run full verification as separate commands: `fnm env --shell fish | source; and fnm use 24; and npm test`, `... npm run test:tick-bench`, `... npm run typecheck`, `... npm run lint`, `... npm run check`, `... npm run build`; all must pass with no semicolons, `any`, or `@ts-ignore` in changed files (search `src/lib`, `src/routes`, `tests/unit/viewport`, `tests/setup/mouse-command.ts` with the search tool for `;` at line ends and for `any`) (depends on T036)
- [ ] T038 Walk through `quickstart.md` scenarios 1 to 9 against the passing tests and note any scenario without a covering test; add the missing test rather than skipping it. Scenarios that cannot run headless (middle-click autoscroll and primary-selection paste suppression, scenario 5 manual check, and the dev-server checks in 1b and 9) are recorded as manual checks to run with `npm run dev` and the harness page, and are called out to the user in the completion message (depends on T037)
- [ ] T039 Commit per constitution V with Conventional Commits under 50 characters, staging with `git add` as its own command and committing as its own command, in logical milestones: `feat: add viewport canvas component` (after T020 and T025: `src/lib/viewport`, `tests/unit/viewport`, `tests/setup`, `vitest.config.ts`), `feat: route viewport pointer input` (after T030 and T033), `test: enforce viewport boundary` (after T035), `chore: add viewport check page` (T036), and `docs: mark viewport tasks complete` (this file). Never stage `.specify/feature.json` (depends on T038)

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
