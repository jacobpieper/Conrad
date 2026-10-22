# Research: Headless Renderer

All Technical Context items are resolved; there are no open NEEDS CLARIFICATION entries.

## R1. Surface format and presentation path

- **Decision**: Offscreen surface is an `rgba8unorm` 2D texture (`RENDER_ATTACHMENT | COPY_SRC`). The canvas is configured with `format: 'rgba8unorm'`, `usage: RENDER_ATTACHMENT | COPY_DST`, `alphaMode: 'opaque'`, and presented with `copyTextureToTexture(surface, canvasTexture)`.
- **Rationale**: `rgba8unorm` is a valid canvas format on all platforms, so the copy is format-identical and bit-exact (SC-003 and FR-005). One render pass serves both headless and presented output, and unbound renderers pay nothing for presentation.
- **Alternatives considered**: Use `navigator.gpu.getPreferredCanvasFormat()` and a second blit pass (extra pipeline, extra pass, no benefit for an 8-bit gray image). Render directly into the canvas texture (breaks headless operation, FR-009).

## R2. Image storage on the GPU

- **Decision**: A 2D `r8unorm` texture (`TEXTURE_BINDING | COPY_DST`) of exactly the image's width x height, plus one `linear`/`clamp-to-edge` sampler created at renderer setup. The texture is recreated only when the image dimensions change.
- **Rationale**: One byte per pixel maps directly onto the flat `Uint8Array`, with no byte packing, padding, or WGSL `u8` workaround. `r8unorm` is filterable, so the GPU's native bilinear sampler does the resampling.
- **Alternatives considered**: Storage buffer with manual `u32` packing and hand-written bilinear (rejected by directive: padding overhead, extra shader code, no hardware filtering).

## R3. Uploading without allocation or mapping

- **Decision**: `queue.writeTexture(dest, data, { bytesPerRow: width, rowsPerImage: height }, { width, height })`. `writeTexture` does not require the 256-byte row alignment that buffer-to-texture copies do, so the caller's array is uploaded directly.
- **Rationale**: No staging copy, no tail handling, no per-update allocation, and no mapping on the hot path. Mapping happens only in `readSurface`.
- **Alternatives considered**: Persistently mapped staging buffers plus `copyBufferToTexture` (256-byte row padding, async lifecycle, no gain).

## R4. Fit and resampling

- **Decision**: Contain fit computed in the fragment shader. The viewport size comes from a small uniform (`vec2f`); the image size comes from `textureDimensions` on the image texture. Scale `s = min(vw/iw, vh/ih)`; the image is centered; pixels outside the image rectangle get the background (`16/255` gray). Inside, the shader calls `textureSampleLevel(image, sampler, uv, 0)` with the linear sampler, where `uv` is the surface pixel center mapped into the image's normalized coordinates.
- **Rationale**: At scale 1 with matching dimensions, pixel centers land exactly on texel centers, so bilinear is the identity and gives the exact copy required by FR-005. It is visually acceptable for up/down-scaling (Assumptions). `textureSampleLevel` avoids uniform-control-flow restrictions around the in/out-of-image branch. The uniform scalars live in a pre-allocated `Float32Array(2)` and are written with `writeBuffer` only on viewport changes.
- **Alternatives considered**: Nearest neighbor sampler (aliasing when downscaling large images). Mipmaps/area filtering (beyond MVP).

## R5. Fullscreen draw

- **Decision**: One pipeline, a vertex shader that generates a fullscreen triangle from `vertex_index` (no vertex buffer), `draw(3)` per render.
- **Rationale**: Minimal resources and no geometry state.

## R5b. Module layout

- **Decision**: Four source files: `index.ts` (exports), `types.ts` (state and error types), `shader.ts` (WGSL string), `renderer.ts` (all operations plus unexported helpers).
- **Rationale**: One module with one responsibility does not need a file per function (Constitution VII).
- **Alternatives considered**: One file per operation plus resource/validation/render helpers (12 files, rejected as bloat).

## R6. Resize handling

- **Decision**: `resize(state, width, height)` validates, then (if the size differs) destroys and recreates the surface texture and readback buffer, rewrites the uniforms, and re-renders. A bound canvas gets `canvas.width/height` set to match; its context stays configured. Same-size calls return immediately (spec acceptance scenario 4).
- **Rationale**: Allocation is confined to size changes (FR-016). The caller owns the `ResizeObserver`; this module never observes the DOM.
- **Alternatives considered**: Over-allocate surface and render a sub-rect (speculative, complicates readback and presentation).

## R7. Readback

- **Decision**: `readSurface(state, out)` records `copyTextureToBuffer` into a persistent `MAP_READ` buffer (rows padded to 256-byte multiples as WebGPU requires), awaits `mapAsync`, copies unpadded rows into the caller's `Uint8Array(width*height*4)`, then unmaps.
- **Rationale**: Makes the headless surface testable and consumable without a canvas (FR-011). The caller supplies `out` so the module allocates nothing per call.

## R8. Error handling

- **Decision**: Synchronous input validation throws `RendererError` before any state mutation: image length vs `width*height`, non-positive/non-integer image or viewport dimensions, viewport over `limits.maxTextureDimension2D`, image width or height over `limits.maxTextureDimension2D`. Adapter or device acquisition returning `null`/rejecting is thrown from `createRenderer` with the native result as `cause`. No retries, no capability sniffing. Device loss is not recovered in the MVP (fail fast).
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
