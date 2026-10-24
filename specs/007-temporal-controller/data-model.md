# Data Model: Temporal Controller

Contract signatures are in [contracts/temporal-controller-api.md](./contracts/temporal-controller-api.md).

## Types

| Type | Definition |
|---|---|
| `TrackId` | `number`, an integer slot index in `[0, maxTracks)` |
| `CompositorState`, `LayerId` | Existing, from `src/core/compositor-core` |

## TemporalState (plain mutable record, no class)

| Field | Type | Notes |
|---|---|---|
| `compositor` | `CompositorState` | The compositor whose weights are driven; held by reference |
| `maxTracks` | `number` | Positive integer, fixed at creation |
| `maxKeyframes` | `number` | Positive integer, fixed at creation |
| `trackLayer` | `Int32Array` | Length `maxTracks`; the bound `LayerId`, or `-1` when the slot is free |
| `trackLength` | `Int32Array` | Length `maxTracks`; keyframe count, `0` when free |
| `times` | `Float64Array` | Length `maxTracks * maxKeyframes`; track `t` uses `[t * maxKeyframes, t * maxKeyframes + trackLength[t])` |
| `values` | `Float64Array` | Same layout as `times` |

## Validation rules

1. `createTemporalController`: `maxTracks` and `maxKeyframes` are positive integers, otherwise `'invalid-dimensions'`.
2. `addTrack(state, layerId, times, values)`:
   - `times.length === values.length` and `1 <= length <= maxKeyframes`, otherwise `'invalid-keyframes'`.
   - Every time is finite and each is strictly greater than the previous; every value is finite and `>= 0`, otherwise `'invalid-keyframes'`.
   - `layerId` is an integer in `[0, compositor.maxLayers)` and `compositor.layers[layerId] !== null`, otherwise `'unknown-layer'`.
   - No existing track has `trackLayer === layerId`, otherwise `'layer-already-driven'`.
   - At least one free track slot, otherwise `'capacity-exceeded'`.
3. `removeTrack`: `trackId` is an integer in range and its slot is occupied (`trackLayer[trackId] !== -1`), otherwise `'unknown-track'`.
4. `evaluate`: `timeMs` is finite, otherwise `'invalid-time'`.
5. All checks run before any mutation. The one exception is `evaluate` against a layer removed from the compositor, where earlier tracks may already have been applied before the compositor throws `'unknown-layer'`.

## State transitions

```text
track slot free (trackLayer = -1)
  -- addTrack(layerId, times, values) --> bound (keyframes copied in)
bound
  -- evaluate(timeMs) --> weight written to the layer (no state change in the controller)
  -- removeTrack      --> free (trackLength = 0, trackLayer = -1)
```

## Evaluation rule

For a track with keyframes `(t[0], v[0]) ... (t[n-1], v[n-1])`:

```text
timeMs <= t[0]      -> v[0]
timeMs >= t[n-1]    -> v[n-1]
t[k] <= timeMs < t[k+1] -> v[k] + (v[k+1] - v[k]) * (timeMs - t[k]) / (t[k+1] - t[k])
```

A single keyframe is a constant. The result is passed to `setLayerWeight`.
