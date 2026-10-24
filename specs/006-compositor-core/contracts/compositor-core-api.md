# Contract: Compositor Core API

> **Extended by 008**: per-layer integer offsets, `setLayerOffset`, and the `'invalid-offset'` error reason are added by [008-kinematic-controller](../../008-kinematic-controller/contracts/compositor-offsets-api.md); `compose` shifts layer reads by those offsets.

Public exports of `src/core/compositor-core/index.ts`. Every function takes the state explicitly; there is no module-level state. Types are defined in [../data-model.md](../data-model.md).

```ts
import type { GrayscaleImage } from '../image-loader'

type LayerPixels = Uint8Array | Uint8ClampedArray
type LayerId = number

type CompositorErrorReason =
  | 'invalid-dimensions' // createCompositor arguments
  | 'invalid-layer'      // pixel length mismatch
  | 'invalid-weight'     // non-finite or negative
  | 'capacity-exceeded'  // no free slot
  | 'unknown-layer'      // id out of range or slot free

class CompositorError extends Error {
  readonly reason: CompositorErrorReason
}

type CompositorState // plain record, see data model

createCompositor(width: number, height: number, maxLayers: number): CompositorState
registerLayer(state: CompositorState, pixels: LayerPixels, weight: number): LayerId
unregisterLayer(state: CompositorState, id: LayerId): void
setLayerWeight(state: CompositorState, id: LayerId, weight: number): void
setLayerActive(state: CompositorState, id: LayerId, active: boolean): void

compose(state: CompositorState): GrayscaleImage
```

## Behavior

### `createCompositor`
Validates, then allocates the layer table, weights, flags, accumulator, and output once. All later calls reuse them.

### `registerLayer`
Validates, stores `pixels` **by reference** in the lowest free slot, sets its weight, marks it active, and returns the slot index. The caller may mutate the bytes afterwards (effective on the next `compose`) but must not resize or detach the buffer.

### `unregisterLayer`
Frees the slot and drops the reference. The id is invalid afterwards until the slot is reused, so callers must not retain stale ids.

### `setLayerWeight` / `setLayerActive`
Update one slot only. Inactive layers are skipped by `compose`.

### `compose`
Computes `out[i] = clamp(round(sum(weight * layer[i])))` over active layers and returns `state.output`.
- Allocates nothing; the returned object and its `data` are the same instances on every call and are overwritten by the next call.
- Zero active layers yields all zeros.
- Result is accepted directly by `updateBuffer(rendererState, image)`.

## Guarantees

- Failed calls never partially mutate state.
- Independent compositors share nothing.
- No DOM access, no globals, no async work.

## Explicitly not provided

Per-pixel masks or weight maps, negative weights, depth or thickness-based attenuation, layer reordering or blend modes, resampling of mismatched sizes, and any Svelte or UI code.
