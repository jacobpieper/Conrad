# Feature Specification: Image Loader

**Feature Branch**: `[001-image-loader]`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Build an Image Loader module that loads standard web images (PNG, JPEG, WebP) from a URL or Blob and extracts them into a flat, single-channel grayscale buffer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load an image from a URL into a grayscale buffer (Priority: P1)

A developer using the engine provides the URL of a PNG, JPEG, or WebP image and receives back the image's dimensions and a flat, single-channel grayscale buffer representing its pixel data, ready to feed into downstream processing pipelines (e.g., convolution, raycasting input).

**Why this priority**: This is the primary entry point for bringing any external image asset into the engine. Without it, no other pipeline stage that depends on image data can be exercised.

**Independent Test**: Can be fully tested by calling the loader with a known test image URL and asserting the returned buffer length, dimensions, and spot-checked pixel values match an expected reference grayscale conversion.

**Acceptance Scenarios**:

1. **Given** a valid URL pointing to a PNG image, **When** the image is loaded, **Then** the system returns the image width, height, and a single-channel grayscale buffer of length `width * height`.
2. **Given** a valid URL pointing to a JPEG image, **When** the image is loaded, **Then** the system returns a correctly sized and populated grayscale buffer.
3. **Given** a valid URL pointing to a WebP image, **When** the image is loaded, **Then** the system returns a correctly sized and populated grayscale buffer.
4. **Given** a URL that returns a 404 or network error, **When** the image load is attempted, **Then** the system reports a descriptive failure instead of returning a partial or empty buffer.

---

### User Story 2 - Load an image from an in-memory Blob into a grayscale buffer (Priority: P2)

A developer has an image already available in memory (e.g., from a file picker, drag-and-drop, or a fetched byte stream) as a Blob, and extracts it into the same flat single-channel grayscale buffer format as the URL path, without needing a network round-trip.

**Why this priority**: Enables local file workflows (e.g., user-provided reference images) that don't originate from a remote URL, reusing the same downstream buffer contract.

**Independent Test**: Can be fully tested by constructing a Blob from known image bytes in a test, passing it to the loader, and asserting the output buffer matches the same reference conversion used for the URL path.

**Acceptance Scenarios**:

1. **Given** a Blob containing valid PNG image bytes, **When** the image is loaded, **Then** the system returns the image width, height, and a single-channel grayscale buffer.
2. **Given** a Blob containing valid JPEG or WebP image bytes, **When** the image is loaded, **Then** the system returns a correctly sized and populated grayscale buffer.
3. **Given** an empty or zero-byte Blob, **When** the image is loaded, **Then** the system reports a descriptive failure rather than returning a buffer.

---

### User Story 3 - Reject invalid or unsupported image input (Priority: P3)

A developer passes a URL or Blob that is not a valid, supported image (e.g., corrupted bytes, unsupported format, or non-image file), and the system fails predictably with a clear, descriptive error instead of crashing, hanging, or silently returning incorrect data.

**Why this priority**: Protects the rest of the pipeline from malformed input and gives developers actionable feedback, but is only meaningful once the primary load paths (P1, P2) exist.

**Independent Test**: Can be fully tested by feeding known-bad inputs (corrupted bytes, unsupported format, non-image content) to the loader and asserting a descriptive error is produced for each case.

**Acceptance Scenarios**:

1. **Given** a Blob or URL containing corrupted image bytes, **When** the image load is attempted, **Then** the system reports a descriptive failure.
2. **Given** a Blob or URL containing a file of an unsupported image format, **When** the image load is attempted, **Then** the system reports the same generic image decoding failure used for corrupted image data, without attempting to distinguish the cause.
3. **Given** a Blob or URL containing non-image content (e.g., a text file), **When** the image load is attempted, **Then** the system reports a descriptive failure rather than returning a buffer.

---

### Edge Cases

- What happens when the source image has transparency (alpha channel)? The system flattens the image to opaque grayscale, ignoring alpha (see Assumptions).
- What happens when a URL is blocked by cross-origin restrictions, preventing pixel-level access? The system reports a descriptive failure.
- What happens when the image is animated (e.g., animated WebP)? The system extracts only the first/default frame.
- How does the system handle an extremely large image that may exceed available memory? The system reports a descriptive failure rather than crashing or corrupting memory.
- What happens when the same loader is used to load multiple images concurrently? Each load completes or fails independently without interfering with others.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load an image given a URL (including same-origin, cross-origin with proper access permissions, and data URIs).
- **FR-002**: System MUST load an image given an in-memory Blob or File object.
- **FR-003**: System MUST support decoding PNG, JPEG, and WebP image formats.
- **FR-004**: System MUST convert decoded image pixel data into a single-channel grayscale representation using a standard luminance conversion.
- **FR-005**: System MUST output the grayscale data as a flat, row-major buffer (origin top-left) whose length equals the image's width multiplied by its height.
- **FR-006**: System MUST report the decoded image's width and height alongside the grayscale buffer.
- **FR-007**: System MUST flatten any alpha/transparency channel present in the source image, treating the image as fully opaque in the grayscale output.
- **FR-008**: System MUST report a descriptive, catchable failure (not a silent empty result or crash) when the source is unreachable, corrupted, empty, or not a supported image format.
- **FR-009**: System MUST extract only the first/default frame when given an animated image.
- **FR-010**: System MUST allow multiple independent load operations to be issued without one failing load affecting the outcome of another.

### Key Entities

- **Image Source**: The input to a load operation — either a URL (string) or a Blob/File — along with its implied or declared format (PNG, JPEG, WebP).
- **Grayscale Image Buffer**: The output of a successful load — image width, image height, and a flat single-channel buffer of pixel intensity values, one entry per pixel, in row-major order.
- **Load Failure**: The result of an unsuccessful load — a descriptive reason (e.g., network error, unsupported format, corrupt data, decode failure).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can load a typical 1920x1080 web image (PNG, JPEG, or WebP) from a URL or Blob and receive a grayscale buffer in under 1 second on a typical broadband connection and consumer-grade hardware.
- **SC-002**: 100% of valid test images across all three supported formats (PNG, JPEG, WebP) produce a grayscale buffer whose length exactly equals width × height.
- **SC-003**: 100% of invalid, corrupted, or unsupported test inputs produce a descriptive failure rather than a crash, hang, or silently incorrect buffer.
- **SC-004**: Grayscale pixel values produced from a known reference image match an independently computed reference grayscale conversion within a 1% per-pixel tolerance.

## Assumptions

- Alpha/transparency channels are flattened away; the source image is treated as fully opaque when computing grayscale values.
- A standard, industry-recognized luminance weighting (e.g., ITU-R BT.601 or BT.709 style) is an acceptable default for RGB-to-grayscale conversion.
- Grayscale output uses 8-bit precision (0–255) per pixel, consistent with typical web image bit depth.
- Cross-origin URLs are subject to the browser's existing CORS security model; the loader cannot bypass CORS restrictions, and a blocked cross-origin load is treated as a failure.
- Animated image formats only need their first/default frame extracted; full frame-by-frame animation decoding is out of scope. This is a guarantee of the browser's native decoder, so it has no dedicated test.
- This module runs entirely client-side within the browser, consistent with the engine's client-side execution requirement.
- Image resizing, cropping, or other pre-processing beyond grayscale flattening is out of scope for this module.
