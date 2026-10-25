---

description: "Task list for viewport-canvas"
---

# Tasks: Viewport Canvas

**Input**: Design documents from `/specs/013-viewport-canvas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/viewport-api.md, quickstart.md. Adds a barebones SvelteKit skeleton (`svelte.config.js`, `vite.config.ts`, `src/app.html`, `src/app.d.ts`, `src/routes/`), the module `src/lib/viewport/` (`types.ts`, `projection.ts`, `expand.ts`, `Viewport.svelte`, `index.ts`), a real-mouse Vitest browser command in `tests/setup/`, and tests in `tests/unit/viewport/`. Modifies `package.json`, `tsconfig.json`, `.gitignore`, and `vitest.config.ts`. Nothing under `src/core/` changes; `vitest.tick-bench.config.ts` and `eslint.config.js` are unchanged.

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

- [ ] T001 Declare the SvelteKit dev dependencies. Run `fnm env --shell fish | source; and fnm use 24; and npm install --save-dev --legacy-peer-deps @sveltejs/kit@^3.1.0 @sveltejs/adapter-static@^4 @sveltejs/vite-plugin-svelte@^7.3.1 svelte@^5.57.0 svelte-check@^4.7.0` (these versions are already in `node_modules` and were verified against Vite 8 and TypeScript 6; keep `typescript` pinned as is). Then edit `package.json` `scripts` to add `"dev": "vite dev"`, `"build": "vite build"`, `"preview": "vite preview"`, `"prepare": "svelte-kit sync"`, and `"check": "svelte-check --tsconfig ./tsconfig.json"`, keeping the existing `test`, `test:watch`, `test:tick-bench`, `lint`, and `typecheck` scripts unchanged
- [ ] T002 [P] Create `svelte.config.js` at the repo root: `import adapter from '@sveltejs/adapter-static'`, `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'`, and `export default { preprocess: vitePreprocess(), kit: { adapter: adapter({ fallback: 'index.html' }) } }` (SPA fallback; no prerender, no server adapter; semicolon-free, single quotes, matching `.prettierrc.json`) (depends on T001)
- [ ] T003 [P] Create `vite.config.ts` at the repo root: `import { sveltekit } from '@sveltejs/kit/vite'`, `import { defineConfig } from 'vite'`, `export default defineConfig({ plugins: [sveltekit()] })`. Do not put test configuration here; `vitest.config.ts` stays separate and wins for Vitest (research section 1) (depends on T001)
- [ ] T004 [P] Create `src/app.html` (standard SvelteKit shell: `<!doctype html>`, `<html lang="en">`, `<head>` with `<meta charset="utf-8" />`, `<meta name="viewport" content="width=device-width, initial-scale=1" />`, `%sveltekit.head%`, and `<body data-sveltekit-preload-data="hover"><div style="display: contents">%sveltekit.body%</div></body>`) and `src/app.d.ts` containing only the standard empty `declare global { namespace App {} }` plus `export {}` (no semicolons)
- [ ] T005 [P] Create the routes: `src/routes/+layout.ts` exporting `export const ssr = false` (the engine uses `OffscreenCanvas` and the component touches the DOM; one-line comment saying so); `src/routes/+layout.svelte` rendering `{@render children()}` with `let { children } = $props()` and a scoped `<style>` that sets `:global(html, body) { margin: 0; height: 100%; background: #101010; }`; `src/routes/+page.svelte` with a single `<h1>Conrad</h1>` placeholder (replaced in T036). No other routes, hooks, stores, or server files (Constitution VII) (depends on T001)
- [ ] T006 Wire the config: add `.svelte-kit/` as a new line in `.gitignore` (alongside the existing `build/`); change `tsconfig.json` to `"extends": "./.svelte-kit/tsconfig.json"` while keeping every existing compiler option (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, `isolatedModules`, `noEmit`, `types: ["node"]`) and `include: ["src", "tests"]`; then run `fnm env --shell fish | source; and fnm use 24; and npx svelte-kit sync` to generate `.svelte-kit/tsconfig.json`. If `tsc` later cannot resolve `*.svelte` imports from `.ts` files, add `"svelte"` to `types`; if Kit's defaults conflict with a strict flag, fix the source, never loosen the flag (plan open flag 1) (depends on T001, T005)
- [ ] T007 In `vitest.config.ts` import `{ svelte } from '@sveltejs/vite-plugin-svelte'` and add `plugins: [svelte()]` at the top level of `defineConfig`; keep `include`, `exclude`, `globalSetup`, and the whole `browser` block as they are. Leave `vitest.tick-bench.config.ts` untouched (depends on T001)
- [ ] T008 Checkpoint verification, each as its own command: `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`, then `... npm run lint`, then `... npm run check`, then `... npm test`, then `... npm run build`. All must pass with the existing core suites unchanged and `build/` holding a static site (`index.html` plus `_app/`). Fix scaffold issues here; if the skeleton cannot be made to work without changing `src/core` or weakening strict mode, halt and flag it (Principle VI) (depends on T002-T007)
- [ ] T009 Commit the skeleton per constitution V: `git add package.json package-lock.json svelte.config.js vite.config.ts vitest.config.ts tsconfig.json .gitignore src/app.html src/app.d.ts src/routes` as its own command, then `git commit -m "chore: scaffold sveltekit skeleton"` as its own command (depends on T008)

