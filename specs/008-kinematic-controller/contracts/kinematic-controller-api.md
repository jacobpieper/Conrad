# Contract: Kinematic Controller API

Public exports of `src/core/kinematic-controller/index.ts`. Every function takes the state explicitly; there is no module-level state. Types are defined in [../data-model.md](../data-model.md). Requires the offset support described in [compositor-offsets-api.md](./compositor-offsets-api.md).

```ts
import type { CompositorState, LayerId } from '../compositor-core'

type TrackId = number
type InterpolationMode = 'linear' | 'cubic' | 'parametric'

type KeyframeMotion = {
  mode: 'linear' | 'cubic'
  times: ArrayLike<number>
  x: ArrayLike<number>
  y: ArrayLike<number>
}

type ParametricMotion = {
  mode: 'parametric'
  centerX: number
  centerY: number
  amplitudeX: number
  amplitudeY: number
  periodMs: number
  phaseMs: number
  exponent: number
}

type MotionTrack = KeyframeMotion | ParametricMotion

type KinematicErrorReason =
  | 'invalid-dimensions'   // createKinematicController arguments
  | 'invalid-motion'       // unknown mode, bad keyframes, bad parameters
  | 'unknown-layer'        // layer id out of range or not registered
  | 'layer-already-driven' // another motion track already drives this layer
  | 'capacity-exceeded'    // no free track slot
  | 'unknown-track'        // track id out of range or free
  | 'invalid-time'         // evaluateMotion time not finite

class KinematicError extends Error {
  readonly reason: KinematicErrorReason
}

type KinematicState // plain record, see data model

createKinematicController(
  compositor: CompositorState,
  maxTracks: number,
  maxKeyframes: number
): KinematicState

addMotionTrack(state: KinematicState, layerId: LayerId, motion: MotionTrack): TrackId
removeMotionTrack(state: KinematicState, trackId: TrackId): void
evaluateMotion(state: KinematicState, timeMs: number): void
```

## Behavior

### `createKinematicController`
Validates, then allocates the track table, keyframe storage, and parameter storage once. Holds `compositor` by reference.

### `addMotionTrack`
Validates (see data model for the exact order), then copies the keyframes or parameters into the lowest free slot and returns its index. `motion` and its arrays are not retained and may be reused by the caller. The mode is fixed for the life of the track.

### `removeMotionTrack`
Frees the slot. The layer keeps its last offset; it is not reset.

### `evaluateMotion`
For every bound track computes the position at `timeMs` per the mode, rounds each axis with `Math.round`, and calls `setLayerOffset(compositor, layerId, x, y)`.
- `linear` and `cubic` hold the first or last keyframe outside the time range; `parametric` is periodic for all times.
- Allocates nothing, keeps no state between calls, so times may repeat or go backwards.
- Throws `KinematicError('invalid-time')` before any write if `timeMs` is not finite.
- Untracked layers, weights, `active` flags, and layer pixels are never touched.
- If a bound layer is no longer registered, `CompositorError('unknown-layer')` propagates from `setLayerOffset`; tracks processed before it have already been applied.

## Worked examples

X keyframes `times [0, 1000, 2000]`, `x [0, 10, 0]`:

| Mode | `timeMs` | X offset |
|---|---|---|
| `linear` | `500` / `1000` / `1500` | `5` / `10` / `5` |
| `cubic` | `500` / `1000` / `1500` | `6` (6.25 rounded) / `10` / `6` |

Parametric (`centerX 0`, `amplitudeX 10`, `periodMs 4000`, `phaseMs 0`):

| `exponent` | `timeMs` `0` / `1000` / `2000` / `4000` | X offset |
|---|---|---|
| `1` (sinusoid) | | `10` / `0` / `-10` / `10` |
| `2` (respiratory shape) | `1000` | `-5` |

## Intended use

```text
each frame:  evaluate(temporal, clockMs); evaluateMotion(kinematic, clockMs)
             const image = compose(compositor); updateBuffer(renderer, image)
```

## Guarantees

- Failed `createKinematicController`, `addMotionTrack`, and `removeMotionTrack` calls never partially mutate state.
- Independent controllers share nothing; two controllers must not drive the same compositor layer's offsets.
- No DOM access, no globals, no clock reads, no async work.
- Layer pixel buffers are never read, written, or copied by this module.

## Explicitly not provided

Clock ownership, looping or easing of keyframe tracks, changing a track's mode or data in place, natural (C2) or monotone cubic splines, sub-pixel offsets, rotation or scaling, and any Svelte or UI code.
