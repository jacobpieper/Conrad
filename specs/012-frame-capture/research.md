# Research: Frame Capture

No `NEEDS CLARIFICATION` items remained in the Technical Context; the decisions below resolve the design choices.

## R1: Buffer type and layout

- **Decision**: One `Uint8ClampedArray` per target, length `maxCapacity * frameSize` where `frameSize = noise.pixelCount = width * height`. Frame `i` occupies elements `[i * frameSize, (i + 1) * frameSize)`.
- **Rationale**: Same type as `GrayscaleImage.data`, so `.set(frame, offset)` is a straight native copy with no per-element conversion. One flat array per target (not an array of frame arrays) is a single allocation, contiguous, and transferable later (Principle I).
- **Alternatives**: An array of `maxCapacity` separate frame arrays (many allocations, pointer chasing, harder to transfer); a `Uint8Array` (type mismatch forces per-element conversion in `.set`); `Float32Array` (4x memory, wrong format, speculative).

## R2: Where capture lives

- **Decision**: New module `src/core/frame-capture/` exporting `createCaptureTargets` and `captureFrame`; `EngineState.captureTargets: CaptureTarget[]`; `EngineOptions.captureTargets?: CaptureTargetConfig[]`.
- **Rationale**: Every prior feature is a single-purpose module (Principle II). The functions take plain data, not the engine, so they are tested with real buffers and no renderer. `tick` and `createEngine` only wire it in.
- **Alternatives**: Inline loop in `tick.ts` (grows the orchestrator and couples tests to a renderer); a stateful `Recorder` class (forbidden by Principle I); a module-level global (hidden state).

## R3: Target state representation

- **Decision**: A plain record per target: `{ id, mode, maxCapacity, buffer, isRecording, headIndex, totalFramesRecorded }`, held in an array created once.
- **Rationale**: Mirrors the existing `EngineState` style. Integer field writes on an existing object allocate nothing. `id` and `mode` are fixed after creation; only the three tracked fields change in `tick`.
- **Alternatives**: Struct-of-arrays (`Uint32Array` for heads, counts, flags; cheaper for many targets but harder to read and the typical case is 1 to 3 targets); `Map<string, ...>` keyed by id (hashing and iterator allocation in the hot path).

## R4: Iteration without allocation

- **Decision**: An indexed `for (let i = 0; i < targets.length; i++)` inside `captureFrame`, with no destructuring, closures, or `for...of`.
- **Rationale**: Guarantees no iterator object and no closure allocation regardless of engine optimization; trivially auditable against the benchmark's heap assertion.
- **Alternatives**: `for...of` over the array (usually optimized away but not guaranteed); `forEach` (allocates a closure per call).

## R5: Copy and head-advance semantics

- **Decision**: For each recording target: `buffer.set(frame, headIndex * frameSize)`; `headIndex++`; `totalFramesRecorded++`; then `if (headIndex === maxCapacity)` stop mode sets `isRecording = false` (headIndex stays at `maxCapacity`), loop mode sets `headIndex = 0`.
- **Rationale**: Exactly the requested behavior. `headIndex * frameSize` is always below `buffer.length` while recording because `headIndex < maxCapacity` at the write; `.set` cannot throw `RangeError`. Leaving `headIndex` at `maxCapacity` after a stop makes "full" observable and means `headIndex === totalFramesRecorded` for a stopped target.
- **Alternatives**: Wrapping `headIndex` in stop mode too (loses the "full" signal); modulo arithmetic on every write (needless division in the hot path; a compare-and-reset is cheaper).

## R6: Initial recording state

- **Decision**: `isRecording` starts `true`.
- **Rationale**: Requirement 5 iterates "active targets" and gives no start API; recording from the first tick is the only behavior that needs no new surface (Principle VII). Callers can set `isRecording = false` before the first tick to defer.
- **Alternatives**: Start `false` plus a `startCapture` function (new API with no stated requirement); a per-target `autoStart` option (speculative).

## R7: Validation

- **Decision**: In `createCaptureTargets`, throw `CaptureError` with reason `invalid-id` (not a non-empty string), `duplicate-id`, `invalid-capacity` (not a positive integer via `Number.isInteger(n) && n > 0`), or `invalid-mode` (not `'stop'` or `'loop'`). Allocation failures are not wrapped.
- **Rationale**: Config crosses a system boundary and mode is a runtime string; strict fail-fast per Principle VII, matching existing `SimulationError`/`NoiseError` style. The native `RangeError` for an oversized typed array is trusted and surfaces immediately.
- **Alternatives**: Clamping or defaulting bad values (silently hides mistakes); a size cap constant (arbitrary; memory limits are platform-specific); probing available memory (diagnostic heuristic, forbidden).

## R8: Creation order and failure safety

- **Decision**: In `createEngine`, build capture targets after the noise controller and `previousFrame`, and before `await createRenderer`. Use `noise.pixelCount` as `frameSize`.
- **Rationale**: Invalid dimensions are already rejected by the compositor first. Allocating before the renderer keeps the renderer the last, only resource needing teardown, so a bad target or oversized buffer never leaks a canvas.
- **Alternatives**: Allocating after the renderer (leaks the canvas on failure); lazy allocation at first tick (violates the strict pre-allocation rule and risks a mid-run stall).

## R9: Position in the tick

- **Decision**: In `tick`, call `captureFrame(engine.captureTargets, processed.data)` directly after `engine.previousFrame.set(processed.data)` and before returning.
- **Rationale**: `processed` is the final frame, so captures equal what the renderer and `previousFrame` received. The `timeMs` check still precedes every mutation, and a throw in an earlier stage leaves capture untouched.
- **Alternatives**: Capture before `updateBuffer` (same bytes, but diverges from the established final-step ordering); capture the composed pre-noise frame (needs a different source; out of scope).

## R10: Time budget and heap proof

- **Decision**: Extend the existing 512x512 `tick.bench.ts` engine with one loop target and one stop target (small capacities, e.g. 8 frames, to keep allocation in the tens of MB), keep the 5 ms mean-tick and 100 KB heap-growth assertions, and add a capture-only micro-benchmark with a tight time assertion (the same 0.1 ms ceiling used for the `previousFrame` copy, since the measured copy is about 0.004 ms). Run via `npm run test:tick-bench`.
- **Rationale**: Reuses the existing allocating-control heap method and isolated single-worker timing. Two targets exercise both modes and the wrap path inside the measured loop; the loop must run long enough to wrap the loop target several times and stop the stop target, so both branches are measured.
- **Alternatives**: A separate benchmark file (duplicates setup); asserting zero native allocation (not measurable from JS; pre-allocation is verified structurally by buffer identity and length in unit tests).
