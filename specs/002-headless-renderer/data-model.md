# Data Model: Headless Renderer

Types below describe shape and rules only. See [contracts/headless-renderer-api.md](./contracts/headless-renderer-api.md) for function signatures.

## GrayscaleImage (existing, from `src/core/image-loader/types.ts`)

| Field | Type | Rules |
|---|---|---|
| `width` | `number` | Positive integer, `<= device.limits.maxTextureDimension2D` |
| `height` | `number` | Positive integer, `<= device.limits.maxTextureDimension2D` |
| `data` | `Uint8Array` | `data.length === width * height`, row-major, top-left origin, 8-bit intensity |

## Viewport

| Field | Type | Rules |
|---|---|---|
| `width` | `number` | Positive integer, `<= device.limits.maxTextureDimension2D` |
| `height` | `number` | Positive integer, `<= device.limits.maxTextureDimension2D` |

## RendererState (plain mutable record, one per renderer; no class)

| Field | Type | Notes |
|---|---|---|
| `device` | `GPUDevice` | Acquired once in `createRenderer` |
| `pipeline` | `GPURenderPipeline` | Built once from the internal WGSL |
| `bindGroupLayout` | `GPUBindGroupLayout` | Uniforms + sampler + image texture |
| `sampler` | `GPUSampler` | `linear` min/mag, `clamp-to-edge`, created once |
| `uniformBuffer` | `GPUBuffer` | `vec2f` viewport size (8 bytes) |
| `uniformScratch` | `Float32Array(2)` | Pre-allocated CPU copy for uploads |
| `viewport` | `Viewport` | Current size |
| `surface` | `GPUTexture` | `rgba8unorm`, viewport-sized |
| `surfaceView` | `GPUTextureView` | Cached view of `surface` |
| `readbackBuffer` | `GPUBuffer` | `MAP_READ | COPY_DST`, `alignedBytesPerRow * height` |
| `image` | `ImageState \| null` | Active image resources, `null` until the first `updateBuffer` |
| `target` | `TargetState \| null` | `null` when unbound |

### ImageState

| Field | Type | Notes |
|---|---|---|
| `width`, `height` | `number` | Dimensions of the uploaded image |
| `texture` | `GPUTexture` | `r8unorm`, `TEXTURE_BINDING | COPY_DST`, `w x h` |
| `bindGroup` | `GPUBindGroup` | Rebuilt only when `texture` is recreated |

### TargetState

| Field | Type | Notes |
|---|---|---|
| `canvas` | `HTMLCanvasElement \| OffscreenCanvas` | Caller-owned |
| `context` | `GPUCanvasContext` | Configured `rgba8unorm`, `alphaMode: 'opaque'`, `COPY_DST \| RENDER_ATTACHMENT` |

## State transitions

```text
created (no image, unbound)
  -- updateBuffer(valid) --> hasImage
  -- bindTarget(canvas) --> bound   (presents blank/current frame immediately)
hasImage / bound
  -- updateBuffer --> same state, texture reused if dimensions equal else recreated
  -- resize --> surface + readback recreated if size differs, frame re-rendered, canvas resized if bound
  -- unbindTarget --> unbound (context unconfigured)
  -- destroyRenderer --> destroyed (all GPU resources released)
any invalid call --> throws RendererError, state unchanged
```

## Validation rules (FR-012, FR-013)

1. Image: `width`/`height` positive integers; `data.length === width * height`; both dimensions `<= maxTextureDimension2D`.
2. Viewport: both dimensions positive integers, each `<= maxTextureDimension2D`.
3. All validation runs before any GPU resource or state is mutated.

## Fit placement (reference definition used by shader and test reference)

For viewport `(vw, vh)` and image `(iw, ih)`:

- `s = min(vw / iw, vh / ih)`
- displayed size `(iw * s, ih * s)`, offset `((vw - iw*s) / 2, (vh - ih*s) / 2)`
- surface pixel `(x, y)` maps to image coordinate `((x + 0.5 - ox) / s - 0.5, (y + 0.5 - oy) / s - 0.5)`; outside `[-0.5, iw - 0.5] x [-0.5, ih - 0.5]` yields the background, inside is sampled by the GPU's linear sampler with edge clamp.
- Background intensity is `16`.
