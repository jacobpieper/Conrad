# Implementation Plan: Compositor Core

**Branch**: `006-compositor-core` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-compositor-core/spec.md`

## Summary

A framework-agnostic module that owns a fixed-capacity table of static single-channel layers with per-layer attenuation weights, and a `compose` function that produces a renderer-ready `GrayscaleImage`. All buffers (layer table, weights, active flags, a `Float32Array` accumulator, and a `Uint8ClampedArray` output) are allocated once in `createCompositor`. `compose` zero-fills the accumulator, adds `weight * layer[i]` for every active layer in layer-major order, then copies the accumulator into the output, where `Uint8ClampedArray` assignment performs rounding and clamping natively. State is a plain record and every operation is a free function.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: None. Re-uses the `GrayscaleImage` type from `src/core/image-loader`.

**Storage**: N/A (in-memory typed arrays)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing). Real buffers, no mocks. One benchmark file for time budget and heap growth, following `tests/unit/headless-renderer/update-buffer.bench.ts`.

**Target Platform**: Browser, client-side; also DOM-free so it can run in a Web Worker later.

**Project Type**: Single project, core engine module at `src/core/compositor-core/`

**Performance Goals**: 8 active layers at 512x512 composed within a budget calibrated during implementation (initial target 10 ms); no JS heap growth across repeated calls.

**Constraints**: Zero allocation in `compose` (plain indexed `for` loops, no iterators, closures, spreads, or array methods); validation before mutation; fail fast; at most 4 source files.

**Scale/Scope**: One module, N independent compositors, `maxLayers` fixed at creation. No UI, masks, or resampling.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS with FLAG | Pixels, weights, flags, accumulator, and output are flat typed arrays; state is a plain record with free functions and no classes. Hot loops allocate nothing. **Flag**: the layer table is a pre-sized `Array` of references to caller-owned typed arrays, since typed arrays cannot hold references; it is allocated once and mutated by index only. |
| II. Pipeline Modularity | PASS | Strict buffer contract in (layers, weights) and out (`GrayscaleImage`, accepted by `updateBuffer`). Client-side only. Grayscale single channel. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers; a benchmark asserts the time budget and bounded heap growth. |
| V. Code, Git & Governance | PASS | Strict TS (no `any`, `@ts-ignore`, or blanket casts), no semicolons, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | No plugin or factory layers, no retries or fallbacks, fail-fast `CompositorError`. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/006-compositor-core/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── compositor-core-api.md
```

### Source Code (repository root)

```text
src/core/compositor-core/
├── index.ts      # public exports
├── types.ts      # CompositorState, LayerId, LayerPixels, CompositorError + reasons
├── layers.ts     # Layer Controller: createCompositor, registerLayer, unregisterLayer, setLayerWeight, setLayerActive
└── compose.ts    # compose(state): GrayscaleImage

tests/unit/compositor-core/
├── layers.test.ts
├── compose.test.ts
└── compose.bench.ts
```

**Structure Decision**: One new module with four source files, following the layout of `src/core/grayscale-blending` and `src/core/headless-renderer`. It does not modify or depend on `grayscale-blending`, whose saturating add, subtract, and mask operations are a different contract.

## Open Flags for Human Review

1. The request says `Uint8Array` layers, but the pipeline's `GrayscaleImage` uses `Uint8ClampedArray`. Layers accept either, since reads behave identically; output is `Uint8ClampedArray`.
2. Layers are held by reference, not copied (zero-copy, per Principle I). Callers may mutate a registered layer's bytes between compositions, but must not resize or detach its buffer.
3. Weights are `>= 0` and may exceed 1. Negative (subtractive) weights are out of scope.
4. `compose` returns the same reusable `GrayscaleImage` on every call, so callers must consume or copy it before the next call. The renderer's `updateBuffer` does not retain `data`, so passing it straight through is safe.
