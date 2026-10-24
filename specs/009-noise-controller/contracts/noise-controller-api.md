# Contract: Noise Controller API

Public exports of `src/core/noise-controller/index.ts`. Every function takes the state explicitly; there is no module-level state. Types are defined in [../data-model.md](../data-model.md).

```ts
import type { GrayscaleImage } from '../image-loader'

type NoiseOptions = {
  window?: number // finite and > 0; default 255
  level?: number  // finite; default 127.5
  dose?: number   // > 0 or Infinity; default Infinity (no noise)
  seed?: number   // integer in [0, 4294967295]; default 1
}

type NoiseErrorReason =
  | 'invalid-dimensions'   // createNoiseController width or height
  | 'invalid-window-level' // window not finite and > 0, or level not finite
  | 'invalid-dose'         // not a number > 0 or Infinity
  | 'invalid-seed'         // not an integer in [0, 4294967295]
  | 'invalid-image'        // processFrame image does not match the controller

class NoiseError extends Error {
  readonly reason: NoiseErrorReason
}

type NoiseState // plain record, see data model

createNoiseController(width: number, height: number, options?: NoiseOptions): NoiseState
setWindowLevel(state: NoiseState, window: number, level: number): void
setDose(state: NoiseState, dose: number): void
reseed(state: NoiseState, seed: number): void

processFrame(state: NoiseState, image: GrayscaleImage): GrayscaleImage
```

## Behavior

### `createNoiseController`
Validates, then allocates the window table, sigma table, generator state, and output image once, builds both tables, and seeds the generator. `options` is read once and not retained.

### `setWindowLevel` / `setDose` / `reseed`
Validate, then rewrite the existing table or generator state in place. They allocate nothing and can be called every frame.

### `processFrame`
Validates the image size, then for every pixel adds dose-dependent noise (when dose is finite) and maps the result through the window/level table into `state.output`, which it returns.
- Reads `image` only: its pixels are never modified, so the compositor output and every layer behind it stay untouched.
- Allocates nothing; the returned image and its `data` are the same instances on every call and are overwritten by the next call.
- With a finite dose the generator advances by exactly `width * height` draws per call, so the same seed and the same call sequence reproduce the same noise; with dose `Infinity` it is not advanced.
- Noise is added before window/level; noisy values are rounded and clamped to a byte before the table lookup.
- The result is accepted directly by the renderer's `updateBuffer`.

## Worked examples

Window `100`, level `100`, dose `Infinity`:

| Input byte | `0` | `50` | `75` | `100` | `125` | `150` | `200` |
|---|---|---|---|---|---|---|---|
| Output byte | `0` | `0` | `64` | `128` | `191` | `255` | `255` |

Noise standard deviation in byte units is `sqrt(255 * v / dose)`: for `v = 128` and `dose = 1000` about `5.71` (about `5.72` after output rounding); quadrupling dose halves it; `v = 192` is about `2` times noisier than `v = 48` at the same dose.

## Intended use

```text
each frame:  const composed = compose(compositor)
             const image = processFrame(noise, composed)
             updateBuffer(renderer, image)
```

## Guarantees

- Failed `createNoiseController`, `setWindowLevel`, `setDose`, `reseed`, and `processFrame` calls never partially mutate state.
- Independent controllers share nothing.
- No DOM access, no globals, no clock reads, no `Math.random`, no async work.

## Explicitly not provided

Spatially correlated noise, detector blur, additive electronic noise, exact Poisson sampling, per-pixel dose maps, display inversion or non-linear curves, frame-keyed stateless noise, resizing an existing controller (create a new one), and any Svelte or UI code.
