# Implementation Plan: Headless Renderer

**Branch**: `002-headless-renderer` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-headless-renderer/spec.md`, plus planning directives: native WebGPU only; expose `bindTarget`, `resize`, `updateBuffer`; all pipeline/shader/texture/buffer-mapping work internal; no Svelte code; at most 4 source files; image stored in an `r8unorm` texture uploaded with `writeTexture` (no storage buffer, no manual byte packing).

## Summary

A framework-agnostic TypeScript module that renders a single-channel `GrayscaleImage` with native WebGPU. A renderer owns a WebGPU device, a render pipeline (compiled internally from one WGSL shader), an `r8unorm` image texture holding the grayscale pixels, a linear sampler, and an offscreen `rgba8unorm` surface texture sized to the viewport. A fullscreen-triangle fragment shader fits the image (contain, centered) into the surface using the GPU's native bilinear sampler. `bindTarget` configures a `GPUCanvasContext` on an `HTMLCanvasElement | OffscreenCanvas` and each frame is presented with a same-format `copyTextureToTexture` into the canvas texture. `resize` is driven by the caller (e.g. a Svelte `ResizeObserver`); `updateBuffer` uploads pixels with `queue.writeTexture`. `readSurface` maps a staging buffer internally so the headless surface is inspectable without any canvas.

## Technical Context

**Language/Version**: TypeScript 6 strict mode, ES2022 target (existing `tsconfig.json`)

**Primary Dependencies**: Native WebGPU only (`navigator.gpu`, `GPUDevice`, `GPUCanvasContext`). Dev-only type package `@webgpu/types` (declarations, no runtime code) because `lib.dom` does not ship WebGPU types. No runtime dependencies.

**Storage**: N/A. GPU-resident textures owned by the renderer state.

**Testing**: `vitest` exclusively, Browser Mode with Playwright Chromium (already configured). Chromium launch args are extended to expose a WebGPU adapter in headless mode (software adapter fallback is a launch flag of the test harness, not application code). No mocks: tests run real shaders on a real adapter and assert on real read-back pixels.

**Target Platform**: Browser, client-side only. Consumed later by SvelteKit components; this module never imports Svelte.

**Project Type**: Single project, core engine library module at `src/core/headless-renderer/`

**Performance Goals**: 1920x1080 viewport: `updateBuffer` + render complete under 50 ms (SC-006). No per-pixel JS allocation (SC-005); render is on-demand (not a continuous loop).

**Constraints**: Plain-record state plus free functions (no classes for renderer state); GPU textures/bind groups/pipeline/sampler created only at `createRenderer` or on size change, never per update at constant size; `queue.writeTexture` for uploads (rows tightly packed, no padding or repacking, no mapping on the hot path); input validation before any mutation so failures leave state intact (FR-013); presentation target is touched only through the explicit `bindTarget`; at most 4 source files.

**Scale/Scope**: One module, 1 active image per renderer, N independent renderers, optional single bound target per renderer. No zoom, pan, rotate, or leveling (FR-015).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: unchanged, all gates hold.*

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Image data stays a flat `Uint8ClampedArray` and is uploaded as-is to an `r8unorm` texture (one byte per pixel, no repacking). State is a plain record; operations are free functions. The `Float32Array` uniform scratch is pre-allocated once. Per-frame WebGPU API objects (command encoder, canvas texture view) are unavoidable API-owned objects, created per on-demand render, never per pixel. Renders are event-driven, not a continuous loop. |
| II. Architecture & Pipeline Modularity | PASS | Strict buffer contract in (`GrayscaleImage`) and out (surface RGBA8 via `readSurface`, or canvas). Fully client-side, native WebGPU. Grayscale is single-channel (`r8unorm`) until the final RGBA8 surface, which is required for presentation. |
| III. UI & Interactivity Standards | PASS | No Svelte, no DOM lookups; `HTMLCanvasElement` is only a caller-supplied argument type for `bindTarget`. `resize` is a plain function that Svelte code will call from its own `ResizeObserver` later. |
| IV. Testing & Benchmarking | PASS | Vitest only, no mocks, real GPU read-back. A benchmark asserts the time budget and that JS heap does not grow across repeated `updateBuffer` calls at constant size. |
| V. Code, Git & Governance | PASS | Strict TS, no semicolons, Conventional Commits (applied in `/speckit-implement`). |
| VI. Halt and Catch Fire | PASS | See Resolved Tension 1 below; no principle needs to be broken. |
| VII. Scope & Simplicity | PASS with FLAG | 4 source files, no plugins, retries, fallbacks, or feature checks; fail fast on adapter/device failure. **Flag**: the pinned floor (Firefox 125+, Safari 18+) predates default WebGPU in those browsers, while Principle II mandates WebGPU. Under "zero shims", the renderer fails fast there. Recommend a human decision to amend the floor (see Complexity Tracking). Not blocking. |

### Resolved Tensions

1. **Requested signatures vs. FR-010/FR-014 (no hidden global state, N independent renderers).** `bindTarget(canvas)`, `resize(w, h)`, `updateBuffer(data)` cannot work without module-level singletons. Resolution: each takes the renderer state as an explicit first argument (`bindTarget(state, canvas)`, `resize(state, w, h)`, `updateBuffer(state, image)`), with the state created by `createRenderer`. Names and responsibilities are exactly as requested.
2. **`updateBuffer(data)` vs. needing dimensions.** The image texture is sized from the image, and the fit needs width and height (FR-001, FR-004), so `updateBuffer` accepts the existing `GrayscaleImage` (`{ width, height, data }`) instead of a bare array; `data` is still the flat `Uint8ClampedArray` written to the GPU texture.
3. **Headless readability (FR-009/FR-011) vs. WebGPU.** Rendering targets an offscreen texture, and `readSurface` performs the internal `copyTextureToBuffer` + `mapAsync`, satisfying "buffer mapping happens internally".

## Project Structure

### Documentation (this feature)

```text
specs/002-headless-renderer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── headless-renderer-api.md   # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── core/
    ├── image-loader/                 # existing
    └── headless-renderer/
        ├── index.ts                  # Public exports (functions, RendererState, RendererError)
        ├── types.ts                  # RendererState, Viewport, RendererError + reasons; re-uses GrayscaleImage
        ├── shader.ts                 # WGSL source (vertex + fragment) as a string constant
        └── renderer.ts               # All operations: createRenderer, destroyRenderer, updateBuffer, resize,
                                      # bindTarget, unbindTarget, readSurface + unexported helpers
                                      # (validation, resource creation, render/present)

tests/
└── unit/
    └── headless-renderer/
        ├── reference.ts              # Independent CPU reference of the fit math
        ├── renderer.test.ts          # User Stories 1-3, validation, isolation (FR-012 to FR-014)
        └── update-buffer.bench.ts    # SC-005 / SC-006

vitest.config.ts                      # Extend Chromium launch args for WebGPU
package.json / tsconfig.json          # Add @webgpu/types devDependency and "types" entry
```

**Structure Decision**: Single project, sibling to `src/core/image-loader/`. Four source files total: a thin `index.ts`, the shared `types.ts`, the WGSL string in `shader.ts` (kept separate so shader text is not buried in logic), and one `renderer.ts` holding every operation and its private helpers. Helpers are plain unexported functions, not separate modules. No Svelte files are created.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Browser floor (Chrome 120+, Firefox 125+, Safari 18+) vs. mandated WebGPU (Principle II) is internally inconsistent | WebGPU is non-negotiable per Principle II and the planning directive | Adding a Canvas2D fallback is forbidden by VII (zero shims). Recommend amending the Constitution's floor to browsers shipping WebGPU, or accepting fail-fast on unsupported browsers (current plan). |