**Checkpoint**: A SvelteKit app builds statically and every pre-existing test still passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and error class, and the real-mouse command needed by the pointer stories.

- [ ] T010 In `src/lib/viewport/types.ts` define, matching the style of `src/core/headless-renderer/types.ts` and `data-model.md`: `import type { GrayscaleImage } from '../../core/image-loader'`; `export type ViewportGrid = { width: number; height: number }` (positive integers); `export type PointerPayload = { x: number; y: number; buttons: number }` with a one-line comment that `x`/`y` are continuous grid coordinates clamped to `[0, width]` and `[0, height]` and `buttons` is the live bitmask; `export type WindowPayload = { x: number; y: number; dx: number; dy: number }` with a one-line comment that `dx`/`dy` are grid-space deltas from the previous sample and the press is the initial sample; `export const buttonPrimary = 1`, `export const buttonSecondary = 2`, `export const buttonMiddle = 4`; `export type ViewportErrorReason = 'invalid-grid' | 'invalid-frame' | 'canvas-unavailable'`; `export class ViewportError extends Error` with `readonly reason: ViewportErrorReason`, constructor `(reason, message)`, `this.name = 'ViewportError'`, same shape as `RendererError`; and `export type { GrayscaleImage }`. No identifier `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement` anywhere in this file (FR-013)
- [ ] T011 In `src/lib/viewport/index.ts` export `ViewportError`, `buttonPrimary`, `buttonSecondary`, `buttonMiddle` and the types `ViewportGrid`, `PointerPayload`, `WindowPayload`, `ViewportErrorReason`, `GrayscaleImage` from `./types` (the `Viewport` component export is added by T019) (depends on T010)
- [ ] T012 [P] Create `tests/setup/mouse-command.ts` defining real-mouse Vitest browser commands with `defineBrowserCommand` from `@vitest/browser-playwright`: `mouseMove(x, y)`, `mouseDown(button)`, and `mouseUp(button)` calling Playwright's `page.mouse.move`, `down`, and `up` (`button` is `'left' | 'middle' | 'right'`), registered in `vitest.config.ts` under `test.browser.commands`. First read `node_modules/@vitest/browser/context.d.ts` and `node_modules/vitest/dist` typings for the exact `commands` registration shape and the command context (`page`, `frame`, `iframe`). Tests run inside an iframe, so the command must translate iframe-relative `clientX/clientY` into top-level page coordinates by adding the iframe element's bounding-box origin (scale 1 in headless runs). Add `tests/unit/viewport/mouse-command.test.ts` as a smoke test: append a real `div` with `position: fixed; left: 0; top: 0; width: 200px; height: 200px` listening for `pointerdown`, `pointermove`, and `pointerup`; call `commands.mouseMove(50, 40)` and `commands.mouseDown('middle')` and `commands.mouseUp('middle')` (import `commands` from `vitest/browser`) and assert the recorded events have `clientX` 50, `clientY` 40, `button` 1, and `buttons` 4 on down and 0 on up. If the Vitest 5 command API cannot express this, fall back to `userEvent` for the primary pointer and keep only the middle-button commands (plan open flag 7); if a middle press cannot be produced at all, halt and flag it (Principle VI)

**Checkpoint**: Shared types compile; real mouse input, including the middle button, reaches page elements at known coordinates.

