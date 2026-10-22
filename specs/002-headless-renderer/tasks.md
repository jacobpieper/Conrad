---

description: "Task list for the Headless Renderer feature"
---

# Tasks: Headless Renderer

**Input**: Design documents from `/specs/002-headless-renderer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/headless-renderer-api.md](./contracts/headless-renderer-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The constitution mandates `vitest` tests with no mocks for pixel pipelines and benchmarks for hot paths; tests run real shaders on a real WebGPU adapter and assert on real read-back pixels.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project (per [plan.md](./plan.md) Structure Decision): `src/core/headless-renderer/` (exactly 4 files: `index.ts`, `types.ts`, `shader.ts`, `renderer.ts`) and `tests/unit/headless-renderer/`. Helpers live as unexported functions inside `renderer.ts`; do NOT add more source files. Code style: strict TypeScript, no `any`/`@ts-ignore`, no semicolons, no classes for renderer state (a plain record plus free functions).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling needed to compile and run WebGPU code under Vitest

- [X] T001 Create directories `src/core/headless-renderer/` and `tests/unit/headless-renderer/`
- [X] T002 [P] Add `@webgpu/types` as a devDependency in `package.json` and set `compilerOptions.types` to `["@webgpu/types", "node"]` in `tsconfig.json` (`node` must stay listed so existing `tests/setup/cross-origin-server.ts` keeps type-checking)
- [X] T003 [P] Extend `launchOptions.args` in `vitest.config.ts` (keep `--enable-precise-memory-info`) with Chromium flags that expose a WebGPU adapter in headless mode: `--enable-unsafe-webgpu` and a software adapter (`--use-webgpu-adapter=swiftshader`, plus `--use-angle=swiftshader` if needed)
- [X] T004 Confirm the flags from T003 with a throwaway `tests/unit/headless-renderer/probe.test.ts` asserting `await navigator.gpu.requestAdapter()` is non-null and that an `OffscreenCanvas(1, 1).getContext('webgpu')` is non-null; adjust the flag set until it passes, record the final flags in [research.md](./research.md) R10 and [quickstart.md](./quickstart.md) prerequisites, then delete the probe file (depends on T001, T003)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, shader, reference implementation, and the renderer skeleton every story depends on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Define types in `src/core/headless-renderer/types.ts` per [data-model.md](./data-model.md): `Viewport` (`width`/`height`: "Positive integer, `<= device.limits.maxTextureDimension2D`"), `ImageState` (`width`, `height`, `texture: GPUTexture` as `r8unorm`, `bindGroup`), `TargetState` (`canvas: HTMLCanvasElement | OffscreenCanvas`, `context: GPUCanvasContext`), `RendererState` (fields exactly as in data-model: `device`, `pipeline`, `bindGroupLayout`, `sampler`, `uniformBuffer`, `uniformScratch: Float32Array`, `viewport`, `surface`, `surfaceView`, `readbackBuffer`, `image: ImageState | null`, `target: TargetState | null`), and `RendererError` (extends `Error`, with `reason: 'webgpu-unavailable' | 'invalid-image' | 'invalid-viewport' | 'invalid-output'` and optional `cause`), mirroring `ImageLoadError` in `src/core/image-loader/errors.ts`; import `GrayscaleImage` from `../image-loader`
- [X] T006 [P] Write the WGSL source as an exported string constant in `src/core/headless-renderer/shader.ts`: a vertex stage producing a fullscreen triangle from `vertex_index` (no vertex buffer); a fragment stage reading a `vec2f` viewport uniform (binding 0), a `sampler` (binding 1), and a `texture_2d<f32>` `r8unorm` image (binding 2); image size from `textureDimensions`; `s = min(vw/iw, vh/ih)`; offset `((vw - iw*s)/2, (vh - ih*s)/2)`; pixel center `(x + 0.5, y + 0.5)` mapped to `uv = (pixel - offset) / (imageSize * s)`; outside `[0,1]` output background `16/255` gray with alpha 1; inside `textureSampleLevel(image, sampler, uv, 0)` output `(g, g, g, 1)` per [data-model.md](./data-model.md) Fit placement and [research.md](./research.md) R4
- [X] T007 [P] Implement the independent CPU reference in `tests/unit/headless-renderer/reference.ts`: `referenceFrame(image, viewportWidth, viewportHeight): Uint8Array` returning RGBA8 using the Fit placement formulas in [data-model.md](./data-model.md) (contain fit, centered, bilinear with edge clamp, background `16`, alpha `255`); write it from the formulas, not by porting the shader
- [X] T008 Add unexported helpers to `src/core/headless-renderer/renderer.ts`: `validateViewport(device, width, height)` throwing `RendererError('invalid-viewport')` unless both are "positive integer, `<= maxTextureDimension2D`"; `createSurfaceResources(device, width, height)` returning the `rgba8unorm` surface texture (`RENDER_ATTACHMENT | COPY_SRC`), its view, and the `MAP_READ | COPY_DST` readback buffer sized `alignedBytesPerRow * height` (rows padded to a 256-byte multiple); and `render(state)` that records a pass clearing to background `16/255` (alpha 1) and, when `state.image` is non-null, sets the pipeline and bind group and draws 3 vertices, then submits (depends on T005, T006)
- [X] T009 Implement `createRenderer(width, height): Promise<RendererState>` and `destroyRenderer(state)` in `src/core/headless-renderer/renderer.ts`: `requestAdapter` returning `null` or `requestDevice` rejecting throws `RendererError('webgpu-unavailable')` with the native result as `cause` (no retries, no feature sniffing); validate the viewport; compile the shader module and create the pipeline (target `rgba8unorm`), bind group layout (uniform, filtering sampler, float texture), `linear`/`clamp-to-edge` sampler, 8-byte uniform buffer plus `Float32Array(2)` scratch written with the viewport, surface resources, and `image: null`/`target: null`; render the blank frame; `destroyRenderer` destroys all GPU resources and the device (depends on T008)
- [X] T010 Implement `readSurface(state, out)` in `src/core/headless-renderer/renderer.ts`: throw `RendererError('invalid-output')` unless `out.length === viewport.width * viewport.height * 4`; encode `copyTextureToBuffer` into the persistent readback buffer, `await mapAsync(GPUMapMode.READ)`, copy rows without padding into `out`, `unmap`; no allocation per call (depends on T009)
- [X] T011 Create `src/core/headless-renderer/index.ts` exporting `createRenderer`, `destroyRenderer`, `readSurface`, and the `RendererState`, `Viewport`, `RendererError` and `RendererErrorReason` types (later stories append their exports in their own tasks) (depends on T010)

**Checkpoint**: A renderer can be created, produces a blank surface, and can be read back and destroyed.

---

## Phase 3: User Story 1 - Render a grayscale image into an internal surface (Priority: P1) MVP

**Goal**: Setting an image produces a correct fitted frame in the internal surface, readable as raw pixels, with no canvas involved.

**Independent Test**: Create a renderer at a known viewport, set a known small image, `readSurface`, and compare to expected pixels / `reference.ts`.

### Tests for User Story 1

> Write these first and confirm they fail before T013.

- [X] T012 [US1] Add US1 tests to `tests/unit/headless-renderer/renderer.test.ts` (Vitest, real GPU, no mocks): (a) fresh renderer surface equals the viewport size and is all background (`16,16,16,255`); (b) image with dimensions equal to the viewport (e.g. 4x4 gradient) yields R=G=B equal to the image intensities exactly (FR-005); (c) larger/smaller images and differing aspect ratios (pillarbox and letterbox) match `referenceFrame` within +/-1 per channel, with unused area equal to the background; (d) setting a second image leaves no remnants of the first; (e) `data.length !== width * height`, zero/negative/non-integer image dimensions, and dimensions over `maxTextureDimension2D` throw `RendererError` with reason `'invalid-image'` and the previous surface is unchanged (FR-012, FR-013); (f) two renderers with different images stay independent (FR-014); (g) `readSurface` with a wrong-length `out` throws `'invalid-output'`; (h) `readSurface` before any image works headlessly with no canvas (FR-009, FR-011)

### Implementation for User Story 1

- [X] T013 [US1] Implement `updateBuffer(state, image)` in `src/core/headless-renderer/renderer.ts`: validate before any mutation ("`width`/`height` positive integers, `<= maxTextureDimension2D`; `data.length === width * height`") else `RendererError('invalid-image')`; reuse `state.image.texture` when dimensions are unchanged, otherwise create a new `r8unorm` texture (`TEXTURE_BINDING | COPY_DST`) and bind group, then destroy the old texture; upload with `queue.writeTexture` using `bytesPerRow: width` and `rowsPerImage: height` directly from `image.data` (no copy, no mapping); call `render(state)`; export from `src/core/headless-renderer/index.ts` (depends on T012)

**Checkpoint**: User Story 1 is fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Resize the surface when the viewport changes (Priority: P2)

**Goal**: A caller-driven resize adjusts the surface and re-fits the current image.

**Independent Test**: Render an image, resize larger/smaller/back, and compare each `readSurface` result to `referenceFrame` for the new size.

### Tests for User Story 2

> Write these first and confirm they fail before T015.

- [X] T014 [US2] Add US2 tests to `tests/unit/headless-renderer/renderer.test.ts`: (a) resize larger and smaller with an image matches `referenceFrame` at the new size; (b) resize with no image gives a background frame at the new size; (c) resize to the same size keeps the surface content byte-identical; (d) `resize(0, 10)`, `resize(-1, 10)`, `resize(10.5, 10)`, and a dimension over `maxTextureDimension2D` throw `RendererError('invalid-viewport')` and leave the previous size and content unchanged (FR-012, FR-013); (e) many rapid consecutive resizes end in a correct frame for the last size; (f) after a resize, `readSurface` requires `out.length` for the new size (depends on T013)

### Implementation for User Story 2

- [X] T015 [US2] Implement `resize(state, width, height)` in `src/core/headless-renderer/renderer.ts`: `validateViewport` first; return immediately if the size is unchanged; otherwise create the new surface resources, destroy the old surface and readback buffer, write the new viewport into `uniformScratch` and `uniformBuffer`, update `state.viewport`, and `render(state)`; export from `src/core/headless-renderer/index.ts` (depends on T014)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Present the surface on an optional external target (Priority: P3)

**Goal**: A bound `HTMLCanvasElement | OffscreenCanvas` mirrors the surface; an unbound renderer behaves identically.

**Independent Test**: Bind an `OffscreenCanvas`, set an image, capture the canvas pixels, and compare to `readSurface`; unbind and confirm the canvas no longer changes.

### Tests for User Story 3

> Write these first and confirm they fail before T017.

- [ ] T016 [US3] Add US3 tests to `tests/unit/headless-renderer/renderer.test.ts` using an `OffscreenCanvas` and capturing it via `transferToImageBitmap()` drawn into a 2D `OffscreenCanvas` (`getImageData`): (a) all earlier scenarios still pass with no target bound; (b) `bindTarget` sets the canvas size to the viewport and shows the current surface immediately; (c) `updateBuffer` while bound updates the target to match `readSurface` exactly; (d) `resize` while bound updates the canvas size and content; (e) after `unbindTarget`, `updateBuffer` changes the surface but not the old canvas; (f) binding a second canvas replaces the first, which is no longer updated (depends on T015). Note: written, but presentation assertions fail in headless Chromium/SwiftShader with `AbortError: A valid external Instance reference no longer exists`; a minimal WebGPU canvas render/copy probe reproduced this independent of renderer code.

### Implementation for User Story 3

- [X] T017 [US3] Extend `render(state)` in `src/core/headless-renderer/renderer.ts` so that when `state.target` is non-null it obtains `context.getCurrentTexture()` and records `copyTextureToTexture(surface, canvasTexture)` (same-format, full viewport extent) before submit (depends on T016)
- [X] T018 [US3] Implement `bindTarget(state, canvas)` and `unbindTarget(state)` in `src/core/headless-renderer/renderer.ts`: `bindTarget` unconfigures any previous target, calls `canvas.getContext('webgpu')`, configures it with `device`, `format: 'rgba8unorm'`, `alphaMode: 'opaque'`, `usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST`, sets `canvas.width`/`canvas.height` to the viewport, stores `state.target`, and presents immediately via `render(state)`; make `resize` (T015) also set the bound canvas `width`/`height` before rendering; `unbindTarget` unconfigures the context and sets `state.target = null` (no-op when unbound); make `destroyRenderer` unconfigure any bound target; export both from `src/core/headless-renderer/index.ts` (depends on T017)

**Checkpoint**: All three user stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Add `tests/unit/headless-renderer/update-buffer.bench.ts`, following the heap-growth pattern in `tests/unit/image-loader/to-grayscale.bench.ts` (including its control that must register): at a 1920x1080 viewport and image, `updateBuffer` plus `await device.queue.onSubmittedWorkDone()` completes under 50 ms (SC-006); repeated `updateBuffer` at constant size shows JS heap growth below a small threshold (SC-005) (depends on T013)
- [X] T020 [P] Run `npm run typecheck` and `npm run lint` and fix findings in `src/core/headless-renderer/` and `tests/unit/headless-renderer/` (no semicolons, no `any`, no `@ts-ignore`) (depends on T018)
- [ ] T021 Run `npx vitest run tests/unit/headless-renderer` plus the full `npm test`, and walk through every scenario in [quickstart.md](./quickstart.md); confirm `src/core/headless-renderer/` contains exactly the 4 planned files and imports no Svelte or `document`/`window` APIs (depends on T019, T020). Partial: typecheck, lint, 42 tests, and the four-file/framework-boundary checks pass; 2 canvas target tests fail with `A valid external Instance reference no longer exists` in headless Chromium/SwiftShader, reproduced by a minimal canvas submission probe.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories
- **User Stories (Phase 3-5)**: Depend on Foundational. They edit the same `renderer.ts` and `renderer.test.ts`, so they proceed sequentially in priority order (P1, P2, P3) rather than in parallel
- **Polish (Phase 6)**: Depends on all stories

### Task-Level Dependencies

- T004 needs T001 and T003; T005, T006, T007 are independent of each other
- T008 needs T005 and T006; T009 needs T008; T010 needs T009; T011 needs T010
- Each story: tests (T012, T014, T016) before implementation (T013, T015, T017/T018)
- T019 needs T013; T020 needs T018; T021 needs T019 and T020

### Parallel Opportunities

- T002 and T003 together after T001
- T005, T006, T007 together (three different files)
- T019 and T020 together in Polish

```bash
# Phase 2 parallel batch
Task: "Define types in src/core/headless-renderer/types.ts"
Task: "Write WGSL in src/core/headless-renderer/shader.ts"
Task: "CPU reference in tests/unit/headless-renderer/reference.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (confirm headless WebGPU works in T004 before anything else)
2. Phase 2: Foundational
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: run the US1 tests; the headless surface is already usable by downstream code

### Incremental Delivery

1. Setup + Foundational: blank headless renderer
2. US1: fitted image rendering (MVP)
3. US2: caller-driven resize
4. US3: optional canvas presentation
5. Polish: benchmark, lint, typecheck, quickstart validation

---

## Notes

- Commit after each completed task or logical group using Conventional Commits (subject under 50 characters), per the constitution
- If a task cannot be completed without per-pixel allocation, OOP state, or breaking the pure-function contract, halt and flag it per Constitution VI
- If T004 cannot get a WebGPU adapter in headless Chromium, stop and flag it for human review rather than mocking WebGPU (mocks are forbidden)
- Fail fast: no retries, fallbacks, or feature checks; trust native WebGPU results
