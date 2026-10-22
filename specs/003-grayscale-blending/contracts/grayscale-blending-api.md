# Contract: Grayscale Blending API

Public exports of `src/core/grayscale-blending/index.ts`. All functions are pure and synchronous. Types are described in [../data-model.md](../data-model.md).

```ts
import type { GrayscaleImage } from '../image-loader'

class BlendError extends Error {}

addLayers(layers: readonly GrayscaleImage[], out?: Uint8ClampedArray): Uint8ClampedArray
subtractLayers(layers: readonly GrayscaleImage[], out?: Uint8ClampedArray): Uint8ClampedArray
alphaMask(
  base: GrayscaleImage,
  overlay: GrayscaleImage,
  mask: GrayscaleImage,
  out?: Uint8ClampedArray
): Uint8ClampedArray
```

## Behavior

### Common
- Validation runs first, synchronously, before any write. Any failure throws a single `BlendError` with a message naming the failure; `out` and all inputs are left untouched.
- Returns the flat result buffer, `width * height` bytes, row-major, top-left origin: the supplied `out` (same reference) or a newly created `Uint8ClampedArray`.
- Never modifies any input `data`.
- Results are saturated to 0-255 (no wrap-around) by native `Uint8ClampedArray` stores; supplied outputs must be `Uint8ClampedArray`.
- `out` may be the same reference as any input's `data`; the result is still correct for every pixel. Partially overlapping offset views of the same memory are unsupported.
- With `out` supplied, the function writes directly to its memory and performs no heap allocation.
- No hidden state; no dependency on DOM, UI frameworks, Canvas, or GPU.

### `addLayers(layers, out?)`
- `out[i] = sat(sum of layers[k].data[i])`. One layer returns an exact copy. Throws if `layers` is empty.

### `subtractLayers(layers, out?)`
- `out[i] = sat(layers[0].data[i] - layers[1].data[i] - ...)`, in array order. One layer returns an exact copy. Throws if `layers` is empty.

### `alphaMask(base, overlay, mask, out?)`
- `out[i] = sat(base + (overlay - base) * mask / 255)`. Mask `0` yields base, `255` yields overlay, values between blend proportionally, rounded to nearest (native rule: ties to even).

## Errors

| Condition | Result |
|---|---|
| Empty `layers` | `BlendError` |
| Any layer or mask with non-positive / non-integer dimensions | `BlendError` |
| Dimensions differ between layers or mask | `BlendError` |
| `data.length !== width * height` | `BlendError` |
| `out.length !== width * height` | `BlendError` |