---

## Phase 3: User Story 1 - Render a Frame Crisply at Any Display Size (Priority: P1) MVP

**Goal**: `Viewport` mounts a canvas with the engine's native backing store and draws a `GrayscaleImage` byte-exactly via one reusable `ImageData`, with crisp rendering settings.

**Independent Test**: `npx vitest run tests/unit/viewport/expand.test.ts tests/unit/viewport/viewport.test.ts` passes, and `npx vitest bench` style run of `expand.bench.ts` meets its budget.

### Tests for User Story 1

- [ ] T013 [P] [US1] Create `tests/unit/viewport/expand.test.ts` testing `expandGrayscale(source, target32)` with real typed arrays (no mocks): for `source = Uint8Array.from([0, 1, 127, 128, 254, 255])` and a 6-element `Uint32Array`, every element equals `0xff000000 | v * 0x010101` as an unsigned value (`0xff000000` is stored as `4278190080`, so compare against `(0xff000000 | v * 0x010101) >>> 0`); viewing the same buffer as `Uint8Array` shows little-endian bytes `[v, v, v, 255]` per pixel; a `Uint8ClampedArray` source gives the same result; an empty source leaves the target unchanged; the source is not mutated; the loop is driven by `target32.length` per data-model.md, so a longer source is truncated to the target length and a shorter source (a mismatch the component prevents) leaves the remaining target elements at `0xff000000`. Spec US1/2
- [ ] T014 [P] [US1] Create `tests/unit/viewport/expand.bench.ts` mirroring `tests/unit/headless-renderer/update-buffer.bench.ts`: a 512x512 `Uint8Array` filled with varying bytes and a `Uint32Array` of the same pixel count; assert the mean time per `expandGrayscale` call is under 1 ms over many iterations and that JS heap growth stays under the threshold used by that benchmark versus an allocating control (a loop that allocates a new `Uint32Array` per call), using the same `performance.memory` technique and the existing `--enable-precise-memory-info` launch flag. Constitution IV, SC-003
- [ ] T015 [P] [US1] Create `tests/unit/viewport/helpers.ts` exporting `mountViewport(options)` where options are `{ width, height, containerWidth, containerHeight, onpointer?, onwindow? }`: it appends a real `div` to `document.body` with `position: fixed; left: 0; top: 0` and the given pixel size (so container-local equals client coordinates), mounts the real `Viewport` into it with Svelte's `mount`, and returns `{ container, canvas, viewport, setContainerSize(w, h), unmount() }` where `canvas` is `container.querySelector('canvas')`, `viewport` is the object returned by `mount` (it carries `render`), `setContainerSize` sets the container's CSS size, and `unmount()` calls Svelte's `unmount` and removes the container; also export `nextFrame()` returning a promise that resolves after two `requestAnimationFrame` callbacks (lets `ResizeObserver` settle) and `canvasOrigin(canvas)` returning `{ left, top }` from `getBoundingClientRect()` for converting canvas-local CSS offsets to client coordinates. Import the component by relative path. No mocks (depends on T010)
- [ ] T016 [US1] Create `tests/unit/viewport/viewport.test.ts` using `mountViewport` and `afterEach(unmount)`: grid 4x4 in a 200x200 container has `canvas.width === 4` and `canvas.height === 4`; `viewport.render(frame)` with bytes `Uint8Array.from({ length: 16 }, (_, i) => i * 17)` then `canvas.getContext('2d')?.getImageData(0, 0, 4, 4)` gives for pixel `(x, y)` `R = G = B = frame[y * 4 + x]` and alpha 255 (read back with a fresh 2D context obtained from the same canvas; `getContext('2d')` returns the existing one, which is fine); a second `render` with different bytes overwrites the first completely; `getComputedStyle(canvas).imageRendering` is `pixelated`; `getComputedStyle(canvas).touchAction` is `none`; `imageSmoothingEnabled` on `canvas.getContext('2d')` is `false`; a frame with the wrong `width`, wrong `height`, or `data.length` not equal to `width * height` makes `render` throw `ViewportError` with reason `invalid-frame` and the canvas pixels are unchanged (compare `getImageData` before and after); `mountViewport` with `width` of `0`, `-1`, `1.5`, `NaN`, or `Infinity` (and the same for `height`) throws `ViewportError` with reason `invalid-grid` from `mount`. `canvas-unavailable` is not tested because it cannot be triggered without mocking. Spec US1/1-6 (depends on T015)

