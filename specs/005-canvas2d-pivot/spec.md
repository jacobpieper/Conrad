# Feature Specification: Canvas 2D Pivot

**Feature Branch**: `005-canvas2d-pivot` (working on `master`; no branch created)

**Input**: "We are officially pivoting the architecture away from WebGPU to Canvas 2D due to browser compatibility constraints on Linux/Wayland. (1) Refactor `src/core/headless-renderer` to Canvas 2D, keeping `createRenderer`, `bindTarget`, `updateBuffer` contracts, using the most performant Canvas 2D method for raw `Uint8ClampedArray` pixels. (2) `src/core/image-loader` accepts an optional max-dimension config (default 128x128) and downscales oversized images, preserving aspect ratio, during Canvas extraction."

Supersedes the WebGPU mechanism of `specs/002-headless-renderer`; extends `specs/001-image-loader`.

## Requirements

- **FR-001**: Headless renderer MUST render with Canvas 2D only; no WebGPU API, shader, or `@webgpu/types` remains.
- **FR-002**: `createRenderer`, `destroyRenderer`, `bindTarget`, `unbindTarget`, `updateBuffer`, `resize`, `readSurface` MUST keep their signatures and behavior (contain-fit, centered, background `16`, RGBA8 readback).
- **FR-003**: Raw pixel upload MUST use `putImageData` from a pre-allocated `ImageData`; no per-update allocation at constant image size.
- **FR-004**: Image loader MUST accept an optional `{ maxWidth, maxHeight }`, each defaulting to 128.
- **FR-005**: If the decoded image exceeds either bound, the loader MUST scale by `min(maxWidth / w, maxHeight / h)`, preserve aspect ratio, and never upscale.
- **FR-006**: Downscaling MUST occur in the Canvas extraction step (decoded bitmap is drawn at target size); full-size pixels are never read back.
- **FR-007**: Invalid options (non-positive or non-integer bounds) MUST throw `ImageLoadError('invalid-options')` before any fetch or decode.

## Success Criteria

- **SC-001**: Renderer and loader test suites pass in headless Chromium with no WebGPU launch flags.
- **SC-002**: A 4000x3000 input with defaults yields 128x96 output; a 64x32 input is returned unchanged.
- **SC-003**: `updateBuffer` at constant size shows no JS heap growth across repeated calls.
