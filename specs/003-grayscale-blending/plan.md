# Implementation Plan: Grayscale Blending

**Branch**: `003-grayscale-blending` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-grayscale-blending/spec.md`, plus planning directives: CPU-side synchronous TypeScript on flat TypedArrays (no WebGPU/WebGL/Canvas); native `Uint8ClampedArray` clamping instead of manual `Math.min/max`; zero allocation and a single-pass loop that is alias-safe; 3 to 5 files with all blend operations in one `blend.ts`; fail-fast validation at the top of each function with a single generic error.

## Summary

A framework-agnostic TypeScript module of three pure functions, `addLayers`, `subtractLayers`, and `alphaMask`, that composite same-size `GrayscaleImage` layers into one flat `Uint8ClampedArray`. Each function validates all dimensions and lengths synchronously before touching memory, then runs one pixel-major `for` loop: every pixel reads all of its inputs and then writes its output, which makes writing into an input buffer safe when the aliased input is clamped. Direct stores to the output provide native 0-255 saturation and round-to-nearest for alpha blending. A supplied output buffer is written directly with no heap allocation; an omitted output allocates one clamped pixel buffer.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 6 strict mode, ES2022 target (existing `tsconfig.json`)

**Primary Dependencies**: Re-uses `GrayscaleImage` from `src/core/image-loader`; its `data` is a `Uint8ClampedArray`, produced by `toGrayscale`. No runtime or new dev dependencies.

**Storage**: N/A. Pure functions; no retained state.

**Testing**: `vitest` exclusively (existing Browser Mode config, no changes needed). No mocks: tests use hand-written small TypedArray fixtures and assert on real output buffers.

**Target Platform**: Browser, client-side only (Chrome 120+, Firefox 125+, Safari 18+). The code uses only core ECMAScript typed arrays, so it also runs in Web Workers.

**Project Type**: Single project, core engine library module at `src/core/grayscale-blending/`

**Performance Goals**: Blend two 4096x4096 layers in under 50 ms (SC-005); no allocation that scales with image size (SC-004).

**Constraints**: Synchronous, CPU-only math on flat TypedArrays; a single pixel-major `for` loop per operation; native `Uint8ClampedArray` store for clamping (no `Math.min/max` in hot loops); all validation at the very top of each exported function; one generic error class; at most 5 source files and one file for all blend operations.

**Scale/Scope**: One module, three exported functions, N-layer add/subtract, 3-input alpha mask. No resizing, other blend modes, color, or I/O (FR-014).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: unchanged.*

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Flat TypedArray buffers, pure procedural functions, no classes for image data, no module state, and no heap allocation in supplied-output pixel loops. |
| II. Architecture & Pipeline Modularity | PASS | Strict buffer contract in (`GrayscaleImage` layers, mask) and out (flat `Uint8ClampedArray`, row-major, top-left origin, single-channel). No GPU, DOM, or Canvas. Layout is compatible with transfer or `SharedArrayBuffer` since only views are used. |
| III. UI & Interactivity Standards | PASS | No Svelte, DOM, or reactivity. |
| IV. Testing & Benchmarking | PASS | Vitest only, real buffers, no mocks. A benchmark asserts the 4096x4096 time budget and absence of size-proportional allocation. |
| V. Code, Git & Governance | PASS | Strict TS, no `any`, no semicolons, Conventional Commits (applied in `/speckit-implement`). |
| VI. Halt and Catch Fire | PASS | No principle needs to be broken. |
| VII. Scope & Simplicity | PASS | 3 source files, no strategy objects, plugins, or per-mode files; one generic error; no fallbacks or feature checks. |

### Resolved Tensions

1. **Single pass vs. layer-major accumulation.** Accumulating layer by layer (`out += layer`) would be simpler but breaks when `out` is one of the later layers (it would be overwritten before being read). The loop is therefore pixel-major: for pixel `i`, read every input at `i` into a local number, then write `out[i]` once. Same-reference aliasing works when `out` is a `Uint8ClampedArray` input. Partially overlapping, offset views of the same memory are not supported.
2. **Clamp once at the end is equivalent to clamping each step.** Add only increases and subtract only decreases the running value, so the final saturating store gives the same result as stepwise saturation; the accumulator is a plain double and is stored once.
3. **"Single generic error" vs. FR-010 "descriptive".** One `BlendError` class with no reason codes; the message states what mismatched. No error classification logic.

## Project Structure

### Documentation (this feature)

```text
specs/003-grayscale-blending/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── grayscale-blending-api.md   # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
└── core/
    ├── image-loader/                 # existing (GrayscaleImage type)
    └── grayscale-blending/
        ├── index.ts                  # Public exports (addLayers, subtractLayers, alphaMask, BlendError)
        ├── types.ts                  # BlendError; re-exports GrayscaleImage
        └── blend.ts                  # All three operations + unexported helpers (validation, accumulate)

tests/
└── unit/
    └── grayscale-blending/
        ├── blend.test.ts             # User Stories 1-3, validation, aliasing, input immutability
        └── blend.bench.ts            # SC-004 / SC-005
```

**Structure Decision**: Single project, sibling to `src/core/image-loader/`. Three source files: a thin `index.ts`, a `types.ts` holding the one error class, and `blend.ts` holding every operation. Add and subtract share one unexported `accumulate` helper parameterized by a numeric sign; there are no per-mode files, classes, or strategy objects. The clamped image-buffer contract also updates `src/core/image-loader/types.ts` and `src/core/image-loader/to-grayscale.ts`; associated tests are `tests/unit/image-loader/to-grayscale.test.ts`, `tests/unit/image-loader/to-grayscale.bench.ts`, `tests/unit/image-loader/load-image.test.ts`, `tests/unit/headless-renderer/renderer.test.ts`, and `tests/unit/headless-renderer/update-buffer.bench.ts`. No shader, Svelte, or config files are created and no existing config changes.

## Complexity Tracking

No constitution violations requiring justification.
