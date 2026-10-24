# Contract: Temporal Controller API

Public exports of `src/core/temporal-controller/index.ts`. Every function takes the state explicitly; there is no module-level state. Types are defined in [../data-model.md](../data-model.md).

```ts
import type { CompositorState, LayerId } from '../compositor-core'

type TrackId = number

type TemporalErrorReason =
  | 'invalid-dimensions'   // createTemporalController arguments
  | 'invalid-keyframes'    // length mismatch, count out of range, bad time order, bad value
  | 'unknown-layer'        // layer id out of range or not registered
  | 'layer-already-driven' // another track already drives this layer
  | 'capacity-exceeded'    // no free track slot
  | 'unknown-track'        // track id out of range or free
  | 'invalid-time'         // evaluate time not finite

class TemporalError extends Error {
  readonly reason: TemporalErrorReason
}

type TemporalState // plain record, see data model

createTemporalController(
  compositor: CompositorState,
  maxTracks: number,
  maxKeyframes: number
): TemporalState

addTrack(
  state: TemporalState,
  layerId: LayerId,
  times: ArrayLike<number>,
  values: ArrayLike<number>
): TrackId

removeTrack(state: TemporalState, trackId: TrackId): void

evaluate(state: TemporalState, timeMs: number): void
```

## Behavior

### `createTemporalController`
Validates, then allocates the track table and keyframe storage once. Holds `compositor` by reference.

### `addTrack`
Validates, then copies `times` and `values` into the lowest free track slot and returns its index. The input arrays are not retained and may be reused by the caller.

### `removeTrack`
Frees the slot. The layer keeps its last weight; it is not reset.

### `evaluate`
For every bound track, computes the weight at `timeMs` (piecewise linear, clamped to the first and last keyframe outside the range) and calls `setLayerWeight(compositor, layerId, weight)`.
- Allocates nothing and keeps no state between calls, so times may repeat or go backwards.
- Untracked layers are never touched; the compositor's `active` flags and pixels are never touched.
- Throws `TemporalError('invalid-time')` before any write if `timeMs` is not finite.
- If a bound layer is no longer registered in the compositor, `CompositorError('unknown-layer')` propagates from `setLayerWeight`; tracks processed before it have already been applied.

## Intended use

```text
each frame:  evaluate(temporal, clockMs); const image = compose(compositor); updateBuffer(renderer, image)
```

## Guarantees

- Failed `createTemporalController`, `addTrack`, and `removeTrack` calls never partially mutate state.
- Independent controllers share nothing; two controllers must not drive the same compositor layer.
- No DOM access, no globals, no clock reads, no async work.

## Explicitly not provided

Clock ownership, looping or easing, per-track offsets or speed, changing a track's keyframes in place (remove and add instead), driving `active` flags or pixels, and any Svelte or UI code.
