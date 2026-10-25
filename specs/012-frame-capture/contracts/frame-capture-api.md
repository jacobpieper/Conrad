# Contract: Frame Capture

Public exports of `src/core/frame-capture/index.ts` and changes to `src/core/simulation-orchestrator/index.ts`. Types are defined in [../data-model.md](../data-model.md).

```ts
// src/core/frame-capture
type CaptureMode = 'stop' | 'loop'
type CaptureTargetConfig = { id: string; maxCapacity: number; mode: CaptureMode }
type CaptureTarget = {
  id: string
  mode: CaptureMode
  maxCapacity: number
  frameSize: number
  buffer: Uint8ClampedArray // maxCapacity * frameSize, pre-allocated, never resized
  isRecording: boolean
  headIndex: number
  totalFramesRecorded: number
}
type CaptureErrorReason = 'invalid-id' | 'duplicate-id' | 'invalid-capacity' | 'invalid-mode'
class CaptureError extends Error { readonly reason: CaptureErrorReason }

createCaptureTargets(frameSize: number, configs: readonly CaptureTargetConfig[]): CaptureTarget[]
captureFrame(targets: CaptureTarget[], frame: Uint8ClampedArray): void

// src/core/simulation-orchestrator
type EngineOptions = { /* existing fields */ captureTargets?: CaptureTargetConfig[] }
type EngineState = { /* existing fields */ captureTargets: CaptureTarget[] }

createEngine(options: EngineOptions): Promise<EngineState> // signature unchanged
tick(engine: EngineState, timeMs: number): GrayscaleImage   // signature unchanged
```

The orchestrator also re-exports the capture types and `CaptureError` for convenience.

## Behavior

### `createCaptureTargets`
Validates configs in order and allocates one zero-filled `Uint8ClampedArray` of `maxCapacity * frameSize` per target, returning records with `isRecording: true`, `headIndex: 0`, `totalFramesRecorded: 0`. Throws `CaptureError` for an invalid `id`, a duplicate `id`, a non-positive-integer `maxCapacity`, or an unknown `mode`. An unallocatable size throws the native `RangeError`, unwrapped. An empty config list returns an empty array.

### `captureFrame`
For each target in order with `isRecording === true`: `buffer.set(frame, headIndex * frameSize)`, then `headIndex` and `totalFramesRecorded` increase by 1; if `headIndex === maxCapacity`, a `'stop'` target sets `isRecording = false` (head stays at `maxCapacity`) and a `'loop'` target sets `headIndex = 0`. Allocates nothing and does not validate `frame.length`; callers pass an array of length `frameSize`.

### `createEngine`
Calls `createCaptureTargets(noise.pixelCount, options.captureTargets ?? [])` after the noise controller and `previousFrame` exist and before the renderer. Any capture error leaves no renderer allocated. `engine.captureTargets` holds the result and is never replaced.

### `tick`
Unchanged up to and including `previousFrame.set`. Then runs `captureFrame(engine.captureTargets, processed.data)` and returns `processed`.
- Allocates nothing.
- Non-finite `timeMs` throws `SimulationError('invalid-time')` before any stage runs; no target is touched.
- The returned image and its `data` are the same instances on every call; target buffers are separate, stable instances.

### Reading captures
- Buffers are owned by the engine; `tick` is the only writer. Consumers read them and may toggle `isRecording`; they MUST NOT resize, replace, or write into `buffer`, or edit the other fields.
- The newest frame in a recording target equals the frame the last `tick` returned.
- Reading order follows the slot formulas in [../data-model.md](../data-model.md#slot-addressing).

## Worked example

Engine 4x1, one layer `[0, 100, 200, 250]` at weight `1`, temporal track times `[0, 1000]` and values `[0, 1]`, no noise, defaults for window/level. Targets: `{ id: 'first', maxCapacity: 2, mode: 'stop' }` and `{ id: 'last', maxCapacity: 2, mode: 'loop' }`. Frames: `a = [0,0,0,0]` (t=0), `b = [0,50,100,125]` (t=500), `c = [0,100,200,250]` (t=1000).

| Event | `first` buffer / head / total / recording | `last` buffer / head / total / recording |
|---|---|---|
| `createEngine` | `[0×8]` / 0 / 0 / true | `[0×8]` / 0 / 0 / true |
| `tick(engine, 0)` returns `a` | `a, 0` / 1 / 1 / true | `a, 0` / 1 / 1 / true |
| `tick(engine, 500)` returns `b` | `a, b` / 2 / 2 / **false** | `a, b` / 0 / 2 / true |
| `tick(engine, 1000)` returns `c` | `a, b` / 2 / 2 / false (unchanged) | `c, b` / 1 / 3 / true |
| `tick(engine, NaN)` throws | unchanged | unchanged |

For `last` after the third tick: `totalFramesRecorded (3) >= maxCapacity (2)`, so the oldest frame is at slot `headIndex = 1` (`b`) and the newest at slot `(1 - 1 + 2) % 2 = 0` (`c`).

## Intended use

```text
setup:       const engine = await createEngine({ width, height, maxLayers: 4,
               captureTargets: [{ id: 'run', maxCapacity: 300, mode: 'stop' }] })
each frame:  tick(engine, timeMs)
inspection:  const run = engine.captureTargets.find(t => t.id === 'run')   // outside the hot path
```
