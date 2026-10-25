# Data Model: Frame Capture

Contract signatures are in [contracts/frame-capture-api.md](./contracts/frame-capture-api.md). Existing engine types are in [../010-simulation-orchestrator/data-model.md](../010-simulation-orchestrator/data-model.md) and [../011-previous-frame-state/data-model.md](../011-previous-frame-state/data-model.md).

## Types

| Type | Definition |
|---|---|
| `CaptureMode` | `'stop' \| 'loop'` |
| `CaptureTargetConfig` | `{ id: string, maxCapacity: number, mode: CaptureMode }` (input; lives in `EngineOptions`) |
| `CaptureTarget` | Mutable plain record, see below |
| `CaptureErrorReason` | `'invalid-id' \| 'duplicate-id' \| 'invalid-capacity' \| 'invalid-mode'` |
| `CaptureError` | `Error` subclass with `reason: CaptureErrorReason` |
| `GrayscaleImage` | Existing: `{ width, height, data: Uint8ClampedArray }` |

## CaptureTarget

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Non-empty, unique within the engine. Fixed after creation. |
| `mode` | `CaptureMode` | Fixed after creation. |
| `maxCapacity` | `number` | Positive integer, frames. Fixed after creation. |
| `frameSize` | `number` | `width * height`, elements per frame. Fixed after creation; stored so `captureFrame` needs no engine. |
| `buffer` | `Uint8ClampedArray` | Length `maxCapacity * frameSize`. Zero-filled at creation; created once, never resized or replaced. |
| `isRecording` | `boolean` | Initially `true`. Set `false` by `captureFrame` when a `'stop'` target fills; a caller may toggle it. |
| `headIndex` | `number` | Next write slot, `0..maxCapacity`. Initially `0`. |
| `totalFramesRecorded` | `number` | Frames written since creation. Initially `0`; never reset; keeps counting past `maxCapacity` in loop mode. |

## EngineOptions / EngineState (changed)

| Type | Field | Type | Notes |
|---|---|---|---|
| `EngineOptions` | `captureTargets?` | `CaptureTargetConfig[]` | New. Defaults to none. |
| `EngineState` | `captureTargets` | `CaptureTarget[]` | New. Same order as the options; empty array when none. Assigned once, never replaced. |

All other `EngineState` fields are unchanged.

## Invariants

```text
target.buffer.length          === target.maxCapacity * target.frameSize
target.frameSize              === engine.noise.pixelCount === width * height
target.buffer                 !== engine.noise.output.data      (a copy, never an alias)
target.buffer / captureTargets array (same instances every tick)
after createEngine            : buffer all 0, isRecording true, headIndex 0, totalFramesRecorded 0
while isRecording             : 0 <= headIndex < maxCapacity at the start of every capture
loop target                   : 0 <= headIndex < maxCapacity always; totalFramesRecorded % maxCapacity === headIndex
stop target                   : headIndex === totalFramesRecorded <= maxCapacity; isRecording false iff headIndex === maxCapacity (unless a caller paused it)
after a throwing tick         : all target buffers and fields unchanged
```

## Slot addressing

```text
offset(slot)      = slot * frameSize
frame in slot s   = buffer[s * frameSize .. (s + 1) * frameSize)

loop target, count = min(totalFramesRecorded, maxCapacity)
  not yet wrapped (totalFramesRecorded <  maxCapacity): oldest = 0,        newest = headIndex - 1
  wrapped         (totalFramesRecorded >= maxCapacity): oldest = headIndex, newest = (headIndex - 1 + maxCapacity) % maxCapacity
stop target: oldest = 0, newest = headIndex - 1 (frames in order; full when headIndex === maxCapacity)
```

## Per-tick pipeline (changed)

```text
tick(engine, timeMs):
  require Number.isFinite(timeMs)                  // else SimulationError('invalid-time'), nothing mutated
  evaluate(temporal, timeMs)
  evaluateMotion(kinematic, timeMs)
  composed  = compose(compositor)
  processed = processFrame(noise, composed)
  updateBuffer(renderer, processed)
  previousFrame.set(processed.data)
  captureFrame(captureTargets, processed.data)     // new: final step, native copies, no allocation
  return processed

captureFrame(targets, frame):
  for i in 0 .. targets.length - 1:                // indexed loop
    t = targets[i]
    if not t.isRecording: continue
    t.buffer.set(frame, t.headIndex * t.frameSize)
    t.headIndex++
    t.totalFramesRecorded++
    if t.headIndex === t.maxCapacity:
      if t.mode === 'stop': t.isRecording = false
      else:                 t.headIndex = 0
```

## State transitions (per target)

```text
created (recording, head 0, total 0)
  --tick-->  recording, head++, total++            while head < maxCapacity after the increment
  --tick-->  stop mode, head === maxCapacity:   stopped (isRecording false, head = maxCapacity)
  --tick-->  loop mode, head === maxCapacity:   recording, head = 0
stopped      --tick-->  unchanged
paused (caller sets isRecording false) --tick--> unchanged; caller sets true to resume at the same head
```

## Validation rules

Performed once in `createCaptureTargets`, in array order, first failure throws:

- `id`: `typeof id === 'string'` and `id.length > 0`, else `invalid-id`; not seen earlier in the array, else `duplicate-id`.
- `maxCapacity`: `Number.isInteger(maxCapacity) && maxCapacity > 0`, else `invalid-capacity`.
- `mode`: `'stop'` or `'loop'`, else `invalid-mode`.

`width * height` is validated earlier by the compositor. No validation occurs in `captureFrame`: `.set` cannot fail because `headIndex < maxCapacity` while recording and the frame length equals `frameSize` by construction.
