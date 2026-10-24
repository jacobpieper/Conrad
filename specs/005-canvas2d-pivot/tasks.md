---

description: "Task list for the Canvas 2D pivot"
---

# Tasks: Canvas 2D Pivot

**Input**: Design documents from `/specs/005-canvas2d-pivot/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Existing vitest/bench files are adapted (constitution Principle IV requires them); no mocks.

**Organization**: spec.md has no formal user stories; work is grouped into two independent stories mapped to its requirements: US1 = renderer on Canvas 2D (FR-001 to FR-003, P1), US2 = loader max-dimension downscale (FR-004 to FR-007, P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish and the `fnm env --shell fish | source; and fnm use 24; and ...` prefix (constitution V)

---

## Phase 1: Setup (Remove WebGPU Tooling)

- [ ] T001 [P] In `vitest.config.ts`, remove the launch args `--enable-unsafe-webgpu`, `--enable-features=Vulkan`, `--use-angle=vulkan`; keep `--enable-precise-memory-info`
- [ ] T002 [P] In `tsconfig.json`, change `"types": ["@webgpu/types", "node"]` to `"types": ["node"]`
- [ ] T003 Remove `@webgpu/types` from `devDependencies` in `package.json` and update the lockfile with `npm uninstall @webgpu/types` (after T002)

**Checkpoint**: `npm run typecheck` is expected to fail only in `src/core/headless-renderer` and its tests until US1 is done.

---

## Phase 2: Foundational

None. The two stories touch separate modules and do not block each other.

---

## Phase 3: User Story 1 - Canvas 2D Headless Renderer (Priority: P1) MVP

**Goal**: `src/core/headless-renderer` renders with Canvas 2D with an unchanged public API (except the `'canvas-unavailable'` reason).

**Independent Test**: `npx vitest run tests/unit/headless-renderer` passes in headless Chromium with no WebGPU flags, and `grep -ri "gpu" src/core/headless-renderer tests/unit/headless-renderer` returns nothing.

### Implementation for User Story 1

- [ ] T004 [US1] Rewrite `src/core/headless-renderer/types.ts` per data-model.md: `ImageState` = `{ width, height, staging: OffscreenCanvas, stagingContext: OffscreenCanvasRenderingContext2D, pixels: ImageData, pixels32: Uint32Array }`; `TargetState` = `{ canvas: HTMLCanvasElement | OffscreenCanvas, context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }`; `RendererState` = `{ viewport, surface: OffscreenCanvas, surfaceContext: OffscreenCanvasRenderingContext2D, image, target }`; `RendererErrorReason` = `'canvas-unavailable' | 'invalid-image' | 'invalid-viewport' | 'invalid-output'`; keep `RendererError` and the `GrayscaleImage` re-export
- [ ] T005 [US1] Rewrite `src/core/headless-renderer/renderer.ts` on Canvas 2D, keeping every exported function name and signature (`createRenderer` and `readSurface` stay Promise-returning):
  - `validateViewport`: positive integers only (the device-limit check is removed); image validation: positive integers and `data.length === width * height`; both run before any mutation
  - `render`: fill the surface with `rgb(16, 16, 16)`; if an image exists, set `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`, compute contain-fit scale and centered offset, and `drawImage(staging, dx, dy, dw, dh)`; if a target is bound, `drawImage(surface, 0, 0)` onto the target context
  - `createRenderer`: create the surface `OffscreenCanvas` and its `2d` context (throw `RendererError('canvas-unavailable')` if the context is `null`), then render the blank frame
  - `updateBuffer`: when dimensions differ from the current image (or no image), allocate staging canvas, `ImageData`, and `Uint32Array` view; expand each gray byte `v` into `pixels32[i] = 0xff000000 | v * 0x010101` (zero per-update allocation at constant size); `stagingContext.putImageData(pixels, 0, 0)`; render; do not retain `image.data`
  - `resize`: validate, no-op if unchanged, set surface and bound-canvas `width`/`height`, render
  - `bindTarget`: set canvas size to the viewport, `getContext('2d', { alpha: false })`, throw `'canvas-unavailable'` on `null` without disturbing the existing target, replace the target, render
  - `unbindTarget`: set `target = null`; `destroyRenderer`: set the surface (and staging) canvas sizes to 0 and null `image`/`target`
  - `readSurface`: length check against `width * height * 4` (`'invalid-output'`), `surfaceContext.getImageData(0, 0, width, height)` copied into `out`
- [ ] T006 [P] [US1] Delete `src/core/headless-renderer/shader.ts`; in `src/core/headless-renderer/index.ts` keep the existing exports (no change expected beyond confirming nothing imports the shader)
- [ ] T007 [US1] Adapt `tests/unit/headless-renderer/renderer.test.ts`: replace `renderer.device.limits.maxTextureDimension2D` checks (around lines 114 and 195) with fixed invalid cases (`0`, negative, fractional); rename the test at line 266 to expect `reason: 'canvas-unavailable'` (e.g. a canvas that already holds a `webgl2` context); keep exact-equality assertions for equal image/viewport sizes
- [ ] T008 [US1] Update `tests/unit/headless-renderer/reference.ts` and the non-1:1 assertions in `tests/unit/headless-renderer/renderer.test.ts` to a per-channel tolerance measured against Chromium's `drawImage` bilinear output (research R4); letterbox pixels must remain exactly `16` with alpha `255`
- [ ] T009 [US1] Adapt `tests/unit/headless-renderer/update-buffer.bench.ts`: drop the `device.queue.onSubmittedWorkDone()` calls and flush instead with a 1x1 `state.surface.getContext('2d')?.getImageData(0, 0, 1, 1)`; keep the 50 ms budget at 1920x1080 and the heap-growth assertion (`updateGrowth < 100_000`, control `> 100_000`)
- [ ] T010 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/headless-renderer` and fix failures; if heap growth cannot stay bounded without breaking Principle I, halt and flag it (Principle VI)

