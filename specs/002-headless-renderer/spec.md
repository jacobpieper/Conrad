# Feature Specification: Headless Renderer

**Feature Branch**: `[002-headless-renderer]`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Build a Headless Renderer module that manages image display logic entirely decoupled from the DOM. It must accept flat GrayscaleImageBuffers and manage an internal headless drawing surface. It must expose pure functions to: 1) Update the active image data, 2) Resize the internal buffers dynamically when the external viewport changes, and 3) Bind to an optional external presentation target (like an HTML canvas) to sync the visual output to the screen. The module must remain entirely framework-agnostic and focus strictly on MVP viewing requirements."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render a grayscale image into an internal surface (Priority: P1)

A developer using the engine hands the renderer a grayscale image buffer (as produced by the Image Loader) and the size of the area available for viewing. The renderer produces a fully composed, display-ready frame in its own internal surface, with no screen, page, or UI framework involved. The developer can inspect that surface directly as raw pixel data.

**Why this priority**: This is the core of the module. Everything else (resizing, presenting on screen) builds on having a correct, headless, display-ready frame. It is also fully verifiable without any browser UI.

**Independent Test**: Can be fully tested by creating a renderer with a known viewport size, setting a known small grayscale image, and asserting the internal surface's dimensions and pixel values match an expected reference frame.

**Acceptance Scenarios**:

1. **Given** a renderer with a viewport size and no image, **When** its surface is read, **Then** the surface has the viewport's dimensions and contains a uniform blank (background) frame.
2. **Given** a renderer and a valid grayscale image buffer, **When** the active image is set, **Then** the internal surface contains the image fitted inside the viewport while preserving its aspect ratio, centered, with the remaining area filled with the background.
3. **Given** a grayscale image whose dimensions exactly match the viewport, **When** the active image is set, **Then** the surface pixels are an exact, unscaled copy of the image intensities.
4. **Given** a renderer that already shows an image, **When** a different image is set, **Then** the surface fully reflects the new image with no remnants of the previous one.
5. **Given** an image buffer whose length does not equal its width multiplied by its height, **When** it is set as the active image, **Then** the system reports a descriptive failure and the previously shown image remains unchanged.

---

### User Story 2 - Resize the surface when the viewport changes (Priority: P2)

When the area available for viewing changes (for example, the user resizes a window or panel), the developer tells the renderer the new viewport size. The renderer adjusts its internal surface to match and re-fits the current image, so the displayed result stays correct at the new size.

**Why this priority**: Real viewing contexts are rarely a fixed size. Without resize, the renderer is only useful for a single static layout, but the single-size case (P1) must work first.

**Independent Test**: Can be fully tested by rendering an image at one viewport size, resizing to another, and asserting the surface dimensions and fitted image placement match the expected reference frame for the new size, including after repeated resizes.

**Acceptance Scenarios**:

1. **Given** a renderer showing an image, **When** the viewport is resized to larger dimensions, **Then** the surface has the new dimensions and the image is re-fitted (aspect preserved, centered) to the new size.
2. **Given** a renderer showing an image, **When** the viewport is resized to smaller dimensions, **Then** the surface has the new dimensions and the image is re-fitted to the new size.
3. **Given** a renderer with no image, **When** the viewport is resized, **Then** the surface has the new dimensions and contains a blank frame.
4. **Given** a resize to the same dimensions the renderer already has, **When** the resize is requested, **Then** the surface content is unchanged and no unnecessary rework occurs.
5. **Given** a viewport size that is zero, negative, or not a whole number, **When** a resize is requested, **Then** the system reports a descriptive failure and the existing surface is unchanged.

---

### User Story 3 - Present the surface on an optional external target (Priority: P3)

A developer who wants to see the result on screen binds the renderer to an external presentation target (such as an HTML canvas). Whenever the surface changes, the renderer syncs the visual output to that target. A developer who does not need on-screen output, such as in automated tests or offscreen processing, simply never binds a target and the renderer works identically.

**Why this priority**: Displaying on screen is the end goal for viewing, but it must remain optional and layered on top of the headless behavior, so it ranks after the headless core and resizing.

**Independent Test**: Can be fully tested by binding a presentation target, setting an image, and asserting the target's pixels match the renderer's surface; then unbinding and asserting further changes no longer affect the target.

**Acceptance Scenarios**:

1. **Given** a renderer with an image and no bound target, **When** the image is updated or the viewport is resized, **Then** it operates normally with no errors and no presentation attempted.
2. **Given** a renderer with an image, **When** a presentation target is bound, **Then** the target immediately displays the current surface content.
3. **Given** a renderer bound to a target, **When** the active image is updated, **Then** the target displays the updated frame.
4. **Given** a renderer bound to a target, **When** the viewport is resized, **Then** the target's size and content are updated to match the new surface.
5. **Given** a renderer bound to a target, **When** the target is unbound, **Then** later image updates and resizes no longer change the previously bound target, while the internal surface continues to update.

---

### Edge Cases

