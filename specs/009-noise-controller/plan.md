# Implementation Plan: Noise Controller

**Branch**: `009-noise-controller` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-noise-controller/spec.md`

## Summary

A framework-agnostic post-processing module that sits between `compose` and the renderer. A controller owns everything it needs, allocated once: a 256-entry window/level table, a 256-entry noise-sigma table, a one-element PRNG state, and a reusable output `GrayscaleImage`. `processFrame(state, image)` reads the compositor output, optionally adds dose-dependent quantum mottle using one integer-PRNG draw per pixel, then maps each byte through the window/level table into the controller's own output buffer. The input buffer and all layers are only ever read. Reconfiguring (`setWindowLevel`, `setDose`, `reseed`) rewrites the existing tables in place.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: None. Re-uses the `GrayscaleImage` type from `src/core/image-loader`; no import of `compositor-core` code.

**Storage**: N/A (in-memory typed arrays)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers, no mocks; a fixed seed makes statistical assertions deterministic; one benchmark file following `tests/unit/compositor-core/compose.bench.ts`.

**Target Platform**: Browser, client-side; DOM-free so it can run in a Web Worker later.

**Project Type**: Single project, new core module at `src/core/noise-controller/`.

**Performance Goals**: A 512x512 frame with noise on is processed within a budget calibrated during implementation by measurement (initial target 5 ms), with no JS heap growth across repeated calls.

**Constraints**: Zero allocation in `processFrame` (plain indexed loops; no iterators, closures, spreads, array methods, or object literals); input never mutated; validation before mutation; fail fast; at most 4 source files; no clock, no `Math.random`; no transcendental math in the per-pixel loop.

**Scale/Scope**: N independent controllers, each fixed to one image size. Single-channel 8-bit only.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Tables and PRNG state are flat typed arrays (`Uint8ClampedArray`, `Float32Array`, `Uint32Array`); state is a plain record with free functions; the hot loop allocates nothing and reads the input without copying. |
| II. Pipeline Modularity | PASS | Strict buffer contract: `GrayscaleImage` in, `GrayscaleImage` out; single-channel grayscale; client-side only; decoupled from the compositor. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers; a benchmark asserts a time budget and bounded heap growth against an allocating control. |
| V. Code, Git & Governance | PASS | Strict TS (no `any` or `@ts-ignore`), no semicolons, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | One fixed noise model and one display mapping; no noise-model registry, curve framework, or plugin layer; the creation `options` bag is a plain argument, not a configuration framework; fail-fast errors. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/009-noise-controller/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── noise-controller-api.md
```

### Source Code (repository root)

```text
src/core/noise-controller/
├── index.ts        # public exports
├── types.ts        # NoiseState, NoiseOptions, NoiseError + reasons
├── controller.ts   # createNoiseController, setWindowLevel, setDose, reseed (table and state setup)
└── process.ts      # processFrame(state, image)

tests/unit/noise-controller/
├── window-level.test.ts
├── noise.test.ts
├── integration.test.ts
└── process.bench.ts
```

**Structure Decision**: One new module with four source files, mirroring the other core modules. It takes a `GrayscaleImage` rather than a compositor, so it can post-process any single-channel frame and does not couple to `compositor-core`.

## Open Flags for Human Review

1. **Separate output buffer**: `processFrame` writes to the controller's own output instead of overwriting the compositor output. This keeps the compositor buffer pristine (so reprocessing does not compound effects) at the cost of one extra buffer of `width * height` bytes.
2. **Noise model is Gaussian, not Poisson**: per-pixel sigma follows Poisson statistics (`sigma = sqrt(255 * v / dose)`), but samples are an approximately Gaussian sum of four uniform bytes (Irwin-Hall, bounded at about 3.45 sigma). This is accurate when the photon count is large (roughly above 20) and ignores Poisson skew at very low dose.
3. **Order of operations**: noise is added before window/level (detector first, display second). Noisy values are rounded to a byte before the table lookup, so there is one 8-bit quantization step between them.
4. **PRNG advances per frame**: the generator state persists across calls, so `processFrame` is not a pure function of its inputs; results are reproducible from the seed (`reseed` rewinds). A frame-keyed stateless variant (noise as a function of seed and a frame number, so scrubbing reproduces a frame) is deferred.
5. **Dose semantics**: `dose` is the number of photons represented by a full-scale (255) pixel; larger means less noise; `Infinity` disables noise and leaves the generator untouched.
6. **No spatial correlation**: noise is white per pixel; detector blur and electronic noise are out of scope.
7. **PRNG choice**: `mulberry32` (32-bit state, `Math.imul`, accepts any seed including 0) rather than xorshift32, which has a forbidden zero state and weaker low bits.
