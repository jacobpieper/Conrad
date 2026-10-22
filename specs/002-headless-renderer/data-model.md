# Data Model: Headless Renderer

Types below describe shape and rules only. See [contracts/headless-renderer-api.md](./contracts/headless-renderer-api.md) for function signatures.

## GrayscaleImage (existing, from `src/core/image-loader/types.ts`)

| Field | Type | Rules |
|---|---|---|
| `width` | `number` | Positive integer; total padded bytes limited by `maxStorageBufferBindingSize` |
| `height` | `number` | Positive integer |
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
| `bindGroupLayout` | `GPUBindGroupLayout` | Uniforms + image storage buffer |
| `uniformBuffer` | `GPUBuffer` | 4 x `u32`: viewport w/h, image w/h (16 bytes) |
| `uniformScratch` | `Uint32Array(4)` | Pre-allocated CPU copy for uploads |
| `tailScratch` | `Uint8Array(4)` | Pre-allocated for the unaligned image tail |
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
| `buffer` | `GPUBuffer` | `STORAGE | COPY_DST`, `ceil(w*h/4)*4` bytes |
| `bindGroup` | `GPUBindGroup` | Rebuilt only when `buffer` is recreated |

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
  -- updateBuffer --> same state, buffer reused if size equal else recreated
  -- resize --> surface + readback recreated if size differs, frame re-rendered, canvas resized if bound
  -- unbindTarget --> unbound (context unconfigured)
  -- destroyRenderer --> destroyed (all GPU resources released)
any invalid call --> throws RendererError, state unchanged
```

## Validation rules (FR-012, FR-013)

1. Image: `width`/`height` positive integers; `data.length === width * height`; `width*height` bytes (padded) `<= maxStorageBufferBindingSize`.
2. Viewport: both dimensions positive integers, each `<= maxTextureDimension2D`.
3. All validation runs before any GPU resource or state is mutated.

## Fit placement (reference definition used by shader and test reference)

For viewport `(vw, vh)` and image `(iw, ih)`:

- `s = min(vw / iw, vh / ih)`
- displayed size `(iw * s, ih * s)`, offset `((vw - iw*s) / 2, (vh - ih*s) / 2)`
- surface pixel `(x, y)` maps to image coordinate `((x + 0.5 - ox) / s - 0.5, (y + 0.5 - oy) / s - 0.5)`; outside `[-0.5, iw - 0.5] x [-0.5, ih - 0.5]` yields the background, inside is bilinear with edge clamp.
- Background intensity is `16`.
