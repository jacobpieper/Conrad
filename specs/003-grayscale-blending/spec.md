# Feature Specification: Grayscale Blending

**Feature Branch**: `[003-grayscale-blending]`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Build a Grayscale Blending module that composites multiple flat GrayscaleImageBuffers into a single output buffer. It must support the core blending operations required for radiographic simulation (e.g., addition, subtraction, and alpha-masking). The module must expose pure functions that accept the input buffers and return the composited flat buffer, acting as an isolated, high-performance data pipeline."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add and subtract layers (Priority: P1)

A developer building a radiographic simulation has several grayscale layers of identical size (for example, a base exposure and one or more material layers). They ask the module to combine them by adding their intensities, or to subtract one layer from another, and receive a single grayscale buffer of the same size containing the combined result. Intensities that would fall outside the valid range are limited to the minimum or maximum valid value rather than wrapping around.

**Why this priority**: Addition and subtraction are the foundational operations for accumulating and removing radiographic signal. They are fully useful on their own and are the minimum viable blending capability.

**Independent Test**: Can be fully tested by blending small hand-written buffers with known values and asserting the output equals independently computed expected values, including values that overflow or underflow the valid range.

**Acceptance Scenarios**:

1. **Given** two grayscale buffers of the same dimensions, **When** they are added, **Then** each output pixel equals the sum of the corresponding input pixels, limited to the maximum valid intensity.
2. **Given** two grayscale buffers of the same dimensions, **When** the second is subtracted from the first, **Then** each output pixel equals the first minus the second, limited to the minimum valid intensity (never wrapping).
3. **Given** three or more grayscale buffers of the same dimensions, **When** they are added, **Then** each output pixel equals the sum of all corresponding input pixels, limited to the maximum valid intensity.
4. **Given** a single input buffer, **When** it is blended with any operation, **Then** the output is an exact copy of that buffer's intensities.
5. **Given** any blend, **When** it completes, **Then** none of the input buffers have been modified.

---

### User Story 2 - Composite with an alpha mask (Priority: P2)

A developer wants to overlay one grayscale layer onto another, controlled per pixel by a mask. The mask determines, for every pixel, how much of the overlay layer shows versus the underlying layer: fully transparent leaves the underlying pixel untouched, fully opaque replaces it with the overlay pixel, and values in between blend proportionally. This lets the developer confine an effect (such as a dense object or an implant) to a specific region.

**Why this priority**: Masked compositing is required to place materials in regions rather than across the whole image, but it builds on having the basic same-size layer handling from P1.

**Independent Test**: Can be fully tested by compositing two known buffers with a known mask containing fully transparent, fully opaque, and partial values, and asserting each output pixel matches the expected proportional blend.

**Acceptance Scenarios**:

1. **Given** a base layer, an overlay layer, and a mask of the same dimensions, **When** they are composited, **Then** each output pixel equals the base where the mask is fully transparent and the overlay where the mask is fully opaque.
2. **Given** a mask with intermediate values, **When** compositing, **Then** each output pixel is the proportional blend of base and overlay according to the mask value at that pixel.
3. **Given** a mask that is entirely transparent, **When** compositing, **Then** the output equals the base layer.
4. **Given** a mask that is entirely opaque, **When** compositing, **Then** the output equals the overlay layer.
5. **Given** a mask, base, or overlay whose dimensions differ from the others, **When** compositing is requested, **Then** the system reports a descriptive failure.

---

### User Story 3 - Blend into a reusable output buffer (Priority: P3)

A developer running the simulation repeatedly (for example, on every frame as parameters change) wants to blend layers without the module creating new memory each time. They supply an existing output buffer for the result and the module fills it. When they do not supply one, the module provides a new buffer containing the result.

**Why this priority**: Repeated high-speed blending is the main performance goal, but correct results (P1, P2) must exist before optimizing how output memory is managed.

**Independent Test**: Can be fully tested by blending repeatedly into a supplied output buffer and asserting the result is written into that same buffer with correct values, and by benchmarking repeated blends to confirm no memory is allocated per call.

**Acceptance Scenarios**:

1. **Given** a supplied output buffer of matching dimensions, **When** a blend runs, **Then** the result is written into that buffer, and that same buffer is returned.
2. **Given** no supplied output buffer, **When** a blend runs, **Then** a new buffer of matching dimensions containing the result is returned.
3. **Given** a supplied output buffer whose dimensions do not match the inputs, **When** a blend runs, **Then** the system reports a descriptive failure and the output buffer is left unchanged.
4. **Given** an output buffer that is also one of the input buffers, **When** a blend runs, **Then** the result is still correct for every pixel.
5. **Given** repeated blends of the same size into a supplied output buffer, **When** measured, **Then** no memory that scales with the image size is allocated per call.

---

### Edge Cases

