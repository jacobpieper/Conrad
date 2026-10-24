# Feature Specification: Compositor Core

**Feature Branch**: `006-compositor-core` (working on `master`; no branch created)

**Created**: 2026-10-24

**Status**: Draft

**Input**: "Start a new feature for the `compositor-core` module, Phase 1 of the simulation engine. (1) Layer Controller: register and manage multiple static image layers (Uint8Arrays) and their baseline attenuation weights. (2) Zero-Allocation Pipeline: a composition function that loops through active layers, accumulates weighted values into a pre-allocated Float32Array, and clamps the final output into a Uint8ClampedArray ready for the `headless-renderer`."

## User Scenarios & Testing

### User Story 1 - Layer Controller (Priority: P1)

A developer registers several equally sized single-channel layers, each with a baseline attenuation weight, and later changes weights, toggles layers on or off, or removes them.

**Why this priority**: Composition has nothing to operate on without a validated layer table.

**Independent Test**: Create a compositor, register, update, deactivate, and unregister layers; invalid input throws and leaves state unchanged.

**Acceptance Scenarios**:

1. **Given** a compositor for `w x h` with capacity `n`, **When** a layer of length `w * h` is registered with weight `0.5`, **Then** it returns a layer id, the layer is active, and its weight is `0.5`.
2. **Given** a registered layer, **When** its weight is set or it is deactivated or reactivated, **Then** the table reflects the change and no other layer is affected.
3. **Given** a registered layer, **When** it is unregistered, **Then** its slot is reusable and the old id is rejected.
4. **Given** a full compositor, a wrong-length layer, or a non-finite or negative weight, **When** registering or updating, **Then** a `CompositorError` is thrown and state is unchanged.

### User Story 2 - Zero-Allocation Composition (Priority: P2)

A developer calls one function to turn the active layers into a single `GrayscaleImage` that can be passed directly to the renderer's `updateBuffer`.

**Why this priority**: It consumes the layer table and is the value of the module.

**Independent Test**: Compose known layers and weights and compare against hand-computed bytes; repeat composition shows no JS heap growth.

**Acceptance Scenarios**:

1. **Given** active layers `A` and `B` with weights `wA` and `wB`, **When** composing, **Then** `out[i] = clamp(round(wA * A[i] + wB * B[i]))`.
2. **Given** a sum above 255, **Then** the output is 255; **given** no active layers, **Then** every output byte is 0.
3. **Given** an inactive or unregistered layer, **Then** it contributes nothing.
4. **Given** repeated calls with unchanged sizes, **Then** no JS heap growth is observed and the returned `GrayscaleImage` is the same reusable object.
5. **Given** the result, **When** passed to `updateBuffer`, **Then** it is accepted as-is (`data.length === width * height`).

### Edge Cases

- Weights above 1 are legal (sums are clamped); negative weights are not.
- A layer's contents may change between calls (layers are held by reference, not copied); changes appear on the next composition.
- Layer order does not affect the result (the sum is commutative).

## Requirements

- **FR-001**: The module MUST live at `src/core/compositor-core/` and be fully DOM-free and framework-agnostic.
- **FR-002**: A compositor MUST be created for a fixed `width`, `height`, and `maxLayers`, all positive integers, with every buffer pre-allocated at creation.
- **FR-003**: Layers MUST be single-channel byte arrays (`Uint8Array` or `Uint8ClampedArray`) of exactly `width * height` bytes.
- **FR-004**: The controller MUST support register, unregister, set weight, and set active, all operating on plain state with free functions.
- **FR-005**: Weights MUST be finite and `>= 0`.
- **FR-006**: Composition MUST sum `weight * value` over active layers into a pre-allocated `Float32Array`, then write the result into a pre-allocated `Uint8ClampedArray` (native round and clamp).
- **FR-007**: Composition MUST NOT allocate in the hot path and MUST return a reusable `GrayscaleImage` accepted by `updateBuffer`.
- **FR-008**: Invalid input MUST throw `CompositorError` before any mutation.

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks.
- **SC-002**: Repeated composition of 8 layers at 512x512 shows less than 100 KB of JS heap growth over 100 iterations, and completes within the benchmark's time budget.
- **SC-003**: Output of `compose` is accepted by the renderer's `updateBuffer` and read back unchanged at a viewport of the same size.

## Out of Scope

Subtractive or masked blending (see `src/core/grayscale-blending`), per-pixel weight maps, depth-dependent attenuation, color, resampling of mismatched layers, and any UI.
