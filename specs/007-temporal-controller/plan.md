# Implementation Plan: Temporal Controller

**Branch**: `007-temporal-controller` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-temporal-controller/spec.md`

## Summary

A framework-agnostic module that drives compositor layer weights from time. A controller owns a fixed-capacity table of tracks; each track binds one compositor layer to a keyframe list stored in flat pre-allocated `Float64Array`s. `evaluate(state, timeMs)` takes the current time from the caller's clock, finds the segment containing that time for each active track with an indexed scan, interpolates linearly (clamping outside the range), and writes the result with the compositor's public `setLayerWeight`. Evaluation is stateless and allocation-free. The caller then runs `compose` and passes the result to the renderer.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: `src/core/compositor-core` (`CompositorState`, `setLayerWeight`, `CompositorError`). No external packages.

**Storage**: N/A (in-memory typed arrays)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers, no mocks; one benchmark file for time budget and heap growth, following `tests/unit/compositor-core/compose.bench.ts`.

**Target Platform**: Browser, client-side; DOM-free so it can run in a Web Worker later.

**Project Type**: Single project, core engine module at `src/core/temporal-controller/`

**Performance Goals**: 8 tracks of 16 keyframes evaluated within a budget calibrated during implementation (initial target 1 ms); no JS heap growth across repeated calls.

**Constraints**: Zero allocation in `evaluate` (plain indexed loops; no iterators, closures, spreads, or array methods); validation before mutation; fail fast; at most 4 source files; no clock reads.

**Scale/Scope**: One module, N independent controllers, `maxTracks` and `maxKeyframes` fixed at creation. No looping, easing, or UI.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Times, values, counts, and layer bindings are flat typed arrays (`Float64Array`, `Int32Array`); state is a plain record with free functions; `evaluate` allocates nothing. |
| II. Pipeline Modularity | PASS | Strict contract: keyframes and a time in, compositor weights out. Client-side only; reads no global state or clock. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers; a benchmark asserts a time budget and bounded heap growth against an allocating control. |
| V. Code, Git & Governance | PASS | Strict TS (no `any` or `@ts-ignore`), no semicolons, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | No curve framework, easing registry, or clock abstraction; piecewise-linear only, fail-fast `TemporalError`. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/007-temporal-controller/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── temporal-controller-api.md
```

### Source Code (repository root)

```text
src/core/temporal-controller/
├── index.ts      # public exports
├── types.ts      # TemporalState, TrackId, TemporalError + reasons
├── tracks.ts     # createTemporalController, addTrack, removeTrack
└── evaluate.ts   # evaluate(state, timeMs)

tests/unit/temporal-controller/
├── tracks.test.ts
├── evaluate.test.ts
├── compositor-integration.test.ts
└── evaluate.bench.ts
```

**Structure Decision**: One new module with four source files, mirroring `src/core/compositor-core`. It depends on `compositor-core` only through its public exports and state type; `compositor-core` does not change.

## Open Flags for Human Review

1. **Stale layer ids**: A track stores a layer id. If the layer is unregistered and its slot is reused by a different layer, the track would silently drive the new layer. Callers must `removeTrack` first. If the layer is merely unregistered and not reused, the next `evaluate` throws `CompositorError('unknown-layer')`, and tracks earlier in the table may already have been updated (the one documented exception to "no partial mutation").
2. **Piecewise-linear only**: Wash-in/wash-out shapes are approximated with keyframes rather than a parametric (for example gamma-variate) model. More keyframes give smoother curves. A parametric model can be added later without changing the contract.
3. **Time unit**: `timeMs` is milliseconds by convention, matching `performance.now()` and `requestAnimationFrame` timestamps; the controller treats it as an opaque number, so any unit works if keyframes use the same one.
4. **Keyframe input type**: `addTrack` takes `ArrayLike<number>` (typed arrays or plain arrays) for convenience. Inputs are copied into flat storage once at registration, outside any hot path.
5. **Compositor access**: The controller reads `compositor.layers[id]` at `addTrack` to confirm the layer is registered, since the compositor exposes its state as a plain record and has no lookup function.
