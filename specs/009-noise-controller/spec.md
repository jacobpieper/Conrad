# Feature Specification: Noise Controller

**Feature Branch**: `009-noise-controller` (working on `master`; no branch created)

**Created**: 2026-10-25

**Status**: Draft

**Input**: "Start a new feature for the noise-controller module. Phase 4 of the simulation engine. (1) Build a zero-allocation post-processing step to apply Window/Level adjustments via a pre-computed Lookup Table (LUT). (2) Integrate highly performant, pre-allocated noise maps or a fast integer PRNG to simulate dose-dependent quantum mottle. (3) This must operate on the final compositor output buffer without mutating the source layers or allocating new arrays during the hot loop."

Consumes the `GrayscaleImage` produced by `specs/006-compositor-core` and feeds `specs/002-headless-renderer`; independent of the compositor's code.

## User Scenarios & Testing

### User Story 1 - Window/Level Post-Processing (Priority: P1)

A developer sets a window (width) and level (center) once, then runs each composed frame through a pre-computed 256-entry lookup table that maps every input byte to its display byte, producing a renderer-ready image.

**Why this priority**: It is the baseline post-processing step and works on its own, without noise.

**Independent Test**: Process known byte values with known window/level settings and compare with hand-computed bytes; defaults leave the image unchanged.

**Acceptance Scenarios**:

1. **Given** a controller with default settings (window `255`, level `127.5`), **When** a frame is processed, **Then** the output equals the input byte for byte.
2. **Given** window `100` and level `100`, **When** inputs `[0, 50, 75, 100, 125, 150, 200]` are processed, **Then** the output is `[0, 0, 64, 128, 191, 255, 255]`.
3. **Given** a changed window or level, **When** `setWindowLevel` is called, **Then** the lookup table is rebuilt in place (no new arrays) and the next frame uses it.
4. **Given** a frame, **When** it is processed, **Then** the input image (the compositor output) is not modified and the result is returned in a separate, reusable `GrayscaleImage`.
5. **Given** a non-positive or non-finite window, a non-finite level, or an image whose size does not match the controller, **Then** a `NoiseError` is thrown and state is unchanged.
6. **Given** repeated processing at a constant size, **Then** no JS heap growth is observed.

### User Story 2 - Dose-Dependent Quantum Mottle (Priority: P2)

A developer sets a dose (photons represented by a full-scale pixel) and a seed; each processed frame then receives pixel-independent noise whose standard deviation follows quantum (Poisson) statistics: noisier at lower dose, and larger in absolute terms for brighter pixels.

**Why this priority**: It adds realism on top of the baseline step and is the reason for the module's name.

**Independent Test**: Process constant images with a fixed seed and check the empirical standard deviation against the formula, the dose and brightness scaling, reproducibility, and the no-noise path.

**Acceptance Scenarios**:

1. **Given** dose `Infinity` (the default), **Then** no noise is added, the random generator is not advanced, and the output is the window/level result only.
2. **Given** a constant input of `128`, dose `1000`, and a fixed seed, **When** a large frame is processed with the identity window/level, **Then** the output mean is within `0.5` of `128` and the output standard deviation is within 5% of `5.72` (the formula `sqrt(255 * 128 / 1000)` plus rounding).
3. **Given** the same input at dose `4000`, **Then** the standard deviation is about half (ratio `0.5` within 5%).
4. **Given** constant inputs of `48` and `192` at the same dose (chosen so neither clips at `0` or `255`), **Then** the standard deviation ratio is about `2` (within 5%), i.e. proportional to the square root of the signal.
5. **Given** two controllers with the same seed, **Then** they produce identical output sequences; different seeds differ; successive frames from one controller differ; `reseed` restores a sequence.
6. **Given** noise and a window/level, **Then** noise is added before windowing (detector noise first, display mapping second).
7. **Given** an invalid dose (`0`, negative, `NaN`) or seed (non-integer, negative, above `4294967295`), **Then** a `NoiseError` is thrown and state is unchanged.
8. **Given** repeated processing with noise on, **Then** no JS heap growth is observed.
9. **End to end**: `compose` output processed by the controller is accepted by the renderer's `updateBuffer`, and neither the compositor's output buffer nor any registered layer buffer is modified.

### Edge Cases

- Noisy values are rounded and clamped to `0` to `255` before the lookup table is applied.
- A very low dose (below `1`) produces noise larger than the signal range; results simply clamp.
- Passing the controller's own output buffer back in as input is allowed (the operation is per pixel), but the compositor output is the intended input.
- Processing the same compositor output twice yields different noise but never compounds the window/level, because the input is never overwritten.

## Requirements

- **FR-001**: The module MUST live at `src/core/noise-controller/`, be DOM-free and framework-agnostic, read no clock, and depend only on the `GrayscaleImage` type.
- **FR-002**: `createNoiseController(width, height, options?)` MUST pre-allocate everything: a 256-entry `Uint8ClampedArray` window/level table, a 256-entry `Float32Array` noise-sigma table, a one-element `Uint32Array` generator state, and an output `GrayscaleImage` of `width * height`.
- **FR-003**: Window/level MUST map each input byte `v` to `round-and-clamp((v - (level - window / 2)) / window * 255)`; window MUST be finite and `> 0`, level finite; defaults are window `255`, level `127.5` (identity).
- **FR-004**: `setWindowLevel` MUST rebuild the table in place and validate before mutating.
- **FR-005**: Dose MUST be a number `> 0` or `Infinity` (no noise); per-byte noise sigma MUST be `sqrt(255 * v / dose)`, tabulated at configuration time.
- **FR-006**: Noise MUST come from an integer PRNG (`mulberry32`, 32-bit state) with one draw per pixel, converted to an approximately unit-variance zero-mean sample by summing its four bytes (Irwin-Hall); no per-pixel allocation, no `Math.random`, no floating-point transcendental in the hot loop.
- **FR-007**: `processFrame(state, image)` MUST validate the image size first, then for each pixel compute `noisy = clamp(round(v + sigma[v] * z))` (or `v` when noise is off) and write `windowTable[noisy]` to the output; it MUST NOT modify `image`, MUST NOT allocate, and MUST return the reusable output image.
- **FR-008**: A seed MUST be an integer in `[0, 4294967295]`; `reseed` MUST set the generator state; the same seed MUST reproduce the same sequence; dose `Infinity` MUST NOT advance the generator.
- **FR-009**: Invalid input MUST throw `NoiseError` before any mutation.

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks; all existing tests still pass.
- **SC-002**: With a fixed seed, the empirical standard deviation matches the formula within 5% (scenarios US2/2 to US2/4), deterministically.
- **SC-003**: Processing a 512x512 frame with noise stays within the benchmark's calibrated time budget and shows less than 100 KB of JS heap growth over repeated calls.
- **SC-004**: Scenario US2/9 holds: the result is accepted by `updateBuffer` and no source buffer changes.

## Out of Scope

Spatially correlated noise or detector blur, electronic (additive) noise, exact Poisson sampling, per-pixel dose maps, inversion or non-linear (gamma, sigmoid) display curves, driving dose from a clock (the temporal controller may do so later), frame-keyed stateless noise, and any UI.
