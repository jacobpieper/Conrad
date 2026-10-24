# Data Model: Canvas 2D Pivot

Unchanged from 002/001: `GrayscaleImage` (`width`, `height`, `data: Uint8ClampedArray`, `data.length === width * height`) and `Viewport`.

## RendererState (plain record, no class)

| Field | Type | Notes |
|---|---|---|
| `viewport` | `Viewport` | Current size |
| `surface` | `OffscreenCanvas` | Viewport-sized; resized in place |
| `surfaceContext` | `OffscreenCanvasRenderingContext2D` | Acquired once at create |
| `image` | `ImageState \| null` | `null` until first `updateBuffer` |
| `target` | `TargetState \| null` | `null` when unbound |

### ImageState

| Field | Type | Notes |
|---|---|---|
| `width`, `height` | `number` | Uploaded image size |
| `staging` | `OffscreenCanvas` | Image-sized |
| `stagingContext` | `OffscreenCanvasRenderingContext2D` | |
| `pixels` | `ImageData` | Pre-allocated RGBA, alpha fixed at 255 |
| `pixels32` | `Uint32Array` | View over `pixels.data.buffer` |

Reallocated only when image dimensions change.

### TargetState

| Field | Type | Notes |
|---|---|---|
| `canvas` | `HTMLCanvasElement \| OffscreenCanvas` | Caller-owned |
| `context` | `CanvasRenderingContext2D \| OffscreenCanvasRenderingContext2D` | From `getContext('2d', { alpha: false })` |

## Errors

`RendererErrorReason`: `'canvas-unavailable' | 'invalid-image' | 'invalid-viewport' | 'invalid-output'`.

## Validation rules

1. Image: positive integer `width`/`height`; `data.length === width * height`.
2. Viewport: positive integers. The device texture limit check is dropped; a failed `getContext` is surfaced as `canvas-unavailable`.
3. All validation precedes mutation; failures leave state intact.

## Loader types

```ts
type LoadImageOptions = { maxWidth?: number; maxHeight?: number } // each defaults to 128, positive integer
```

`ImageLoadErrorReason` gains `'invalid-options'`.

## State transitions

Same as 002, minus GPU wording: `unbindTarget` only drops the reference; `destroyRenderer` sets canvas sizes to 0 and clears `image`/`target`.