**Checkpoint**: Renderer works on Canvas 2D and is independently verifiable.

---

## Phase 4: User Story 2 - Loader Max Dimensions with Downscale (Priority: P2)

**Goal**: Loaders accept optional `{ maxWidth, maxHeight }` (default 128 each) and downscale oversized images during canvas extraction.

**Independent Test**: With defaults, a 4000x3000 image loads as 128x96, a 64x32 image is unchanged; `{ maxWidth: 0 }` rejects with `'invalid-options'`.

### Implementation for User Story 2

- [ ] T011 [P] [US2] In `src/core/image-loader/types.ts` add `export type LoadImageOptions = { maxWidth?: number; maxHeight?: number }`; in `src/core/image-loader/errors.ts` add `'invalid-options'` to `ImageLoadErrorReason`; export `LoadImageOptions` from `src/core/image-loader/index.ts`
- [ ] T012 [US2] In `src/core/image-loader/load-image.ts`: add a `resolveBounds(options)` helper that defaults each bound to 128 and throws `ImageLoadError('invalid-options')` unless each is a positive integer; add `options?: LoadImageOptions` as the second parameter of `loadImageFromUrl`, `loadImageFromBlob`, and `loadImage`, resolving it before any fetch or decode (after T011)
- [ ] T013 [US2] In `decodeBlob` in `src/core/image-loader/load-image.ts`: `scale = Math.min(1, maxWidth / width, maxHeight / height)`; `targetWidth = Math.max(1, Math.floor(width * scale))`, same for height; create the `OffscreenCanvas` at the target size, set `imageSmoothingQuality = 'high'`, `drawImage(bitmap, 0, 0, targetWidth, targetHeight)`, `getImageData(0, 0, targetWidth, targetHeight)`, and return the target `width`/`height` with `toGrayscale` data (same file as T012)
- [ ] T014 [US2] In `src/core/image-loader/load-image.ts` delete the `typeof OffscreenCanvas === 'undefined'` / `document.createElement('canvas')` branch and the `PixelContext` fallback typing; use `OffscreenCanvas` only (constitution VII zero shims) (same file as T013)
- [ ] T015 [US2] In `tests/unit/image-loader/load-image.test.ts` add cases using canvas-encoded PNG fixtures: 4000x3000 with defaults gives 128x96; 300x100 gives 128x42; 64x32 is unchanged; `{ maxWidth: 50, maxHeight: 50 }` on 200x100 gives 50x25; each result has `data.length === width * height`; `{ maxWidth: 0 }`, `{ maxHeight: 1.5 }`, and `{ maxWidth: -1 }` reject with `reason: 'invalid-options'` and perform no network request
- [ ] T016 [US2] Update the existing `large image performance` test in `tests/unit/image-loader/load-image.test.ts` (it expects 1920x1080 output) to pass `{ maxWidth: 1920, maxHeight: 1080 }` so it still measures full-size decode, and check other existing tests whose fixtures exceed 128 px for the same fix
- [ ] T017 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/image-loader` and fix failures

**Checkpoint**: Loader downscaling and validation work independently of the renderer.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T018 [P] Mark `specs/002-headless-renderer/spec.md` and `specs/002-headless-renderer/plan.md` as superseded by `specs/005-canvas2d-pivot`; add a note to `specs/001-image-loader/contracts/image-loader-api.md` pointing to the new options
- [ ] T019 Run the full verification: `fnm env --shell fish | source; and fnm use 24; and npm test`, then `npm run typecheck` and `npm run lint` (separately, same prefix); resolve all errors
- [ ] T020 Run the `quickstart.md` scenarios, including `grep -ri "webgpu\|gpu" src tests vitest.config.ts tsconfig.json package.json` returning nothing
- [ ] T021 Commit per constitution V with Conventional Commits under 50 characters (e.g. `refactor: move renderer to Canvas 2D`, `feat: downscale loaded images`, `chore: drop WebGPU tooling`)

---

## Dependencies & Execution Order

- Setup (T001-T003): T003 after T002; otherwise parallel.
- US1 and US2 are independent and may proceed in parallel after Setup (US2 does not need T001-T003 at all).
- Within US1: T004 -> T005 -> (T006, T007) -> T008 -> T009 -> T010.
- Within US2: T011 -> T012 -> T013 -> T014 (same file, sequential); T015/T016 after T013; T017 last.
- Polish after both stories; T018 can run any time after the stories are scoped.

### Parallel Opportunities

- T001 || T002
- T006 || T007 (after T005)
- T011 can run alongside all of US1
- T018 || T019 prep

### Parallel Example

```text
Task: "Rewrite renderer on Canvas 2D" (T004-T005)
Task: "Add LoadImageOptions and 'invalid-options'" (T011)
```

## Implementation Strategy

### MVP First

1. Phase 1 Setup
2. Phase 3 (US1): the renderer, which was blocked on Linux/Wayland
3. Validate with `tests/unit/headless-renderer`

### Incremental Delivery

1. Add US2 (loader downscale) and validate independently
2. Polish, full test run, and commit after each story
