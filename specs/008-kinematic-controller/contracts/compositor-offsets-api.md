# Contract: Compositor Offsets (extension of compositor-core)

Additive extension of [006 contract](../../006-compositor-core/contracts/compositor-core-api.md). Existing signatures and behavior are unchanged when every offset is `(0, 0)`.

```ts
type CompositorErrorReason =
  | 'invalid-dimensions'
  | 'invalid-layer'
  | 'invalid-weight'
  | 'capacity-exceeded'
  | 'unknown-layer'
  | 'invalid-offset' // new: x or y is not an integer within the int32 range

setLayerOffset(state: CompositorState, id: LayerId, x: number, y: number): void
```

`CompositorState` gains `offsetsX: Int32Array` and `offsetsY: Int32Array` (see [data-model.md](../data-model.md)).

## Behavior

### `setLayerOffset`
Sets the integer offset of one occupied layer slot. Throws `CompositorError('unknown-layer')` for an out-of-range, non-integer, or free id, and `CompositorError('invalid-offset')` unless both `x` and `y` are integers in `[-2147483648, 2147483647]`. A failed call changes nothing.

### `registerLayer` / `unregisterLayer`
A newly registered layer starts at `(0, 0)`. `unregisterLayer` resets the slot's offset to `(0, 0)`.

### `compose`
For each active layer the output pixel `(x, y)` receives `weight * layer[(y - offsetY) * width + (x - offsetX)]` when the source coordinate `(x - offsetX, y - offsetY)` lies inside the image, and nothing otherwise (0 attenuation). Everything else is as before: accumulate in the `Float32Array`, then round and clamp into the output.

- Positive `offsetX` moves content right; positive `offsetY` moves it down.
- Offsets whose magnitude is at least the image width or height make the layer contribute nothing.
- Layer buffers are only read: never mutated, never copied. `compose` still allocates nothing and returns the same reusable `GrayscaleImage`.
- There is no sub-pixel sampling or blending.

## Worked examples (weight 1)

| Layer (w x h) | Offset | Output |
|---|---|---|
| `[10, 20, 30]` (3x1) | `(1, 0)` | `[0, 10, 20]` |
| `[10, 20, 30]` (3x1) | `(-1, 0)` | `[20, 30, 0]` |
| `[1, 2, 3, 4]` (2x2) | `(1, 1)` | `[0, 0, 0, 1]` |
| `[1, 2, 3, 4]` (2x2) | `(0, 1)` | `[0, 0, 1, 2]` |
| `[1, 2, 3, 4]` (2x2) | `(2, 0)` or `(0, -2)` | `[0, 0, 0, 0]` |

## Guarantees

- Failed calls never partially mutate state; independent compositors share nothing.
- No DOM access, no globals, no async work.

## Explicitly not provided

Sub-pixel offsets, wrap-around or edge-clamp addressing, rotation or scaling, and per-pixel displacement.
