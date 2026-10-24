# Data Model: Simulation Orchestrator

Contract signatures are in [contracts/simulation-orchestrator-api.md](./contracts/simulation-orchestrator-api.md).

## Types

| Type | Definition |
|---|---|
| `GrayscaleImage` | Existing, from `src/core/image-loader`: `{ width, height, data: Uint8ClampedArray }` |
| `CompositorState`, `TemporalState`, `KinematicState`, `NoiseState`, `RendererState` | Existing plain records owned by their modules |
| `NoiseOptions` | Existing: `{ window?, level?, dose?, seed? }` |

## EngineOptions (read once at creation, not retained)

| Field | Type | Default | Notes |
|---|---|---|---|
| `width`, `height` | `number` | required | Image size in pixels; validated by `createCompositor` |
| `maxLayers` | `number` | required | Compositor layer slots; validated by `createCompositor` |
| `maxTracks` | `number` | `maxLayers` | Track slots for each of the temporal and kinematic controllers |
| `maxKeyframes` | `number` | `16` | Keyframes per track for both controllers |
| `viewportWidth`, `viewportHeight` | `number` | `width`, `height` | Renderer surface size; validated by `createRenderer` |
| `noise` | `NoiseOptions` | `undefined` | Passed to `createNoiseController` |

## EngineState (plain record, no class)

| Field | Type | Notes |
|---|---|---|
| `compositor` | `CompositorState` | Created first; owns layers, weights, offsets, and the composed output |
| `temporal` | `TemporalState` | Bound to `compositor`; writes weights |
| `kinematic` | `KinematicState` | Bound to the same `compositor`; writes offsets |
| `noise` | `NoiseState` | Sized `width x height`; its `output` is the final buffer |
| `renderer` | `RendererState` | Created last; receives `noise.output` each tick |

Fields are assigned once at creation and never replaced. The engine adds no buffers of its own.

## Wiring invariants

```text
temporal.compositor  === compositor
kinematic.compositor === compositor
noise.width/height   === compositor.width/height
tick image           === noise.output           (same instance every call)
tick image.data      === noise.output.data      (same instance every call)
```

## Per-tick pipeline

```text
tick(engine, timeMs):
  require Number.isFinite(timeMs)                  // else SimulationError('invalid-time'), nothing mutated
  evaluate(temporal, timeMs)                       // -> compositor.weights
  evaluateMotion(kinematic, timeMs)                // -> compositor.offsetsX / offsetsY
  composed  = compose(compositor)                  // -> compositor.output
  processed = processFrame(noise, composed)        // -> noise.output (noise, then window/level)
  updateBuffer(renderer, processed)                // -> renderer surface (and bound target)
  return processed
```

## Validation rules

1. `createEngine`: no checks of its own; each creator validates its own arguments and its error is thrown unchanged. Creation order is compositor, temporal, kinematic, noise, renderer, so every synchronous failure occurs before the renderer exists.
2. `tick`: `timeMs` must be a finite number, otherwise `SimulationError('invalid-time')`, thrown before any stage runs.
3. After the time check, a tick on an engine built by `createEngine` cannot throw (image sizes match by construction).

## State transitions

```text
created (all five states built once)
  -- tick(t)         --> weights, offsets, composed output, noise output, renderer surface rewritten; noise generator advanced when dose is finite
  -- setup calls     --> (on the sub-states directly) layers, tracks, window/level, dose, seed, bound canvas
  -- destroyEngine   --> renderer destroyed
```