- What happens when no input buffers are provided? The system reports a descriptive failure.
- What happens when input buffers have differing widths or heights? The system reports a descriptive failure naming the mismatch; no output is produced.
- What happens when a buffer's length does not equal its width multiplied by its height? The system reports a descriptive failure.
- What happens when a buffer has zero or negative dimensions? The system reports a descriptive failure.
- What happens when summed intensities exceed the maximum valid value, or a subtraction goes below the minimum? The result is limited to the valid range; it never wraps around.
- What happens when subtraction involves more than two layers? Layers after the first are each subtracted from the first, in order.
- What happens when the output buffer is also an input? Every pixel still reflects the original input values at that pixel.
- What happens when a failure occurs? No partial result is returned and any supplied output buffer is left unchanged.
- What happens with very large buffers? Results remain correct and are produced within the performance budget.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept grayscale image buffers (width, height, and a flat, single-channel, row-major pixel buffer with top-left origin) as inputs, as defined by the Image Loader.
- **FR-002**: System MUST provide an addition operation that combines two or more same-size layers by summing corresponding pixel intensities, limited to the valid intensity range.
- **FR-003**: System MUST provide a subtraction operation that subtracts each subsequent layer from the first layer pixel by pixel, limited to the valid intensity range.
- **FR-004**: System MUST provide an alpha-mask operation that composites an overlay layer onto a base layer using a same-size mask, where mask value determines the proportion of overlay versus base at each pixel (fully transparent shows the base, fully opaque shows the overlay).
- **FR-005**: System MUST limit all results to the valid intensity range and MUST NOT allow values to wrap around.
- **FR-006**: System MUST produce an output buffer with the same dimensions as the inputs, in the same flat single-channel row-major format.
- **FR-007**: System MUST NOT modify any input buffer.
- **FR-008**: System MUST allow the caller to optionally supply an existing output buffer, in which case the result is written into it and that buffer is returned; otherwise a new output buffer is returned.
- **FR-009**: System MUST produce correct results when the supplied output buffer is also one of the input buffers.
- **FR-010**: System MUST validate inputs and report a descriptive, catchable failure for: no input buffers, differing dimensions among inputs or mask, a buffer length not equal to width × height, zero or negative dimensions, and a supplied output buffer of non-matching size.
- **FR-011**: System MUST leave any supplied output buffer unchanged when validation fails.
- **FR-012**: System MUST expose all operations as pure functions over explicit inputs, with no hidden global state, no dependency on any UI framework, DOM, or reactive system, and no retained state between calls.
- **FR-013**: System MUST NOT allocate any memory that scales with the image size (no per-pixel or pixel-buffer-sized allocation) during blending when the caller supplies an output buffer; only a fixed, tiny bookkeeping cost per call is permitted.
- **FR-014**: System MUST limit its scope to combining same-size grayscale layers with addition, subtraction, and alpha-mask compositing: no resizing or aligning of mismatched layers, no other blend modes, no color channels, and no image loading or display.

### Key Entities

- **Grayscale Image Buffer**: A layer: width, height, and a flat single-channel row-major buffer of pixel intensities (as defined by the Image Loader).
- **Mask**: A same-size single-channel layer whose per-pixel values express how opaque the overlay is at that pixel, from fully transparent to fully opaque.
- **Blend Operation**: The rule used to combine layers: addition, subtraction, or alpha-mask compositing.
- **Output Buffer**: The single grayscale buffer holding the composited result, either supplied by the caller for reuse or newly created.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of addition, subtraction, and alpha-mask test cases (including overflow, underflow, fully transparent, fully opaque, and partial mask values) produce output matching independently computed expected values pixel for pixel.
- **SC-002**: 100% of invalid inputs (no layers, mismatched dimensions, wrong buffer length, zero/negative dimensions, wrong-size output buffer) produce a descriptive failure, with no partial result and no change to any supplied output buffer.
- **SC-003**: Input buffers are byte-for-byte identical before and after every blend in 100% of test cases.
- **SC-004**: Repeated blends of the same size into a supplied output buffer allocate no memory that scales with the image size, verified by benchmark.
- **SC-005**: Blending two 4096x4096 layers completes in under 50 ms on consumer-grade hardware, so simulation updates feel instantaneous.
- **SC-006**: The full set of blending scenarios can be executed and verified without any page, window, or UI framework present.

## Assumptions

- Input layers are the grayscale image buffers produced by the Image Loader (8-bit, single-channel, row-major, top-left origin); other pixel formats are out of scope.
- The valid intensity range is 0 (minimum) to 255 (maximum); results outside it are limited to those bounds.
- Mask values use the same 0-255 range, with 0 fully transparent and 255 fully opaque; the mask is supplied as a same-size grayscale buffer.
- Alpha-mask compositing results are rounded to the nearest whole intensity.
- Callers are responsible for ensuring layers are the same size; this module does not resize, crop, or align layers.
- Ordering for subtraction is the order the layers are supplied: the first layer is the minuend and all later layers are subtracted from it.
- Only the three named operations are in scope for the MVP; other blend modes (multiply, screen, min/max, etc.) can be added later.
- The module runs entirely client-side and has no dependency on the UI framework; the UI layer and other modules consume it, never the reverse.
- Targets the supported browser minimums defined in the project constitution; no fallbacks for older browsers.
