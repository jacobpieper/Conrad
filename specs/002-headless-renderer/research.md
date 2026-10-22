# Research: Headless Renderer

All Technical Context items are resolved; there are no open NEEDS CLARIFICATION entries.

## R1. Surface format and presentation path

- **Decision**: Offscreen surface is an `rgba8unorm` 2D texture (`RENDER_ATTACHMENT | COPY_SRC`). The canvas is configured with `format: 'rgba8unorm'`, `usage: RENDER_ATTACHMENT | COPY_DST`, `alphaMode: 'opaque'`, and presented with `copyTextureToTexture(surface, canvasTexture)`.
- **Rationale**: `rgba8unorm` is a valid canvas format on all platforms, so the copy is format-identical and bit-exact (SC-003 and FR-005). One render pass serves both headless and presented output, and unbound renderers pay nothing for presentation.
- **Alternatives considered**: Use `navigator.gpu.getPreferredCanvasFormat()` and a second blit pass (extra pipeline, extra pass, no benefit for an 8-bit gray image). Render directly into the canvas texture (breaks headless operation, FR-009).

## R2. Image storage on the GPU

- **Decision**: A storage buffer (`STORAGE | COPY_DST`) holding the grayscale bytes packed four per `u32` (WGSL has no `u8`). Size is `ceil(width*height / 4) * 4` bytes, recreated only when that size changes.
- **Rationale**: Matches the directive ("write the flat TypedArray to a GPU buffer"), and the flat row-major `Uint8Array` is uploaded unchanged, preserving the zero-copy buffer contract.
- **Alternatives considered**: `r8unorm` texture + `writeTexture` (simpler and gives hardware filtering, but contradicts the explicit buffer directive).

## R3. Uploading without allocation or mapping

- **Decision**: `queue.writeBuffer`. `writeBuffer` requires a byte size multiple of 4, so the 4-aligned prefix is written directly from the caller's array (no copy) and the 1-3 trailing bytes go through a pre-allocated 4-byte scratch array.
- **Rationale**: No staging copy of the full image, no per-update allocation, and no mapping on the hot path. Mapping happens only in `readSurface`.
- **Alternatives considered**: Persistently mapped staging buffers (extra state, async lifecycle, no gain for this size). Copy into a padded array each update (copy cost proportional to image size).

## R4. Fit and resampling

- **Decision**: Contain fit computed in the fragment shader from a small uniform block (`viewportW, viewportH, imageW, imageH`). Scale `s = min(vw/iw, vh/ih)`; the image is centered; pixels outside the image rectangle get the background (`16/255` gray). Bilinear sampling at texel centers (four packed-buffer loads, clamped to image edges).
- **Rationale**: Bilinear at texel centers is identity at scale 1 with matching dimensions, giving the exact copy required by FR-005, and it is visually acceptable for up/down-scaling (Assumptions). Uniform scalars live in a pre-allocated `Uint32Array` and are written with `writeBuffer` only on image or size changes.
- **Alternatives considered**: Nearest neighbor (aliasing when downscaling large images). Mipmaps/area filtering (beyond MVP).

## R5. Fullscreen draw

- **Decision**: One pipeline, a vertex shader that generates a fullscreen triangle from `vertex_index` (no vertex buffer), `draw(3)` per render.
- **Rationale**: Minimal resources and no geometry state.

## R6. Resize handling

- **Decision**: `resize(state, width, height)` validates, then (if the size differs) destroys and recreates the surface texture and readback buffer, rewrites the uniforms, and re-renders. A bound canvas gets `canvas.width/height` set to match; its context stays configured. Same-size calls return immediately (spec acceptance scenario 4).
- **Rationale**: Allocation is confined to size changes (FR-016). The caller owns the `ResizeObserver`; this module never observes the DOM.
- **Alternatives considered**: Over-allocate surface and render a sub-rect (speculative, complicates readback and presentation).

## R7. Readback

- **Decision**: `readSurface(state, out)` records `copyTextureToBuffer` into a persistent `MAP_READ` buffer (rows padded to 256-byte multiples as WebGPU requires), awaits `mapAsync`, copies unpadded rows into the caller's `Uint8Array(width*height*4)`, then unmaps.
- **Rationale**: Makes the headless surface testable and consumable without a canvas (FR-011). The caller supplies `out` so the module allocates nothing per call.

## R8. Error handling

- **Decision**: Synchronous input validation throws `RendererError` before any state mutation: image length vs `width*height`, non-positive/non-integer image or viewport dimensions, viewport over `limits.maxTextureDimension2D`, image bytes over `limits.maxStorageBufferBindingSize`. Adapter or device acquisition returning `null`/rejecting is thrown from `createRenderer` with the native result as `cause`. No retries, no capability sniffing. Device loss is not recovered in the MVP (fail fast).
- **Rationale**: Constitution VII (fail fast, trust native results) and FR-012/FR-013.

## R9. Browser support vs. constitution floor

- **Finding**: WebGPU shipped by default in Chrome 113+, but not in Firefox 125 or Safari 18 (it arrived in later releases). The pinned floor in Constitution VII and the WebGPU mandate in II therefore conflict for those two browsers.
- **Decision**: Implement WebGPU only, fail fast when `navigator.gpu` or the adapter is unavailable, and flag the conflict for a human constitution amendment (see plan Complexity Tracking). No fallback is built.

## R10. Test environment

- **Decision**: Keep Vitest Browser Mode on Playwright Chromium. Extend `launchOptions.args` with flags that enable WebGPU in headless mode (`--enable-unsafe-webgpu` and a software adapter such as `--use-webgpu-adapter=swiftshader` / `--use-angle=swiftshader`). The exact flag set is confirmed by the first implementation task and recorded in the quickstart.
- **Presented-canvas verification**: Use an `OffscreenCanvas`, then `transferToImageBitmap()` and draw into a 2D canvas to read pixels, comparing against `readSurface` output. This verifies the real presentation path without mocks.
- **Types**: `@webgpu/types` added as a dev dependency and listed in `tsconfig.json` `types`.

## R11. Zero-copy / worker readiness (Principle I)

- **Finding**: `GPUDevice` and canvas contexts cannot be transferred, but inputs are plain `Uint8Array`s (transferable) and `OffscreenCanvas` is accepted by `bindTarget`, so the renderer can run entirely inside a worker. No design change needed.
