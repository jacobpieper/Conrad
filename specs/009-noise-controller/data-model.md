# Data Model: Noise Controller

Contract signatures are in [contracts/noise-controller-api.md](./contracts/noise-controller-api.md).

## Types

| Type | Definition |
|---|---|
| `GrayscaleImage` | Existing, from `src/core/image-loader`: `{ width, height, data: Uint8ClampedArray }` with `data.length === width * height` |
| `NoiseOptions` | `{ window?: number, level?: number, dose?: number, seed?: number }`; every field optional; read once at creation |

## NoiseState (plain mutable record, no class)

| Field | Type | Notes |
|---|---|---|
| `width`, `height` | `number` | Positive integers, fixed at creation |
| `pixelCount` | `number` | `width * height` |
| `window` | `number` | Finite and `> 0`; default `255` |
| `level` | `number` | Finite; default `127.5` |
| `dose` | `number` | A number `> 0`, or `Infinity` for no noise; default `Infinity` |
| `windowTable` | `Uint8ClampedArray` | Length `256`; `windowTable[v]` is the display byte for input byte `v` |
| `sigmaTable` | `Float32Array` | Length `256`; noise standard deviation in byte units for input byte `v` |
| `rng` | `Uint32Array` | Length `1`; `mulberry32` state |
| `output` | `GrayscaleImage` | `{ width, height, data: Uint8ClampedArray(pixelCount) }`; returned by `processFrame` |

## Table definitions

```text
lo                 = level - window / 2
windowTable[v]     = (v - lo) / window * 255          // stored in a Uint8ClampedArray: round to nearest (ties to even), clamp 0..255
sigmaTable[v]      = sqrt(255 * v / dose)             // 0 for every v when dose is Infinity
```

Defaults (window `255`, level `127.5`) give `lo = 0` and `windowTable[v] === v` for every byte.

## Per-pixel rule (`processFrame`)

```text
dose finite:
  draw  = mulberry32(rng)                              // one 32-bit draw per pixel
  z     = ((draw & 255) + ((draw >>> 8) & 255) + ((draw >>> 16) & 255) + (draw >>> 24) - 510) / 147.80
  f     = v + sigmaTable[v] * z
  noisy = clamp(f, 0, 255) rounded to the nearest integer   // (f + 0.5) | 0 after clamping
  out   = windowTable[noisy]
dose Infinity:
  out   = windowTable[v]                                // generator state untouched
```

`147.80 = sqrt(4 * (256^2 - 1) / 12)` is the standard deviation of the sum of four uniform bytes.

## Validation rules

1. `createNoiseController(width, height, options?)`: `width` and `height` positive integers, otherwise `'invalid-dimensions'`; then the window/level, dose, and seed rules below on any supplied options.
2. `setWindowLevel(state, window, level)`: `window` finite and `> 0` and `level` finite, otherwise `'invalid-window-level'`.
3. `setDose(state, dose)`: a number `> 0` (including `Infinity`), otherwise `'invalid-dose'` (`NaN`, `0`, and negatives are rejected).
4. `reseed(state, seed)` and the `seed` option: `Number.isInteger(seed)` and `0 <= seed <= 4294967295`, otherwise `'invalid-seed'`; the default seed is `1`.
5. `processFrame(state, image)`: `image.width === state.width`, `image.height === state.height`, and `image.data.length === state.pixelCount`, otherwise `'invalid-image'`.
6. All checks run before any mutation; a failed call leaves state unchanged.

## State transitions

```text
created (defaults or options applied, tables built, generator seeded)
  -- setWindowLevel --> windowTable rebuilt in place
  -- setDose        --> sigmaTable rebuilt in place (noise on if finite, off if Infinity)
  -- reseed         --> rng[0] set; the next frame repeats the sequence for that seed
  -- processFrame   --> output rewritten; rng advanced by pixelCount draws when dose is finite
```
