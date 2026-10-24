# Implementation Plan: Simulation Orchestrator

**Branch**: `010-simulation-orchestrator` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-simulation-orchestrator/spec.md`

## Summary

A thin top-level module that owns one of each pipeline stage and runs them in order once per frame. `createEngine(options)` builds a compositor, a temporal controller, a kinematic controller, a noise controller, and a renderer, all sized from one options record, and returns them in a plain `EngineState` record. `tick(engine, timeMs)` checks the time, then calls `evaluate`, `evaluateMotion`, `compose`, `processFrame`, and `updateBuffer` in sequence and returns the processed image. It adds no pixel math and no state of its own; the zero-allocation guarantee follows from forwarding existing references to functions that already allocate nothing. Setup (layers, tracks, window/level, dose, canvas binding) uses the existing sub-module APIs directly on the engine's fields.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: None new. Imports `compositor-core`, `temporal-controller`, `kinematic-controller`, `noise-controller`, and `headless-renderer` from `src/core`.

**Storage**: N/A (in-memory typed arrays, all owned by the sub-modules)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers and a real renderer, no mocks; one benchmark file following `tests/unit/noise-controller/process.bench.ts`.

**Target Platform**: Browser, client-side. The orchestrator code itself touches no DOM; the renderer it holds uses `OffscreenCanvas`.

**Project Type**: Single project, new core module at `src/core/simulation-orchestrator/`.

**Performance Goals**: A 512x512 four-layer engine with tracks on every layer and noise on ticks within a budget calibrated during implementation by measurement (initial target 8 ms, dominated by `compose`, `processFrame`, and the renderer's `putImageData` and `drawImage`), with no JS heap growth across repeated ticks.

**Constraints**: Zero JS allocation in `tick` (no object or array literals, closures, spreads, iterators, or array methods; no result record, since it returns an existing image); `timeMs` validated before any mutation; fail fast; at most 4 source files; no clock, no `requestAnimationFrame`, no timers; sub-module errors pass through unchanged.

**Scale/Scope**: N independent engines, each fixed to one image size. Single-channel 8-bit only.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | `EngineState` is a plain record of the existing plain-record states; free functions only; `tick` owns no buffers and allocates nothing; all pixel data stays in the sub-modules' typed arrays. |
| II. Pipeline Modularity | PASS | An explicit sequential pipeline `evaluate -> evaluateMotion -> compose -> processFrame -> updateBuffer`, each stage a strict buffer contract; client-side only; grayscale only. The orchestrator is the composition layer, not a monolithic block, because it contains no processing logic. |
| III. UI Standards | PASS | No Svelte, no DOM in this module; the UI calls `tick` and `bindTarget`. |
| IV. Testing & Benchmarking | PASS | Unit and end-to-end tests with real buffers; a benchmark asserts a time budget and bounded heap growth against an allocating control. |
| V. Code, Git & Governance | PASS | Strict TS, no semicolons, no `any` or `@ts-ignore`, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. The one residual risk (native canvas work in `updateBuffer` is invisible to JS heap measurement) is flagged below, not worked around. |
| VII. Scope & Simplicity | PASS | No setup wrappers, no playback model, no event or hook system, no clock driver; options are one plain record; fail-fast errors; no re-validation of what sub-modules already validate. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/010-simulation-orchestrator/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── simulation-orchestrator-api.md
```

### Source Code (repository root)

```text
src/core/simulation-orchestrator/
├── index.ts    # public exports
├── types.ts    # EngineOptions, EngineState, SimulationError + reasons
├── engine.ts   # createEngine, destroyEngine
└── tick.ts     # tick(engine, timeMs)

tests/unit/simulation-orchestrator/
├── engine.test.ts
├── tick.test.ts
├── integration.test.ts
└── tick.bench.ts
```

**Structure Decision**: One new module with four source files, mirroring the other core modules. `tick` is in its own file because it is the hot path and the only function that must stay allocation-free; `engine.ts` holds the one-time setup.

## Open Flags for Human Review

1. **Native canvas allocation is not measured**: `updateBuffer` runs `putImageData` and `drawImage` every tick. They allocate nothing on the JS heap (the renderer reuses its `ImageData` and staging canvas), which is what the benchmark can assert, but the browser may allocate natively inside them. The zero-allocation claim is therefore "zero JS heap allocation in the orchestrator and the controllers". Resolving the native side would need a different output path (WebGPU or a transferable buffer handed to a worker) and is out of scope.
2. **Renderer is created inside the engine, and asynchronously**: `createRenderer` returns a promise, so `createEngine` is async. The alternative (caller passes an existing renderer in) keeps creation synchronous but contradicts the requirement that the engine initializes and holds all five modules. Recommended as specified.
3. **Setup APIs are not wrapped**: the caller reaches into `engine.compositor` and the others to register layers and tracks. This keeps the module tiny and avoids a second copy of each signature, at the cost of exposing the sub-state to mutation. A bad direct mutation of the engine's fields (for example swapping `engine.noise`) is unsupported.
4. **Frames are not reproducible by time alone when noise is on**: the noise generator advances every tick (inherited from the noise controller's design), so scrubbing back to a time gives different noise. A frame-keyed stateless noise function is deferred.
5. **Controllers share one capacity**: `maxTracks` (default `maxLayers`, since each layer has at most one track per controller) and `maxKeyframes` (default `16`) apply to both the temporal and kinematic controllers. The defaults are arbitrary 90%-case values, not derived from a requirement.
6. **Time is validated once, up front**: the temporal and kinematic controllers each validate time too, but the orchestrator checks first so a bad time cannot leave the temporal weights updated and the offsets stale. The duplicate check is one `Number.isFinite` per tick.
7. **No `destroyEngine` guard on later ticks**: ticking a destroyed engine is not detected (fail-fast on misuse that cannot happen in normal flow is not added).
