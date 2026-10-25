# Data Model: Previous Frame State

Contract signatures are in [contracts/previous-frame-api.md](./contracts/previous-frame-api.md). Existing types are in [../010-simulation-orchestrator/data-model.md](../010-simulation-orchestrator/data-model.md).

## Types

| Type | Definition |
|---|---|
| `GrayscaleImage` | Existing: `{ width, height, data: Uint8ClampedArray }` |
| `EngineState` | Existing record, extended with one field below |

## EngineState (changed)

| Field | Type | Notes |
|---|---|---|
| `compositor` | `CompositorState` | Unchanged |
| `temporal` | `TemporalState` | Unchanged |
| `kinematic` | `KinematicState` | Unchanged |
| `noise` | `NoiseState` | Unchanged; `noise.output` is the final frame |
| `renderer` | `RendererState` | Unchanged |
| `previousFrame` | `Uint8ClampedArray` | New. Length `width * height`. Zero-filled at creation, overwritten in place at the end of every successful tick with a copy of `noise.output.data`. |

`previousFrame` is assigned once at creation and never replaced.

## Invariants

```text
previousFrame.length         === noise.pixelCount === compositor.width * compositor.height
previousFrame                !== noise.output.data        (a copy, never an alias)
previousFrame (same instance every tick)
after createEngine           : every byte of previousFrame is 0
after a successful tick      : previousFrame[i] === returnedImage.data[i] for all i
after a throwing tick        : previousFrame unchanged
during tick N, before the copy: previousFrame holds the final frame of tick N-1 (zeros for N = 0)
```

## Per-tick pipeline (changed)

```text
tick(engine, timeMs):
  require Number.isFinite(timeMs)                  // else SimulationError('invalid-time'), nothing mutated
  evaluate(temporal, timeMs)
  evaluateMotion(kinematic, timeMs)
  composed  = compose(compositor)
  processed = processFrame(noise, composed)        // may read engine.previousFrame in a future stage
  updateBuffer(renderer, processed)
  previousFrame.set(processed.data)                // new: final step, native copy, no allocation
  return processed
```

## Validation rules

No new validation. `previousFrame` is sized from values the compositor has already validated, and `.set` cannot fail because source and destination lengths match by construction.
