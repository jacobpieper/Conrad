# Data Model: Compositor Core

> **Extended by 008**: `CompositorState` gains `offsetsX` and `offsetsY` (`Int32Array`, length `maxLayers`); see [008-kinematic-controller](../008-kinematic-controller/data-model.md).

Contract signatures are in [contracts/compositor-core-api.md](./contracts/compositor-core-api.md).

## Types

| Type | Definition |
|---|---|
| `LayerPixels` | `Uint8Array \| Uint8ClampedArray`, row-major, single channel, length `width * height` |
| `LayerId` | `number`, an integer slot index in `[0, maxLayers)` |
| `GrayscaleImage` | Existing, from `src/core/image-loader` |

## CompositorState (plain mutable record, no class)

| Field | Type | Notes |
|---|---|---|
| `width`, `height` | `number` | Positive integers, fixed at creation |
| `pixelCount` | `number` | `width * height` |
| `maxLayers` | `number` | Positive integer, fixed at creation |
| `layers` | `(LayerPixels \| null)[]` | Length `maxLayers`, filled with `null`; a slot is free iff `null` |
| `weights` | `Float32Array` | Length `maxLayers`; each finite and `>= 0` |
| `active` | `Uint8Array` | Length `maxLayers`; `1` when the slot is occupied and enabled, otherwise `0` |
| `accumulator` | `Float32Array` | Length `pixelCount`; reused scratch for the weighted sum |
| `output` | `GrayscaleImage` | `{ width, height, data: Uint8ClampedArray(pixelCount) }`; returned by `compose` |

## Validation rules

1. `createCompositor`: `width`, `height`, `maxLayers` are positive integers, otherwise `'invalid-dimensions'`.
2. `registerLayer`: `pixels.length === width * height`, otherwise `'invalid-layer'`; weight finite and `>= 0`, otherwise `'invalid-weight'`; at least one free slot, otherwise `'capacity-exceeded'`.
3. `unregisterLayer`, `setLayerWeight`, `setLayerActive`: `id` must be an integer in range and its slot occupied, otherwise `'unknown-layer'`; weights follow rule 2.
4. All checks run before any mutation; a failed call leaves state untouched.

## State transitions

```text
slot free
  -- registerLayer(pixels, weight) --> occupied, active
occupied
  -- setLayerActive(false) --> occupied, inactive (skipped by compose)
  -- setLayerActive(true)  --> occupied, active
  -- setLayerWeight(w)     --> same occupancy, new weight
  -- unregisterLayer       --> free (weight and active cleared, reference dropped)
```

## Composition rule

```text
acc[i]  = sum over active slots s of weights[s] * layers[s][i]
out[i]  = clampToByte(round(acc[i]))   // native Uint8ClampedArray store
```

No active layers gives `out[i] = 0`.
