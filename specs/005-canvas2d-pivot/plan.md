# Implementation Plan: Canvas 2D Pivot

**Branch**: `005-canvas2d-pivot` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-canvas2d-pivot/spec.md`

## Summary

Replace the WebGPU internals of `src/core/headless-renderer` with Canvas 2D while keeping the public API. Pixels are expanded once per update from the single-channel `Uint8ClampedArray` into a pre-allocated RGBA `ImageData` (written through a `Uint32Array` view, one store per pixel), uploaded with `putImageData` to an image-sized staging `OffscreenCanvas`, then drawn contain-fit onto a viewport-sized `OffscreenCanvas` surface with `drawImage`. A bound target is presented by a 1:1 `drawImage` blit of the surface. `readSurface` uses `getImageData`. Separately, `src/core/image-loader` gains optional `{ maxWidth, maxHeight }` (default 128) and downscales inside the existing canvas extraction step.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: Native Canvas 2D (`OffscreenCanvas`, `CanvasRenderingContext2D`, `ImageData`). Removes dev dependency `@webgpu/types`.

**Storage**: N/A

**Testing**: `vitest` Browser Mode, Playwright Chromium; remove `--enable-unsafe-webgpu`, `--enable-features=Vulkan`, `--use-angle=vulkan` (keep `--enable-precise-memory-info`). No mocks.

**Target Platform**: Chrome 120+, Firefox 125+, Safari 18+ (all support 2D `OffscreenCanvas`; this also resolves the WebGPU floor flag from 002)

**Project Type**: Single project, core library

**Performance Goals**: Unchanged from 002: 1920x1080 `updateBuffer` + render under 50 ms; no JS heap growth at constant size.

**Constraints**: Plain-record state, free functions; at most 4 source files per module (`shader.ts` deleted); validation before mutation; fail fast; no feature checks or fallbacks.

**Scale/Scope**: One renderer module and one loader module. No new modules.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS with FLAG | Image stays a flat `Uint8ClampedArray`; RGBA scratch `ImageData` and its `Uint32Array` view are allocated only when image size changes, never per update. `putImageData`/`drawImage` allocate no JS objects. **Flag**: `readSurface` (`getImageData`) allocates; it is an inspection/test path, not the render loop. |
| II. Pipeline Modularity | PASS | Buffer contracts unchanged; Canvas is a named allowed native API; fully client-side. |
| III. UI Standards | PASS | No Svelte or DOM lookups; canvas is caller-supplied. |
| IV. Testing & Benchmarking | PASS | Existing vitest/bench files are adapted; no mocks. |
| V. Code & Git | PASS | Strict TS, no semicolons, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | Removes the 002 browser-floor conflict. The loader's `typeof OffscreenCanvas === 'undefined'` branch is a forbidden shim and is deleted in this change. |

Post-design re-check: unchanged.

## Project Structure

```text
specs/005-canvas2d-pivot/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── headless-renderer-api.md
    └── image-loader-api.md
```

```text
src/core/
├── headless-renderer/
│   ├── index.ts      # exports unchanged
│   ├── types.ts      # RendererState/ImageState/TargetState rewritten for 2D; reason 'webgpu-unavailable' -> 'canvas-unavailable'
│   ├── renderer.ts   # rewritten on Canvas 2D
│   └── shader.ts     # DELETED
└── image-loader/
    ├── index.ts      # also exports LoadImageOptions
    ├── types.ts      # + LoadImageOptions
    ├── errors.ts     # + 'invalid-options'
    └── load-image.ts # options param, scale step, shim removed

tests/unit/{headless-renderer,image-loader}/   # adapted
vitest.config.ts, tsconfig.json, package.json  # drop WebGPU flags/types/dependency
```

**Structure Decision**: Modify the two existing modules in place; no new files.

## Open Flags for Human Review

1. Error reason rename `'webgpu-unavailable'` -> `'canvas-unavailable'` is the only visible contract change. Function signatures are untouched.
2. `ImageLoadError` gains `'invalid-options'` (additive).
3. Spec 002 and the constitution's "(WebGPU, Canvas)" wording remain valid; 002 docs should be marked superseded.
