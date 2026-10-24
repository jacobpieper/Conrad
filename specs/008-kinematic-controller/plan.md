# Implementation Plan: Kinematic Controller

**Branch**: `008-kinematic-controller` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-kinematic-controller/spec.md`

## Summary

Two coordinated changes. (1) `compositor-core` gains per-layer integer offsets: two `Int32Array`s (`offsetsX`, `offsetsY`) sized `maxLayers`, a `setLayerOffset` function, and a `compose` loop that, for each active layer, walks output rows, computes the valid source column range from the offset, and accumulates `weight * pixels[srcIndex]` only where the shifted source lies inside the image. Out-of-range pixels are simply skipped (0 attenuation), and layer buffers are only read. (2) A new `src/core/kinematic-controller` module, mirroring `temporal-controller`: a fixed-capacity track table in flat typed arrays, where each track binds one layer to a motion defined by one of three modes (`linear` keyframes, `cubic` Hermite keyframes, or a `parametric` sine/respiratory waveform). `evaluateMotion(state, timeMs)` evaluates every track statelessly, rounds to integers, and writes offsets with the compositor's public `setLayerOffset`.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: `src/core/compositor-core` (extended; `CompositorState`, `setLayerOffset`, `CompositorError`). No external packages.

**Storage**: N/A (in-memory typed arrays)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers, no mocks; benchmarks following `tests/unit/compositor-core/compose.bench.ts` and `tests/unit/temporal-controller/evaluate.bench.ts`.

**Target Platform**: Browser, client-side; DOM-free so it can run in a Web Worker later.

**Project Type**: Single project; one modified core module (`compositor-core`) and one new one (`kinematic-controller`).

**Performance Goals**: `compose` at 512x512 with 8 non-zero-offset layers stays within the existing 10 ms budget with no heap growth; `evaluateMotion` for 8 mixed-mode tracks of 16 keyframes is calibrated during implementation by measuring a batch (initial target 0.05 ms per call).

**Constraints**: Zero allocation in `compose` and `evaluateMotion` (plain indexed loops; no iterators, closures, spreads, or array methods); layer buffers never mutated or copied; validation before mutation; fail fast; at most 4 source files in the new module; no clock reads; `(0, 0)` offsets behave exactly as before.

**Scale/Scope**: N independent controllers, `maxTracks` and `maxKeyframes` fixed at creation. Integer offsets only. No rotation, scaling, sub-pixel sampling, looping, or UI.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Offsets, track layers, modes, keyframes, and parameters are flat typed arrays (`Int32Array`, `Uint8Array`, `Float64Array`); state is plain records with free functions; hot loops allocate nothing; the shift is index arithmetic, so layers are neither copied nor mutated. |
| II. Pipeline Modularity | PASS | Strict buffer contracts (keyframes or parameters and a time in, integer offsets out; layers and offsets in, `GrayscaleImage` out). Coordinates are a top-left-origin 2D grid with row-major indexing, as the constitution requires. Client-side only. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers; benchmarks for both hot paths assert time budgets and bounded heap growth against an allocating control. |
| V. Code, Git & Governance | PASS | Strict TS (no `any` or `@ts-ignore`), no semicolons, Conventional Commits. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | Three fixed modes in one `switch`, no easing registry or plugin layer; integer offsets only; fail-fast errors. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/008-kinematic-controller/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── compositor-offsets-api.md
    └── kinematic-controller-api.md
```

### Source Code (repository root)

```text
src/core/compositor-core/          # modified, additive
├── types.ts      # + offsetsX, offsetsY on CompositorState; + 'invalid-offset' reason
├── layers.ts     # + setLayerOffset; offsets allocated in createCompositor; reset in unregisterLayer
├── compose.ts    # row-wise shifted accumulation
└── index.ts      # + export setLayerOffset

src/core/kinematic-controller/     # new
├── index.ts      # public exports
├── types.ts      # KinematicState, MotionTrack input, TrackId, KinematicError + reasons
├── tracks.ts     # createKinematicController, addMotionTrack, removeMotionTrack
└── evaluate.ts   # evaluateMotion(state, timeMs)

tests/unit/compositor-core/
├── offsets.test.ts          # new
└── compose.bench.ts         # extended with an offset case

tests/unit/kinematic-controller/
├── tracks.test.ts
├── evaluate.test.ts
├── compositor-integration.test.ts
└── evaluate.bench.ts
```

**Structure Decision**: Extend `compositor-core` in place (offsets are compositor state) and add a sibling controller module with the same four-file layout as `temporal-controller`. The controller depends only on public exports of `compositor-core`. Function names carry a `Motion` qualifier (`addMotionTrack`, `removeMotionTrack`, `evaluateMotion`) so both controllers can be imported together without aliasing.

## Open Flags for Human Review

1. **Compositor change**: `compositor-core` (feature 006) is modified. The change is additive: new state fields default to `0` and existing calls behave identically; one new error reason `'invalid-offset'` is added. The 006 contract and data model need a short "extended" note.
2. **Offset sign**: positive X moves layer content right and positive Y moves it down (output `(x, y)` reads source `(x - offsetX, y - offsetY)`).
3. **"Cubic spline"** is implemented as a cubic Hermite spline with Catmull-Rom finite-difference tangents (C1, local, no precomputation). A natural cubic spline (C2) needs a tridiagonal solve at registration and scratch storage; it is deferred.
4. **Parametric mode covers both "sine" and "respiratory"**: with `exponent = 1` it is an exact sinusoid; larger exponents give a Lujan-style `cos^(2n)` breathing shape with a longer end-expiration plateau. Amplitude is a half-range around the center.
5. **Mode is fixed at track creation**; to change mode, remove the track and add a new one.
6. **Rounding**: `Math.round` (nearest, ties toward positive infinity) after interpolation; cubic overshoot is allowed.
7. **Magnitude limit**: keyframe values and `|center| + |amplitude|` are capped at `16_777_216` so rounded results, including cubic overshoot, stay far inside the int32 range and `evaluateMotion` cannot trip `'invalid-offset'` for a valid track.
8. **Stale layer ids**: as in the temporal controller, a track stores a layer id; remove the track before unregistering its layer.
9. **Compose performance**: the row-wise shifted loop replaces the flat loop. If the existing 10 ms budget is at risk, add a zero-offset flat fast path as a follow-up.
