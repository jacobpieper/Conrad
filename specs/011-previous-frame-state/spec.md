# Feature Specification: Previous Frame State

**Feature Branch**: `011-previous-frame-state` (working on `master`; no branch created)

**Created**: 2026-10-26

**Status**: Draft

**Input**: "Start a new feature for "previous-frame-state". (1) Extend the engine state types to include a `previousFrame` buffer (matching the native resolution and typed array format of the working pipeline). Pre-allocate this during `createEngine`. (2) Inside the `tick()` loop, immediately after the final pixel data is pushed to the renderer, perform a fast, zero-allocation copy of the current frame into the `previousFrame` buffer using `.set()`. (3) Ensure the `previousFrame` buffer is accessible to the pipeline stages in the subsequent tick to support future mathematical modules (like IIR filters or subtraction masks). (4) Keep the implementation strictly zero-allocation and within the 5ms tick budget."

Extends `specs/010-simulation-orchestrator`; adds no pixel math of its own.

## User Scenarios & Testing

### User Story 1 - Previous Output Is Retained Across Ticks (Priority: P1)

A developer ticks an engine. After each tick, the engine holds a copy of the frame that tick produced, so that during the next tick any pipeline stage can read the previous frame's final pixels.

**Why this priority**: It is the whole feature; later temporal modules (IIR filters, subtraction masks) depend on it.

**Independent Test**: Tick a small engine with known layers at known times and compare `engine.previousFrame` against the returned image and against hand-computed bytes after each tick.

**Acceptance Scenarios**:

1. **Given** a freshly created engine, **Then** `previousFrame` exists, has `width * height` bytes, and is all zero.
2. **Given** an engine, **When** `tick` returns, **Then** `previousFrame` equals the returned image's `data` byte for byte.
3. **Given** two consecutive ticks at different times, **When** the second tick starts, **Then** `previousFrame` still holds the first tick's output until the second tick's final copy; after the second tick it holds the second tick's output.
4. **Given** noise on with a window/level set, **Then** `previousFrame` holds the windowed, noisy final frame (the same bytes sent to the renderer), not the composed frame.
5. **Given** a `timeMs` that is not finite, **Then** `tick` throws `SimulationError('invalid-time')` and `previousFrame` is unchanged.
6. **Given** a later `timeMs` followed by an earlier one, **Then** after each tick `previousFrame` is the frame of the tick that just ran (it follows call order, not time order).

### User Story 2 - Readable by Later Stages (Priority: P1)

A future pipeline stage that runs inside `tick` needs the previous frame as an input buffer of the same size and format as the working frame.

**Why this priority**: The buffer is only useful if a stage can read it in the next tick without any new plumbing.

**Independent Test**: A test reads `engine.previousFrame` through the public engine state and confirms it has the same type and length as the processed image's `data`, and that its identity never changes.

**Acceptance Scenarios**:

1. **Given** an engine, **Then** `engine.previousFrame` is a `Uint8ClampedArray` of the same length as `engine.noise.output.data`.
2. **Given** repeated ticks, **Then** `engine.previousFrame` is the same instance every time and is overwritten in place.
3. **Given** a stage that runs before the final copy in a tick, **Then** it observes the previous tick's final frame (all zeros on the first tick).

### User Story 3 - No Allocation, No Budget Impact (Priority: P1)

The copy must not generate JS heap garbage or push a tick past its time budget.

**Independent Test**: The existing tick benchmark ticks a populated 512x512 engine and asserts bounded heap growth against an allocating control and a per-tick time of under 5 ms.

**Acceptance Scenarios**:

1. **Given** a populated engine with noise on, **When** `tick` is called many times, **Then** JS heap growth stays under the benchmark threshold.
2. **Given** the same benchmark engine, **Then** the mean time per tick stays under 5 ms with the copy included.

### Edge Cases

- Before the first tick, `previousFrame` is all zeros; stages must treat tick 0 as having no history.
- The buffer is a copy, never an alias of `noise.output.data`, because `processFrame` overwrites its output on every tick.
- `previousFrame` is sized to the engine's image size, not the renderer viewport.
- An engine is not resizable, so the buffer never needs reallocating.
- Nothing reads `previousFrame` yet; this feature stores it and guarantees its contents, and adds no consumer.

## Requirements

- **FR-001**: `EngineState` MUST gain a `previousFrame: Uint8ClampedArray` field, the same typed-array type as `GrayscaleImage.data`.
- **FR-002**: `createEngine` MUST allocate `previousFrame` exactly once, zero-filled, with length `width * height` (the compositor's and noise controller's pixel count), and MUST NOT reallocate or replace it afterward.
- **FR-003**: `previousFrame` MUST be allocated before the renderer so a failure never leaves a canvas resource allocated, and invalid dimensions MUST still be rejected by the existing sub-module errors, unchanged.
- **FR-004**: `tick` MUST, after `updateBuffer` and before returning, copy the processed image's `data` into `engine.previousFrame` with `TypedArray.prototype.set`.
- **FR-005**: The copy MUST allocate nothing: no subarray, slice, view, or temporary object; it forwards the two existing arrays to `.set()`.
- **FR-006**: `tick` MUST still validate `timeMs` first and mutate nothing, including `previousFrame`, when it throws.
- **FR-007**: At any point during a tick before the final copy, `engine.previousFrame` MUST hold the final frame of the previous completed tick (zeros for the first), so a stage running inside `tick` can read it.
- **FR-008**: The feature MUST NOT add a hook system, registration API, stage list, or any new consumer of `previousFrame`; stages read the buffer directly from the engine state.
- **FR-009**: `tick` MUST remain within the existing 5 ms benchmark budget for a 512x512 engine, and its returned image and `data` MUST remain the same instances on every call.

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks; all existing tests still pass.
- **SC-002**: After every tick in the tests, `previousFrame` equals the returned frame's bytes exactly, including with noise and window/level on.
- **SC-003**: The 512x512 tick benchmark (four layers, tracks on every layer, noise on) shows less than 100 KB of JS heap growth over repeated ticks and a mean tick under 5 ms.
- **SC-004**: A tick that throws on invalid time leaves `previousFrame` byte-for-byte unchanged.

## Out of Scope

Any IIR filter, subtraction mask, or other module that consumes `previousFrame`; a second history frame or ring buffer; storing the pre-noise composed frame; per-stage input/output wiring or a stage registry; buffer swapping or double buffering; resetting or clearing the history after creation; resizing an engine; worker or `SharedArrayBuffer` transfer; any UI.
