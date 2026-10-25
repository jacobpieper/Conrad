# Feature Specification: Frame Capture

**Feature Branch**: `012-frame-capture` (working on `master`; no branch created)

**Created**: 2026-10-26

**Status**: Draft

**Input**: "Start a new feature for "frame-capture". (1) Pre-allocated "Capture Target" system: the engine configuration accepts an array of capture targets defined by `id`, `maxCapacity` (number of frames), and `mode` ('stop' or 'loop'). (2) For each target, pre-allocate a single 1D flat TypedArray sized `maxCapacity * width * height` during engine initialization. (3) Track `isRecording`, `headIndex` (current write position), and `totalFramesRecorded` for each target. (4) Inside `tick()`, iterate through active targets: compute offset `headIndex * width * height`, copy the final frame via `.set()`, increment `headIndex`; when `headIndex` equals `maxCapacity`, 'stop' sets `isRecording` to false and 'loop' resets `headIndex` to 0 (ring buffer). (5) All memory is strictly pre-allocated; dynamically resizing arrays during a run is strictly forbidden to protect the 5ms tick budget."

Extends `specs/010-simulation-orchestrator` and `specs/011-previous-frame-state`; adds no pixel math of its own.

## User Scenarios & Testing

### User Story 1 - Capture Targets Are Pre-Allocated at Engine Creation (Priority: P1)

A developer lists capture targets in the engine options. `createEngine` allocates one flat buffer per target up front, so no memory is acquired while the simulation runs.

**Why this priority**: Pre-allocation is the core architectural constraint; every other story depends on the buffers and state existing.

**Independent Test**: Create engines with zero, one, and several targets and inspect each target's buffer length, type, and initial state.

**Acceptance Scenarios**:

1. **Given** options with no `captureTargets`, **Then** the engine has an empty target list and `tick` behaves exactly as before.
2. **Given** a target `{ id: 'a', maxCapacity: 4, mode: 'stop' }` on a 3x2 engine, **Then** the engine holds a `Uint8ClampedArray` of length `4 * 3 * 2 = 24`, all zero.
3. **Given** a freshly created target, **Then** `isRecording` is `true`, `headIndex` is `0`, and `totalFramesRecorded` is `0`.
4. **Given** several targets with different capacities and modes, **Then** each has its own independent buffer and state.
5. **Given** a `maxCapacity` that is not a positive integer, an empty or duplicate `id`, or a `mode` other than `'stop'` or `'loop'`, **Then** `createEngine` throws `CaptureError` with the matching reason and allocates no renderer.
6. **Given** a target whose buffer cannot be allocated, **Then** the native `RangeError` propagates unchanged and no renderer resource is left allocated.

### User Story 2 - Stop Mode Fills Once and Halts (Priority: P1)

A developer captures the first `maxCapacity` frames of a run into a target in `'stop'` mode. Recording ends by itself when the buffer is full.

**Independent Test**: Tick a small engine with a capacity-3 stop target more than 3 times and compare the buffer to the frames that were returned.

**Acceptance Scenarios**:

1. **Given** a recording stop target, **When** `tick` returns, **Then** the returned frame's bytes are in the buffer at offset `headIndex_before * width * height`, `headIndex` increased by 1, and `totalFramesRecorded` increased by 1.
2. **Given** capacity 3, **When** the third frame is written, **Then** `headIndex` equals `3`, `totalFramesRecorded` equals `3`, and `isRecording` is `false`.
3. **Given** a stopped target, **When** further ticks run, **Then** its buffer, `headIndex`, and `totalFramesRecorded` do not change.
4. **Given** capacity 1, **Then** exactly the first tick's frame is stored and recording stops.

### User Story 3 - Loop Mode Is a Ring Buffer (Priority: P1)

A developer keeps the most recent `maxCapacity` frames of a run in `'loop'` mode, overwriting the oldest.

**Independent Test**: Tick a capacity-3 loop target five times and check that frames 4 and 5 overwrote slots 0 and 1 while slot 2 still holds frame 3.

**Acceptance Scenarios**:

1. **Given** a loop target, **When** `headIndex` reaches `maxCapacity`, **Then** it resets to `0` and `isRecording` stays `true`.
2. **Given** capacity 3 and five ticks, **Then** slot 0 holds frame 4, slot 1 holds frame 5, slot 2 holds frame 3, `headIndex` is `2`, and `totalFramesRecorded` is `5`.
3. **Given** a loop target that has wrapped, **Then** the oldest frame is at slot `headIndex` and the newest is at slot `(headIndex - 1 + maxCapacity) % maxCapacity`; before wrapping (`totalFramesRecorded < maxCapacity`) frames occupy slots `0..headIndex-1` in order.
4. **Given** capacity 1, **Then** every tick overwrites slot 0 and `headIndex` returns to `0`.

### User Story 4 - Zero Allocation Within the Tick Budget (Priority: P1)

Capture must not generate JS heap garbage, resize any array, or push a tick past 5 ms.

**Independent Test**: The tick benchmark ticks a populated 512x512 engine with a loop target and a stop target and asserts bounded heap growth against an allocating control and a per-tick time under 5 ms.

**Acceptance Scenarios**:

1. **Given** a populated 512x512 engine with noise on and capture targets recording, **When** `tick` is called many times, **Then** JS heap growth stays under the benchmark threshold.
2. **Given** the same engine, **Then** the mean time per tick stays under 5 ms with capture included.
3. **Given** any run, **Then** every target's buffer is the same instance with the same length before and after.

### User Story 5 - Targets Do Not Disturb the Pipeline (Priority: P2)

Adding capture targets changes nothing about a tick's output or error behavior.

**Acceptance Scenarios**:

1. **Given** two engines with identical options except capture targets, **Then** their returned frames are byte-identical on every tick.
2. **Given** a non-finite `timeMs`, **Then** `tick` throws `SimulationError('invalid-time')` and every target's buffer, `headIndex`, `totalFramesRecorded`, and `isRecording` are unchanged.
3. **Given** a caller sets a target's `isRecording` to `false`, **Then** `tick` skips it until it is set back to `true`, and `headIndex` and the buffer are untouched while paused.

### Edge Cases

- A buffer is a copy of the frame, never an alias of `noise.output.data`, which `processFrame` overwrites every tick.
- The captured frame is the final, post-noise, post-window/level frame: the same bytes sent to the renderer and copied into `previousFrame`.
- Capture is sized to the engine's image size, not the renderer viewport.
- In `'stop'` mode `headIndex` is left at `maxCapacity` when recording halts; it is not wrapped.
- `totalFramesRecorded` keeps counting past `maxCapacity` in `'loop'` mode; it is a count of frames written, not a slot index.
- Memory use is `maxCapacity * width * height` bytes per target, paid at creation. A target too large for the platform fails at `createEngine`, never mid-run.
- Targets start recording at creation. A stopped target has no restart or reset API in this feature.
- An engine is not resizable, so capture buffers never need reallocating.

## Requirements

- **FR-001**: `EngineOptions` MUST accept an optional `captureTargets` array of `{ id: string, maxCapacity: number, mode: 'stop' | 'loop' }`; omitted means no targets.
- **FR-002**: `createEngine` MUST validate each target: `id` is a non-empty string and unique across targets, `maxCapacity` is a positive integer, and `mode` is `'stop'` or `'loop'`; otherwise it throws `CaptureError` with reason `invalid-id`, `duplicate-id`, `invalid-capacity`, or `invalid-mode`.
- **FR-003**: `createEngine` MUST allocate, once per target, a single zero-filled flat `Uint8ClampedArray` of length `maxCapacity * width * height` (the compositor's and noise controller's pixel count), and MUST NOT resize, replace, or reallocate it afterward.
- **FR-004**: All capture memory MUST be allocated during `createEngine`, before the renderer, so a failure never leaves a canvas resource allocated. Allocation or growth of any capture array during `tick` is FORBIDDEN.
- **FR-005**: Each target MUST track `isRecording` (initially `true`), `headIndex` (initially `0`), and `totalFramesRecorded` (initially `0`), exposed on the engine state.
- **FR-006**: `tick` MUST, after the final frame is pushed to the renderer and copied into `previousFrame`, iterate the targets in order and for each target with `isRecording === true` copy the processed frame's `data` into the target buffer at element offset `headIndex * width * height` using `TypedArray.prototype.set(source, offset)`, then increment `headIndex` and `totalFramesRecorded`.
- **FR-007**: After the increment, if `headIndex === maxCapacity`: in `'stop'` mode `isRecording` MUST become `false` (leaving `headIndex` at `maxCapacity`); in `'loop'` mode `headIndex` MUST reset to `0`.
- **FR-008**: The per-tick path MUST allocate nothing: no `subarray`, `slice`, view, closure, iterator, or temporary object; the loop is an indexed `for` over the existing target array and forwards two existing arrays to `.set`.
- **FR-009**: `tick` MUST still validate `timeMs` first and mutate nothing, including capture state and buffers, when it throws.
- **FR-010**: A target with `isRecording === false` MUST be skipped without touching its buffer or counters; callers MAY toggle the field.
- **FR-011**: `tick` MUST remain within the existing 5 ms benchmark budget for a 512x512 engine, and its returned image and `data` MUST remain the same instances on every call.
- **FR-012**: The feature MUST NOT add a hook system, registration API, dynamic add/remove of targets after creation, or any consumer of the captured frames.

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks; all existing tests still pass.
- **SC-002**: After every tick in the tests, each recording target's newest slot equals the returned frame's bytes exactly, including with noise and window/level on.
- **SC-003**: Stop and loop semantics match the acceptance scenarios exactly for capacities 1, 3, and a non-trivial size over more than two full wraps.
- **SC-004**: The 512x512 tick benchmark (four layers, both track kinds, noise on, one loop and one stop target) shows less than 100 KB of JS heap growth over repeated ticks and a mean tick under 5 ms.
- **SC-005**: A tick that throws on invalid time leaves all capture state and buffers byte-for-byte unchanged.

## Out of Scope

Starting, resetting, rewinding, or clearing a target after creation; adding or removing targets at runtime; resizing or growing a buffer; reading captured frames in chronological order through a helper; exporting captured frames (video, PNG, GIF, download); capturing pre-noise or composed frames; per-target frame skipping, decimation, or cropping; timestamps per captured frame; other element types such as `Float32Array`; worker or `SharedArrayBuffer` transfer; any UI.
