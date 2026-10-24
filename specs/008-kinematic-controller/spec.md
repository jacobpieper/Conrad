# Feature Specification: Kinematic Controller

**Feature Branch**: `008-kinematic-controller` (working on `master`; no branch created)

**Created**: 2026-10-24

**Status**: Draft

**Input**: "Start a new feature for the `kinematic-controller` module. This is Phase 3 of the simulation engine. (1) Spatial Offsets: extend `compositor-core` to store integer X/Y offsets per layer; update the `compose()` loop to shift read indices mathematically, treating out-of-bounds coordinates as 0 attenuation; no sub-pixel blending. (2) Path Evaluation: build the `kinematic-controller` to evaluate a global clock (`timeMs`) into 2D (X, Y) integer offsets for specific layers. (3) Selectable Interpolation: multiple mathematical interpolation modes for the motion tracks (for example Linear, Cubic Spline, and Parametric Sine/Respiratory). (4) Constraints: the underlying layer buffers must never be mutated or copied; stateless, strictly zero-allocation, backed by flat typed arrays, mirroring the `temporal-controller` design."

Builds on `specs/006-compositor-core` (modified, additively) and mirrors `specs/007-temporal-controller`.

## User Scenarios & Testing

### User Story 1 - Layer Spatial Offsets in the Compositor (Priority: P1)

A developer sets an integer (X, Y) offset on a registered compositor layer; `compose` then shows that layer's pixels shifted by the offset, with anything shifted outside the image contributing nothing and uncovered pixels receiving nothing from that layer.

**Why this priority**: The controller has nothing to drive until the compositor can place a layer.

**Independent Test**: Register layers with known pixels, set offsets, compose, and compare with hand-computed bytes; layers with offset `(0, 0)` compose exactly as before.

**Acceptance Scenarios**:

1. **Given** a 3x1 layer `[10, 20, 30]` at weight 1, **When** its offset is `(1, 0)`, **Then** `compose` gives `[0, 10, 20]`; at `(-1, 0)` it gives `[20, 30, 0]`.
2. **Given** a 2x2 layer `[1, 2, 3, 4]`, **When** its offset is `(1, 1)`, **Then** `compose` gives `[0, 0, 0, 1]`; at `(0, 1)` it gives `[0, 0, 1, 2]`.
3. **Given** an offset whose magnitude is at least the image width or height, **Then** the layer contributes nothing.
4. **Given** several layers with different offsets and weights, **Then** each shifted layer is weighted and summed, then clamped as before.
5. **Given** any offsets, **Then** the registered layer buffers are not modified and not copied (same object, same bytes after `compose`).
6. **Given** a new layer, or one whose slot is reused after `unregisterLayer`, **Then** its offset starts at `(0, 0)`.
7. **Given** a non-integer, non-finite, or out-of-int32-range offset, an unknown layer id, **When** setting an offset, **Then** a `CompositorError` is thrown and state is unchanged.
8. **Given** `compose` with offsets, **Then** no JS heap growth is observed.

### User Story 2 - Motion Tracks (Priority: P2)

A developer attaches a motion track to a registered layer, choosing an interpolation mode: linear or cubic keyframes of (X, Y) positions over time, or a parametric sine/respiratory waveform. Tracks can be removed.

**Why this priority**: Evaluation needs validated tracks to drive.

**Independent Test**: Create a controller, add and remove tracks of each mode, and check that every invalid input throws and leaves state unchanged.

**Acceptance Scenarios**:

1. **Given** a compositor with a registered layer, **When** a `linear` or `cubic` track with strictly increasing keyframe times and finite X and Y values is added, **Then** it returns a track id and the keyframes are copied into pre-allocated flat arrays.
2. **Given** a registered layer, **When** a `parametric` track with finite center and amplitude per axis, a positive period, a finite phase, and a positive integer exponent is added, **Then** it returns a track id and the parameters are stored in a flat array.
3. **Given** an existing track, **When** it is removed, **Then** its slot is reusable and the id is rejected afterwards.
4. **Given** a full controller, an unregistered layer, a layer that already has a motion track, an unknown mode, or invalid keyframes or parameters, **When** adding a track, **Then** a `KinematicError` is thrown and state is unchanged.

### User Story 3 - Path Evaluation (Priority: P3)

A developer calls one function with the current time from an external clock; every track writes its integer (X, Y) offset into its compositor layer, ready for the next `compose`.

**Why this priority**: It delivers the motion on top of the track table and the compositor offsets.

**Independent Test**: Evaluate known tracks at known times and compare layer offsets and composed bytes with hand-computed values; repeated evaluation shows no JS heap growth.

**Acceptance Scenarios**:

