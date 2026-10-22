# Data Model: Grayscale Blending

All types are plain records over flat typed arrays. No classes hold image data; there is no module state.

## GrayscaleImage (re-used from `src/core/image-loader`)

| Field | Type | Rules |
|---|---|---|
| `width` | `number` | Positive integer |
| `height` | `number` | Positive integer |
| `data` | `Uint8ClampedArray` | Length exactly `width * height`; single channel, row-major, top-left origin, 0-255 |

Pixel `(x, y)` is at index `y * width + x`.

## Mask

A `GrayscaleImage` used as per-pixel overlay opacity: `0` fully transparent (shows base), `255` fully opaque (shows overlay). Must match the dimensions of base and overlay.

## Output Buffer

A flat `Uint8ClampedArray` of length `width * height` (no separate dimensions; they are the inputs'). Either supplied by the caller (`out`) and returned as the same reference, or newly created once. The clamped view is the actual output storage, so writing needs no per-call view construction.

## BlendError

`class BlendError extends Error`, `name = 'BlendError'`, no reason codes. Thrown for any validation failure.

## Validation rules (checked before any write)

| Rule | Applies to |
|---|---|
| At least one layer | `addLayers`, `subtractLayers` |
| `width`, `height` positive integers | every layer and mask |
| `width`, `height` equal to those of the first layer (base) | every other layer and mask |
| `data.length === width * height` | every layer and mask |
| `out.length === width * height` | `out`, if supplied |

## Per-pixel semantics

Let `L0..Ln` be layers, `i` a pixel index, `sat` the native 0-255 saturating (and nearest-rounding) store.

- **add**: `out[i] = sat(L0[i] + L1[i] + ... + Ln[i])`
- **subtract**: `out[i] = sat(L0[i] - L1[i] - ... - Ln[i])`
- **alpha mask**: `out[i] = sat(base[i] + (overlay[i] - base[i]) * mask[i] / 255)`
- **single layer** (add/subtract): `out[i] = L0[i]`

## State transitions

None. Each call is independent; inputs are never modified, and `out` is modified only after validation succeeds.
