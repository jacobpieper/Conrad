# Feature Specification: Temporal Controller

**Feature Branch**: `007-temporal-controller` (working on `master`; no branch created)

**Created**: 2026-10-24

**Status**: Draft

**Input**: "Start a new feature for the temporal-controller module. It must provide a time-based evaluation system to dynamically update the weights of specific layers in the compositor-core based on an external global clock, simulating contrast wash-in/wash-out without breaking the zero-allocation architecture."

Builds on `specs/006-compositor-core`.

## User Scenarios & Testing

### User Story 1 - Weight Tracks (Priority: P1)

A developer attaches a time curve (a "track") to a registered compositor layer. The curve is a list of keyframes (time, weight) describing how that layer's weight changes, for example rising for contrast wash-in and falling for wash-out. Tracks can later be removed.

**Why this priority**: Evaluation has nothing to drive without validated tracks.

**Independent Test**: Create a controller for a compositor, add and remove tracks, and check that every invalid input throws and leaves state unchanged.

**Acceptance Scenarios**:

1. **Given** a compositor with a registered layer and a controller with capacity, **When** a track with strictly increasing keyframe times and finite weights `>= 0` is added for that layer, **Then** it returns a track id and the keyframes are stored in pre-allocated flat arrays.
2. **Given** an existing track, **When** it is removed, **Then** its slot is reusable and the id is rejected afterwards.
3. **Given** a full controller, an unregistered layer, a layer that already has a track, empty or over-long keyframes, non-increasing or non-finite times, or negative or non-finite weights, **When** adding a track, **Then** a `TemporalError` is thrown and state is unchanged.

### User Story 2 - Time Evaluation (Priority: P2)

A developer calls one function with the current time from an external clock; every track writes its interpolated weight into its compositor layer, ready for the next `compose`.

**Why this priority**: It delivers the wash-in/wash-out simulation on top of the track table.

**Independent Test**: Evaluate known keyframes at known times and compare layer weights and composed bytes with hand-computed values; repeated evaluation shows no JS heap growth.

**Acceptance Scenarios**:

1. **Given** keyframes `(0, 0)`, `(1000, 1)`, `(4000, 0.2)`, **When** evaluating at `500`, `1000`, and `2500`, **Then** the layer weight is `0.5`, `1`, and `0.6` (linear interpolation).
2. **Given** a time before the first keyframe or after the last, **Then** the weight is the first or last keyframe value (clamped, no extrapolation).
3. **Given** several tracks on different layers, **When** evaluating once, **Then** every track is updated and untracked layers are untouched.
4. **Given** the same time evaluated twice, or times that go backwards, **Then** the result depends only on the time given (stateless; scrubbing works).
5. **Given** a non-finite time, **Then** `TemporalError('invalid-time')` is thrown.
6. **Given** repeated evaluations, **Then** no JS heap growth is observed.
7. **Given** evaluation followed by `compose`, **Then** the composed output changes over time as the keyframes dictate.

### Edge Cases

- A single keyframe gives a constant weight.
- Equal time values are invalid (times must be strictly increasing).
- Unregistering a layer in the compositor without first removing its track makes the next evaluation throw `CompositorError('unknown-layer')` from the compositor; an unregistered layer's id may be reused by a different layer, so remove the track first.
- The controller never reads a clock; the caller supplies the time (for example from `requestAnimationFrame` or a simulation clock). Looping is done by the caller wrapping the time.

## Requirements

- **FR-001**: The module MUST live at `src/core/temporal-controller/`, be DOM-free and framework-agnostic, and read no clock itself.
- **FR-002**: A controller MUST be created for a `CompositorState` with `maxTracks` and `maxKeyframes` (positive integers), with all storage pre-allocated at creation as flat typed arrays.
- **FR-003**: A track MUST bind one registered compositor layer to a keyframe list; at most one track per layer.
- **FR-004**: Keyframe times MUST be finite and strictly increasing; keyframe weights MUST be finite and `>= 0`; the count MUST be between 1 and `maxKeyframes`.
- **FR-005**: `evaluate(state, timeMs)` MUST set each active track's layer weight to the piecewise-linear value at `timeMs`, clamped to the first and last keyframe outside their range.
- **FR-006**: Evaluation MUST be stateless between calls and MUST NOT allocate; keyframe inputs are copied once at `addTrack` and not retained.
- **FR-007**: Weight updates MUST go through the compositor's public `setLayerWeight` so its validation applies.
- **FR-008**: Invalid input MUST throw `TemporalError` before any mutation (except as noted for evaluation against removed layers).

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks.
- **SC-002**: Evaluating 8 tracks of 16 keyframes shows less than 100 KB of JS heap growth over repeated calls, within the benchmark's time budget.
- **SC-003**: With the compositor, evaluating at `500`, `1000`, and `4000` on a constant layer of value 100 composes to 50, 100, and 20.

## Out of Scope

Owning or reading a clock, looping and easing curves, per-track time offsets or speeds, driving `active` flags or layer pixels, physiological or pharmacokinetic models, and any UI.
