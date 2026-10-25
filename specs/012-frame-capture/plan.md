# Implementation Plan: Frame Capture

**Branch**: `012-frame-capture` (working on `master`) | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-frame-capture/spec.md`

## Summary

Add a pre-allocated capture system to the engine. `EngineOptions` gains an optional `captureTargets` array of `{ id, maxCapacity, mode }`. `createEngine` validates it and allocates, per target, one flat zero-filled `Uint8ClampedArray` of `maxCapacity * width * height` bytes plus a plain record tracking `isRecording`, `headIndex`, and `totalFramesRecorded`. `EngineState` gains `captureTargets: CaptureTarget[]`. At the end of `tick`, after `previousFrame.set(...)`, one call to a new free function `captureFrame(targets, frame)` loops over the targets with an indexed `for`; each recording target gets `buffer.set(frame, headIndex * frameSize)`, then `headIndex` and `totalFramesRecorded` increment, and a full buffer either stops recording (`'stop'`) or wraps `headIndex` to `0` (`'loop'`). All memory exists before the first tick; nothing is grown, sliced, or iterated with an allocating construct inside `tick`.

The logic lives in a new single-purpose module `src/core/frame-capture/` (Principle II), following the existing module layout (`index.ts`, `types.ts`, plus one file per concern). The orchestrator only wires it in.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: None new

**Storage**: N/A (in-memory typed arrays; `maxCapacity * width * height` bytes per target)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers and a real renderer, no mocks; unit tests via `npm test`; the time-sensitive `tick.bench.ts` stays excluded from the parallel pool and runs via `npm run test:tick-bench` (single worker), which is the authoritative time and heap gate (Constitution IV).

**Target Platform**: Browser, client-side (unchanged)

**Project Type**: Single project; adds `src/core/frame-capture/` and modifies `src/core/simulation-orchestrator/`

**Performance Goals**: Tick stays under the existing 5 ms budget for a 512x512 noisy engine (about 3.4 ms before this change) with a loop and a stop target recording. Each capture is a native 262,144-byte `.set`, expected near 0.004 ms (the `previousFrame` copy of the same size measured about 0.0035 ms); verified by measurement, not assumed.

**Constraints**: Zero JS allocation in `tick` (indexed `for`, no iterators, no `subarray`/`slice`/views, no closures); every buffer created once in `createEngine` and never resized or replaced; `timeMs` still validated before any mutation; capture state allocated before the renderer; no semicolons, `any`, or `@ts-ignore`; no hooks or runtime add/remove of targets.

**Scale/Scope**: `maxCapacity * width * height` bytes per target (e.g. 512x512 x 100 frames = 26 MB). Single-channel 8-bit only. Memory budgeting is the caller's responsibility; an unallocatable target fails at creation with the native `RangeError`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Each target is a flat `Uint8ClampedArray` plus a plain record of numbers; `captureFrame` is a pure procedural function over those records; no class, no per-tick allocation; plain `ArrayBuffer` backing keeps buffers transferable to a worker later. Target records are plain state objects like the existing `EngineState`, not OOP entities holding image data behavior. |
| II. Pipeline Modularity | PASS | A decoupled `frame-capture` module with a declared buffer contract (input: the final frame; output: per-target frame ring). `tick` composes it as the last sequential stage. Grayscale, client-side. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers for creation, stop, loop, pause, error paths; the existing tick benchmark gains capture targets and keeps the 5 ms and heap assertions; a capture-only micro-benchmark covers the copy loop. |
| V. Code, Git & Governance | PASS | Strict TS, no semicolons, Conventional Commits, Fish syntax, one shell command at a time with the `fnm` prefix. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. Pre-allocation satisfies the zero-allocation rule directly. |
| VII. Scope & Simplicity | PASS | One module, two functions, one error class. No registry, hooks, start/reset API, runtime add/remove, or export helpers (see spec Out of Scope). Fail-fast validation at the boundary only. |

Post-design re-check (after Phase 1): unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/012-frame-capture/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── frame-capture-api.md
```

### Source Code (repository root)

```text
src/core/frame-capture/
├── types.ts     # CaptureTargetConfig, CaptureMode, CaptureTarget, CaptureError
├── create.ts    # createCaptureTargets(frameSize, configs): validate + allocate
├── capture.ts   # captureFrame(targets, frame): per-tick copy and head advance
└── index.ts     # public exports

src/core/simulation-orchestrator/
├── types.ts     # EngineOptions.captureTargets, EngineState.captureTargets
├── engine.ts    # createEngine builds the targets before the renderer
└── tick.ts      # tick calls captureFrame after previousFrame.set

tests/unit/frame-capture/
├── create.test.ts    # validation, allocation size, initial state
└── capture.test.ts   # stop, loop, pause, capacity 1, multiple targets

tests/unit/simulation-orchestrator/
├── engine.test.ts    # engine exposes targets
├── tick.test.ts      # capture equals returned frames; error path; no output change
└── tick.bench.ts     # existing budget and heap checks with targets recording
```

**Structure Decision**: A separate module matches how every prior feature isolates a single concern and keeps `tick.ts` to one added call. `captureFrame` takes the target array and frame data rather than the engine, so it is testable without a renderer. The benchmark keeps its existing isolated config.

## Complexity Tracking

No constitution violations. Nothing to justify.

## Open Flags for Human Review

1. **Plain mutable target records**: `CaptureTarget` is a record of numbers and one typed array that `captureFrame` mutates in place. This follows the existing `EngineState` convention rather than the SoA alternative (separate `Uint32Array`s for heads/counts), chosen for readability at the 90% case; swap to SoA later only if profiling shows a cost.
2. **No start/reset API**: Targets start recording at creation; a stopped `'stop'` target stays stopped. A caller may toggle `isRecording` directly (pause/resume), but nothing resets `headIndex` or `totalFramesRecorded`. If restartable captures are needed, that is a follow-up feature.
3. **Chronological read order is the caller's job**: after a loop wrap the oldest frame is at slot `headIndex`. The contract documents the formula; no reader helper is added.
4. **Memory is the caller's responsibility**: a 512x512 target of 600 frames is about 157 MB per target. No cap is enforced; an unallocatable size throws the native `RangeError` at creation (fail fast, no sniffing).
5. **Captured frame is post-noise**: it is the same bytes as the renderer and `previousFrame`. Pre-noise capture needs another buffer and is out of scope.
6. **`id` has no lookup function**: callers find a target with `engine.captureTargets.find(...)` outside the hot path. A `getCaptureTarget` helper was judged speculative.
7. **`totalFramesRecorded` is a JS number**: integers stay exact to 2^53, far beyond any run, and stay small integers (no heap boxing) in practice.
8. **Capture runs after `previousFrame` copy**: a future stage reading targets mid-tick sees the previous tick's state; the order is documented, not enforced.
