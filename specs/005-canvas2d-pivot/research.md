# Research: Canvas 2D Pivot

## R1: Fastest way to push raw bytes to a 2D canvas

- **Decision**: Pre-allocated RGBA `ImageData` + `putImageData` to a staging `OffscreenCanvas`, then `drawImage(staging, ...)` to the surface.
- **Rationale**: `putImageData` is the only synchronous raw-byte upload. `createImageBitmap(imageData)` is async and allocates per call. `putImageData` ignores transform, smoothing, and compositing, so scaled contain-fit needs the `drawImage` second step; the staging canvas is the GPU-friendly source for it.
- **Alternatives**: `createImageBitmap` (async, allocates); direct `putImageData` to the surface (only valid at 1:1, no letterbox scaling; not worth a second path under Principle VII); `fillRect` per pixel (orders of magnitude slower).

## R2: Single-channel to RGBA expansion

- **Decision**: Write through a `Uint32Array` view over the `ImageData` buffer: `0xFF000000 | v * 0x010101`.
- **Rationale**: One store per pixel, no allocation. Little-endian is the only platform class in the supported browser floor.
- **Alternatives**: Four byte writes per pixel (slower, same result).

## R3: Surface, target, and readback

- **Decision**: Keep an internal viewport-sized `OffscreenCanvas` surface. Target presentation is a 1:1 `drawImage` of the surface; `readSurface` calls `getImageData` on the surface and copies into `out`.
- **Rationale**: Preserves headless readback and N-independent-renderers guarantees. Alpha is always 255, so premultiplication loses nothing and readback is exact.
- **Alternatives**: Draw straight to the target (breaks headless `readSurface`); `ImageBitmapRenderingContext` (consumes the bitmap, awkward for repeated frames).

## R4: Fit and smoothing

- **Decision**: Fill background `rgb(16,16,16)`, compute contain scale/offset as before, set `imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'` at render time, and `drawImage(staging, dx, dy, dw, dh)`.
- **Rationale**: At 1:1 (equal size) output is byte-exact, matching existing exact-copy tests. Scaled output is browser-defined bilinear, so non-1:1 tests keep a tolerance (previously +/-1) and `reference.ts` may need a wider tolerance, to be measured during implementation.
- **Alternatives**: Custom CPU resampler (violates simplicity, slower).

## R5: Loader downscaling

- **Decision**: `scale = min(1, maxWidth / w, maxHeight / h)`; target `tw = max(1, floor(w * scale))`, `th = max(1, floor(h * scale))`. Canvas is created at `tw x th`; `drawImage(bitmap, 0, 0, tw, th)` with `imageSmoothingQuality = 'high'`; `getImageData` on the already-small canvas.
- **Rationale**: `floor` guarantees both dimensions stay within bounds. Reading back only the reduced pixels meets FR-006. No upscaling.
- **Alternatives**: `createImageBitmap` `resizeWidth/resizeHeight` (not the Canvas extraction step requested; quality options vary by browser).
- **Known limit**: Large reduction ratios (e.g. 4000 -> 128) can alias with single-pass bilinear. Accepted for the MVP; multi-step halving is deferred.

## R6: Options validation

- **Decision**: `maxWidth`/`maxHeight` must be positive integers, otherwise throw `ImageLoadError('invalid-options')` before fetch/decode.
- **Rationale**: Fail fast (Principle VII); a zero or fractional bound would otherwise yield a 0-sized canvas.

## R7: Test harness

- **Decision**: Remove the WebGPU Chromium flags and `@webgpu/types`; keep `--enable-precise-memory-info` for heap benchmarks.
- **Rationale**: The reason for the pivot is that these flags do not work on Linux/Wayland.