- What happens when an image is much larger than the viewport? It is scaled down to fit, preserving aspect ratio.
- What happens when an image is much smaller than the viewport? It is scaled up to fit, preserving aspect ratio, filling as much of the viewport as possible along its limiting dimension.
- What happens when the image and viewport have different aspect ratios? The unused area is filled with the background and the image is centered (letterboxed or pillarboxed).
- What happens when the image has a zero width or zero height? The system reports a descriptive failure.
- What happens when resize is called many times in rapid succession (e.g., a continuous window drag)? Each call leaves the surface in a correct, consistent state for the latest requested size.
- What happens when a new target is bound while another is already bound? The new target replaces the previous one; the previous target is no longer updated.
- What happens when a failure occurs during an image update or resize? The renderer's previous valid state (image, surface, bound target) is preserved.
- What happens when multiple independent renderers exist at the same time? Each maintains its own image, surface, and target without affecting the others.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a grayscale image buffer (width, height, and a flat, single-channel, row-major pixel buffer with top-left origin) as its image input.
- **FR-002**: System MUST maintain an internal headless drawing surface whose dimensions equal the current viewport size, independent of any DOM, window, or UI framework.
- **FR-003**: System MUST provide an operation to set or replace the active image, after which the surface reflects the new image fitted to the viewport.
- **FR-004**: System MUST fit the image to the viewport preserving aspect ratio, centered, with a uniform background filling any unused area.
- **FR-005**: System MUST produce an exact, unscaled copy of the image intensities when the image dimensions equal the viewport dimensions.
- **FR-006**: System MUST provide an operation to change the viewport size, after which the surface has the new dimensions and the current image (if any) is re-fitted.
- **FR-007**: System MUST provide an operation to bind an optional external presentation target and sync the surface's visual output to it whenever the surface content or size changes.
- **FR-008**: System MUST provide an operation to unbind the presentation target, after which the target is no longer updated.
- **FR-009**: System MUST function fully, including all image and resize operations and direct access to surface pixel data, when no presentation target is bound.
- **FR-010**: System MUST expose its operations as pure functions over explicit renderer state, with no hidden global state and no dependency on any UI framework, DOM globals, or reactive system. The only contact with a presentation target is through the explicit bind operation.
- **FR-011**: System MUST expose the surface as raw pixel data that downstream code can read without going through a presentation target.
- **FR-012**: System MUST validate inputs and report a descriptive, catchable failure for: an image whose buffer length does not equal width × height, an image with zero or negative dimensions, and a viewport size that is not a positive whole number in both dimensions.
- **FR-013**: System MUST leave the renderer's prior valid state unchanged when any operation fails.
- **FR-014**: System MUST allow multiple independent renderers to coexist without shared state.
- **FR-015**: System MUST limit its scope to static viewing of a single image: no zoom, pan, rotation, windowing/leveling, overlays, or multi-image compositing.
- **FR-016**: System MUST perform no per-pixel memory allocation during image updates or presentation; memory allocation is permitted only when the surface size changes.

### Key Entities

- **Grayscale Image Buffer**: The input image: width, height, and a flat single-channel row-major buffer of pixel intensities (as defined by the Image Loader).
- **Renderer State**: The complete state of one renderer: the current viewport size, the active image (if any), the internal surface, and the optional bound presentation target. All operations take and return/update this state explicitly.
- **Viewport Size**: The width and height, in whole pixels, of the area available for viewing; dictates the surface dimensions.
- **Surface**: The internal, headless, display-ready frame produced from the active image fitted to the viewport; readable as raw pixel data.
- **Presentation Target**: An optional external destination (e.g., an HTML canvas) that receives a copy of the surface for on-screen display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of rendering and resize test cases (image sizes smaller than, equal to, and larger than the viewport, with matching and differing aspect ratios) produce a surface whose dimensions equal the viewport and whose content matches an independently computed reference frame.
- **SC-002**: The full set of image-update and resize scenarios can be executed and verified without any page, window, or UI framework present (the module is usable in a pure non-visual test environment).
- **SC-003**: After any image update or viewport resize, a bound presentation target shows exactly the same visual content as the surface in 100% of test cases.
- **SC-004**: 100% of invalid inputs (mismatched buffer length, zero/negative image or viewport dimensions, non-integer viewport dimensions) produce a descriptive failure and leave the prior state unchanged.
- **SC-005**: Updating the active image or re-presenting at an unchanged viewport size performs no memory allocation per pixel, verified by benchmark.
- **SC-006**: For a 1920x1080 viewport, updating the active image and refreshing the surface completes in under 50 ms on consumer-grade hardware, so the viewer feels instantaneous.

## Assumptions

- Input images are the grayscale image buffers produced by the Image Loader module (8-bit, single-channel, row-major, top-left origin); other pixel formats are out of scope.
- The viewport size is supplied by the caller in whole pixels; the renderer does not observe the DOM or window itself. Detecting viewport changes is the caller's responsibility.
- The default fit mode is "contain" (entire image visible, aspect preserved, centered) over a solid dark background. Alternative fit modes (fill, crop, actual size) are out of scope for the MVP.
- Scaling uses a simple, standard resampling method that gives visually acceptable results for viewing; pixel-exact scaling fidelity is only required when the image and viewport dimensions match.
- Device pixel ratio / high-DPI handling is the caller's responsibility: the caller supplies the viewport in the physical pixel dimensions it wants rendered.
- A bound presentation target is resized by the renderer to match the surface; the target's on-screen styling and layout stay with the caller.
- Zoom, pan, rotation, windowing/leveling, annotations, overlays, and multi-image or multi-layer display are out of scope for this MVP.
- The module runs entirely client-side and has no dependency on the UI framework; the UI layer consumes the renderer, never the reverse.
- Memory may be allocated when the viewport size changes (new surface size), but not during repeated image updates at an unchanged size.
- Targets the supported browser minimums defined in the project constitution; no fallbacks for older browsers.
