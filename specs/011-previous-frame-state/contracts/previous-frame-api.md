# Contract: Previous Frame State

Changes to the public exports of `src/core/simulation-orchestrator/index.ts`. No new functions are exported; `EngineState` gains one field and `createEngine` and `tick` gain behavior. Types are defined in [../data-model.md](../data-model.md).

```ts
type EngineState = {
  compositor: CompositorState
  temporal: TemporalState
  kinematic: KinematicState
  noise: NoiseState
  renderer: RendererState
  previousFrame: Uint8ClampedArray // length width * height; the previous tick's final frame
}

createEngine(options: EngineOptions): Promise<EngineState> // signature unchanged
tick(engine: EngineState, timeMs: number): GrayscaleImage   // signature unchanged
```

## Behavior

### `createEngine`
Allocates `previousFrame` once as a zero-filled `Uint8ClampedArray` of `width * height` bytes, after the compositor, controllers, and noise controller exist and before the renderer. Invalid dimensions are rejected by the existing sub-module errors, unchanged, and no extra error reason is added.

### `tick`
Unchanged up to and including `updateBuffer`. Then runs `engine.previousFrame.set(processed.data)` and returns `processed`.
- Allocates nothing: the copy forwards two existing arrays to `.set`.
- If `timeMs` is not finite, throws `SimulationError('invalid-time')` before any stage runs; `previousFrame` is not touched.
- The returned image and its `data` are the same instances on every call; `previousFrame` is a separate, stable instance.

### Reading `previousFrame`
- A stage that runs inside `tick` before the final copy reads the previous tick's final frame (all zeros during the first tick).
- A caller reading `engine.previousFrame` after `tick` returns reads the frame that tick just produced (equal to the returned `data`).
- The buffer is owned by the engine. Stages MUST treat it as read-only; only `tick` writes it.
- The buffer is not an alias of `noise.output.data`.

## Worked example

Engine 4x1, one layer `[0, 100, 200, 250]` at weight `1`, temporal track times `[0, 1000]` and values `[0, 1]`, defaults for window/level, no noise.

| Event | Returned image data | `previousFrame` after the event |
|---|---|---|
| `createEngine` | n/a | `[0, 0, 0, 0]` |
| `tick(engine, 500)` | `[0, 50, 100, 125]` | `[0, 50, 100, 125]` |
| `tick(engine, 1000)` | `[0, 100, 200, 250]` | `[0, 100, 200, 250]` |
| `tick(engine, NaN)` throws | n/a | `[0, 100, 200, 250]` (unchanged) |
| `tick(engine, 0)` | `[0, 0, 0, 0]` | `[0, 0, 0, 0]` |

During the `tick(engine, 1000)` call, a stage placed before the final copy would have seen `[0, 50, 100, 125]`.

## Intended use

```text
setup:       const engine = await createEngine({ width, height, maxLayers: 4 })
each frame:  tick(engine, timeMs)            // a future stage inside tick reads engine.previousFrame
inspection:  engine.previousFrame            // equals the frame just returned
```