### Implementation for User Story 1

- [ ] T017 [US1] In `src/lib/viewport/expand.ts` export `expandGrayscale(source: Uint8Array | Uint8ClampedArray, target32: Uint32Array): void` with an indexed `for` over `target32.length` doing `target32[index] = opaqueBlack | ((source[index] ?? 0) * 0x010101)` where `const opaqueBlack = 0xff000000`, the same technique as `updateBuffer` in `src/core/headless-renderer/renderer.ts`. No DOM or Svelte imports; no allocation (FR-010, FR-011). Do not export it from `index.ts` (depends on T010)
- [ ] T018 [US1] Create `src/lib/viewport/Viewport.svelte` (`<script lang="ts">`, Svelte 5 runes, `$props()`). Props typed `{ width: number; height: number; onpointer?: (payload: PointerPayload) => void; onwindow?: (payload: WindowPayload) => void }` (public types only from `./types`). Run `Number.isInteger(width) && width > 0` (and `height`) check synchronously in the script initialisation and throw `ViewportError('invalid-grid', 'width and height must be positive integers')`. Markup: one container `<div class="viewport">` holding one `<canvas bind:this={canvas}>`. On mount (`onMount` or `$effect`): set `canvas.width = width` and `canvas.height = height` exactly once, `ctx = canvas.getContext('2d', { alpha: false })`, throw `ViewportError('canvas-unavailable', ...)` on `null`, set `ctx.imageSmoothingEnabled = false` after the size assignment (sizing resets context state), then allocate once `image = ctx.createImageData(width, height)` and `pixels32 = new Uint32Array(image.data.buffer)`. `export function render(frame: GrayscaleImage): void` validates `frame.width === width && frame.height === height && frame.data.length === width * height` else throws `ViewportError('invalid-frame', ...)` before touching the canvas, then calls `expandGrayscale(frame.data, pixels32)` and `ctx.putImageData(image, 0, 0)`. Scoped vanilla CSS: `.viewport { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }` and `canvas { display: block; flex: none; image-rendering: pixelated; touch-action: none; }`. In this story the canvas keeps its intrinsic size; fit scaling comes in T024. Import only the `GrayscaleImage` type from `./types`, never engine state. If errors thrown inside `onMount`/`$effect` cannot be caught by the caller of `mount`, read the Svelte 5 docs in `node_modules/svelte` and restructure (for example creating the context in the script body via an attachment) rather than adding a try/catch shim. Expected: `viewport.test.ts` and `expand.test.ts` pass. FR-001, FR-002, FR-008 to FR-010, FR-012 (depends on T010, T017)
- [ ] T019 [US1] In `src/lib/viewport/index.ts` add `export { default as Viewport } from './Viewport.svelte'` (depends on T011, T018)
- [ ] T020 [US1] Run each as a separate command: `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/viewport/expand.test.ts`, then `... npx vitest run tests/unit/viewport/viewport.test.ts`, then `... npx vitest run --config vitest.config.ts tests/unit/viewport/expand.bench.ts` (use the same bench invocation the existing benchmarks use, e.g. via `npm test`), then `... npm run typecheck` and `... npm run check`; fix failures; if the expansion cannot meet the budget without breaking a constitution principle, halt and flag it (Principle VI) (depends on T013, T014, T016, T019)

**Checkpoint**: A frame renders byte-exactly on a fixed-resolution, crisp canvas with a zero-allocation expansion path.

---

## Phase 4: User Story 2 - Stay Fitted When the Layout Changes (Priority: P1)

**Goal**: The container's observed size drives a uniform fit of the canvas; the backing store is never touched.

**Independent Test**: `npx vitest run tests/unit/viewport/projection.test.ts tests/unit/viewport/layout.test.ts` passes.

### Tests for User Story 2