1. **Linear**: keyframes `(0, 0)`, `(1000, 10)`, `(2000, 0)` for X give `5` at `500` and `10` at `1000`.
2. **Cubic**: the same keyframes give `6` at `500` (Hermite value `6.25`, rounded), `10` at `1000`, and `6` at `1500` (symmetric).
3. **Parametric**: center `0`, amplitude `10`, period `4000`, phase `0`, exponent `1` give `10` at `0`, `0` at `1000`, `-10` at `2000`, and `10` at `4000`; exponent `2` gives `-5` at `1000`.
4. **Clamping**: `linear` and `cubic` tracks hold the first or last keyframe outside their time range; `parametric` tracks are periodic for all times, including negative.
5. **Rounding**: results are rounded to the nearest integer (ties toward positive infinity) before being applied; no sub-pixel values reach the compositor.
6. **Multiple tracks** on different layers of different modes update in one call; layers without a track keep their offsets.
7. **Statelessness**: the result depends only on the time given (repeats and backwards times work); a non-finite time throws `KinematicError('invalid-time')` before any write.
8. **Zero allocation**: repeated evaluation shows no JS heap growth.
9. **End to end**: for a 4x1 layer `[10, 20, 30, 40]`, a linear X track from `0` at `0` to `2` at `1000`, `evaluateMotion` then `compose` gives `[0, 10, 20, 30]` at `500` and `[0, 0, 10, 20]` at `1000`.

### Edge Cases

- A single keyframe gives a constant offset in all keyframe modes.
- Two keyframes make `cubic` identical to `linear`.
- The temporal controller (weights) and the kinematic controller (offsets) may both drive the same layer; they write different fields.
- Unregistering a layer without first removing its motion track makes the next evaluation throw `CompositorError('unknown-layer')`; remove the track first, since slot ids can be reused by another layer.
- The controller never reads a clock; the caller supplies the time.

## Requirements

- **FR-001**: `compositor-core` MUST store per-layer integer offsets in flat `Int32Array`s allocated at creation, expose `setLayerOffset(state, id, x, y)`, start every offset at `0`, and reset it on `unregisterLayer`.
- **FR-002**: Offsets MUST be integers within the int32 range; otherwise `CompositorError('invalid-offset')`; unknown ids give `'unknown-layer'`.
- **FR-003**: `compose` MUST read each layer at `(x - offsetX, y - offsetY)`, treat out-of-range source coordinates as contributing 0, implement this by index arithmetic only (no layer copy, no layer mutation, no allocation), and leave results for `(0, 0)` offsets identical to the previous behavior.
- **FR-004**: The module MUST live at `src/core/kinematic-controller/`, be DOM-free, read no clock, and hold all storage as flat typed arrays pre-allocated in `createKinematicController(compositor, maxTracks, maxKeyframes)`.
- **FR-005**: A motion track MUST bind one registered layer, at most one motion track per layer, with a mode of `linear`, `cubic`, or `parametric` fixed at creation.
- **FR-006**: Keyframe modes MUST validate: matching `times`, `x`, `y` lengths of `1` to `maxKeyframes`; finite, strictly increasing times; finite `x` and `y` values with magnitude at most `16_777_216`.
- **FR-007**: Parametric mode MUST validate: all parameters finite, `periodMs > 0`, `exponent` a positive integer, and `|center| + |amplitude| <= 16_777_216` per axis.
- **FR-008**: `evaluateMotion(state, timeMs)` MUST compute each track's position, round it to the nearest integer, and apply it with `setLayerOffset`; it MUST be stateless and allocation-free.
- **FR-009**: Interpolation MUST be: `linear` piecewise linear; `cubic` cubic Hermite with Catmull-Rom finite-difference tangents (one-sided at the ends); both clamped to the first and last keyframe outside the time range. `parametric` MUST be `center + amplitude * (2 * cos(pi * (t - phaseMs) / periodMs)^(2 * exponent) - 1)` per axis, periodic in `t`.
- **FR-010**: Invalid input MUST throw `KinematicError` before any mutation (except evaluation against a layer removed from the compositor).

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks; all existing compositor tests still pass unchanged.
- **SC-002**: `compose` with 8 layers at 512x512 and non-zero offsets shows less than 100 KB of JS heap growth over repeated calls and stays within the existing 10 ms budget.
- **SC-003**: Evaluating 8 tracks of mixed modes (16 keyframes) shows less than 100 KB of JS heap growth and stays within the benchmark's budget.
- **SC-004**: Scenario US3/9 produces the stated composed bytes, and layer buffers are byte-identical and the same objects afterwards.

## Out of Scope

Sub-pixel or interpolated sampling, rotation and scaling, per-pixel motion fields, looping or easing of keyframe tracks (callers wrap time), changing a track's mode in place (remove and add instead), natural (C2) cubic splines, driving weights (see the temporal controller), clock ownership, and any UI.
