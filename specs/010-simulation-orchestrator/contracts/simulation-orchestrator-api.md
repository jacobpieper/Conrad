# Contract: Simulation Orchestrator API

Public exports of `src/core/simulation-orchestrator/index.ts`. Every function takes the engine explicitly; there is no module-level state. Types are defined in [../data-model.md](../data-model.md).

```ts
import type { CompositorState } from '../compositor-core'
import type { GrayscaleImage } from '../image-loader'
import type { KinematicState } from '../kinematic-controller'
import type { NoiseOptions, NoiseState } from '../noise-controller'
import type { RendererState } from '../headless-renderer'
import type { TemporalState } from '../temporal-controller'

type EngineOptions = {
  width: number
  height: number
  maxLayers: number
  maxTracks?: number       // default maxLayers
  maxKeyframes?: number    // default 16
  viewportWidth?: number   // default width
  viewportHeight?: number  // default height
  noise?: NoiseOptions
}

type EngineState = {
  compositor: CompositorState
  temporal: TemporalState
  kinematic: KinematicState
  noise: NoiseState
  renderer: RendererState
}

type SimulationErrorReason = 'invalid-time' // timeMs is not a finite number

class SimulationError extends Error {
  readonly reason: SimulationErrorReason
}

createEngine(options: EngineOptions): Promise<EngineState>
tick(engine: EngineState, timeMs: number): GrayscaleImage
destroyEngine(engine: EngineState): void
```

## Behavior

### `createEngine`
Creates the compositor, the temporal and kinematic controllers on that compositor, the noise controller at the compositor's size, and finally the renderer. Allocates everything once. Rejects with the failing creator's own error (`CompositorError`, `TemporalError`, `KinematicError`, `NoiseError`, or `RendererError`) unchanged. Because the renderer is created last, a rejection never leaves a canvas allocated. `options` is read once and not retained.

### `tick`
Throws `SimulationError('invalid-time')` if `timeMs` is not finite, before any stage runs. Otherwise runs, in order: `evaluate(temporal, timeMs)`, `evaluateMotion(kinematic, timeMs)`, `compose(compositor)`, `processFrame(noise, composed)`, `updateBuffer(renderer, processed)`, then returns the processed image.
- Allocates nothing: no objects, arrays, closures, or strings are created; the returned image and its `data` are the same instances on every call and are overwritten by the next call.
- Reads no clock; the same `timeMs` on an engine with noise off always gives the same frame, whatever came before. With noise on, the generator advances by one frame per call.
- Layers without a temporal track keep their registered weight; layers without a kinematic track keep their current offset.
- If a canvas is bound to `engine.renderer`, the frame is also presented there.

### `destroyEngine`
Calls `destroyRenderer(engine.renderer)`. The typed-array states need no teardown. The engine must not be used afterward.

## Worked example

Engine 4x1, one layer `[0, 100, 200, 250]` registered at weight `1`; temporal track on that layer with times `[0, 1000]` and values `[0, 1]`; defaults for window/level and no noise.

| `timeMs` | Weight | Returned image data |
|---|---|---|
| `0` | `0` | `[0, 0, 0, 0]` |
| `500` | `0.5` | `[0, 50, 100, 125]` |
| `1000` | `1` | `[0, 100, 200, 250]` |

Adding a kinematic linear track on the same layer with times `[0, 1000]`, `x` of `[0, 1]`, and `y` of `[0, 0]`: at `timeMs = 1000` the offset is `(1, 0)` and the frame becomes `[0, 0, 100, 200]` (output pixel `x` reads source `x - 1`; the vacated column is `0`).

## Intended use

```text
setup:       const engine = await createEngine({ width, height, maxLayers: 4, noise: { dose: 2000 } })
             const id = registerLayer(engine.compositor, pixels, 1)
             addTrack(engine.temporal, id, times, weights)
             addMotionTrack(engine.kinematic, id, { mode: 'linear', times, x, y })
             bindTarget(engine.renderer, canvas)
each frame:  tick(engine, timeMs)
teardown:    destroyEngine(engine)
```

## Guarantees

- A failed `tick` (bad time) mutates nothing; a failed `createEngine` leaves no renderer allocated.
- Independent engines share nothing.
- No DOM access in this module, no globals, no clock reads, no `Math.random`, and no async work in `tick`.

## Explicitly not provided

Wrappers around the sub-module setup APIs, a clock or animation-frame driver, a playback model (play, pause, loop, speed), frame-keyed reproducible noise, per-tick statistics, resizing an engine (create a new one), worker or `SharedArrayBuffer` transfer, and any Svelte or UI code.