- [ ] T021 [P] [US2] Create `tests/unit/viewport/projection.test.ts` with the `fitScale` tests (US3 appends `toGrid` tests in T026): `fitScale(100, 100, 4, 2)` is `25`; `fitScale(40, 100, 4, 2)` is `10`; `fitScale(200, 100, 100, 50)` is `2`; `fitScale(400, 200, 100, 50)` is `4`; width-limited and height-limited cases pick the smaller ratio; an exact fit; a container smaller than the grid gives a scale below `1` (for example `fitScale(2, 2, 4, 4)` is `0.5`); a zero container extent gives `0`. Spec US2/1, US2/3
- [ ] T022 [P] [US2] Create `tests/unit/viewport/layout.test.ts` using `mountViewport` and `nextFrame`: a `4 x 2` grid in a `100 x 100` container gives canvas `getBoundingClientRect()` size `100 x 50` and the canvas is centred (its center equals the container center within 0.5 px); after `setContainerSize(40, 100)` and `await nextFrame()` the canvas is `40 x 20`; after `setContainerSize(400, 200)` it is `400 x 200`; `canvas.width` and `canvas.height` remain `4` and `2` after every change and rendered pixels are preserved across a resize (render a known frame, resize, read back the same bytes); `setContainerSize(0, 100)` gives a canvas `getBoundingClientRect()` width and height of `0`; the aspect ratio of the canvas rect always matches the grid within 0.01; unmounting and then resizing the detached container does not throw. Spec US2/1-4 (depends on T015)

### Implementation for User Story 2

- [ ] T023 [US2] In `src/lib/viewport/projection.ts` export `fitScale(containerWidth: number, containerHeight: number, gridWidth: number, gridHeight: number): number` returning `Math.min(containerWidth / gridWidth, containerHeight / gridHeight)`. No DOM or Svelte imports. Do not export from `index.ts`. FR-002 (depends on T010)
- [ ] T024 [US2] In `src/lib/viewport/Viewport.svelte` add a `bind:this` container reference and a single `ResizeObserver` created in the mount effect, observing the container only; its callback reads `entry.contentBoxSize[0].inlineSize` and `blockSize` (no `contentRect` fallback, constitution VII) and stores the container extent in `$state`; derive `scale = fitScale(containerWidth, containerHeight, width, height)` and `cssWidth = width * scale`, `cssHeight = height * scale`; bind them on the canvas with `style:width="{cssWidth}px"` and `style:height="{cssHeight}px"` (zero when the container extent is zero). Never assign `canvas.width`/`canvas.height` again. The effect's cleanup calls `observer.disconnect()`. Reading `scale`/`cssWidth`/`cssHeight` in the pointer handlers later must use the current values, not copies taken at mount. FR-002, FR-003 (depends on T018, T023)
- [ ] T025 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/viewport/projection.test.ts`, then `... npx vitest run tests/unit/viewport/layout.test.ts`, then `... npx vitest run tests/unit/viewport/viewport.test.ts` to confirm US1 still passes, then `... npm run check`; fix failures (depends on T021, T022, T024)

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

- [ ] T031 [P] [US4] Create `tests/unit/viewport/windowing.test.ts` using `mountViewport`, `canvasOrigin`, `nextFrame`, and the real-mouse commands, with grid `100 x 50` at scale `2`, collecting `onpointer` and `onwindow` payloads in separate arrays: `mouseMove` to canvas-local `(20, 20)`, `mouseDown('middle')`, move to `(40, 30)`, then `(40, 50)`, `mouseUp('middle')` gives `onwindow` payloads `{ x: 20, y: 15, dx: 10, dy: 5 }` then `{ x: 20, y: 25, dx: 0, dy: 10 }` (the press at grid `(10, 10)` is the initial sample); no `onpointer` payload is recorded between the middle press and release (only the pre-press hover move and later moves may appear); after release, a hover move reaches `onpointer` again and `onwindow` stays silent; a `pointerdown` with the middle button on the real canvas has `defaultPrevented === true` (attach a capturing listener on the container, or dispatch is not needed because the real press is observed by a `pointerdown` listener added after the component's: assert `event.defaultPrevented` there); resizing the container mid-drag (`setContainerSize(400, 200)`, `await nextFrame()`) makes the next delta use the new scale (the same CSS movement now gives half the grid delta); a drag that leaves the canvas continues and stays clamped to `[0, 100] x [0, 50]`; payloads are plain number objects with keys exactly `x`, `y`, `dx`, `dy`; a left drag produces `onpointer` payloads only and no `onwindow` payload. `pointercancel` cannot be produced by the real mouse, so the cancel branch is covered by inspection in T032. Spec US4/1-5 (depends on T012, T015)

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
Task: "Create svelte.config.js" (T002)
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
