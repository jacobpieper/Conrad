# Data Model: Kinematic Controller

Contract signatures are in [contracts/compositor-offsets-api.md](./contracts/compositor-offsets-api.md) and [contracts/kinematic-controller-api.md](./contracts/kinematic-controller-api.md).

## Compositor additions (`src/core/compositor-core`)

New fields on `CompositorState` (existing fields are unchanged):

| Field | Type | Notes |
|---|---|---|
| `offsetsX` | `Int32Array` | Length `maxLayers`; integer X offset per slot, `0` by default and after `unregisterLayer`; positive moves content right |
| `offsetsY` | `Int32Array` | Length `maxLayers`; integer Y offset per slot, `0` by default and after `unregisterLayer`; positive moves content down |

New error reason: `'invalid-offset'`.

### Offset validation

1. `setLayerOffset(state, id, x, y)`: `id` must be an integer in `[0, maxLayers)` with an occupied slot, otherwise `'unknown-layer'`.
2. `x` and `y` must each satisfy `Number.isInteger` and lie within `[-2147483648, 2147483647]`, otherwise `'invalid-offset'`.
3. Checks run before any mutation.

### Composition rule with offsets

```text
for each active layer s with offset (dx, dy), weight w, pixels P:
  for each output row y with 0 <= y - dy < height:
    for each output column x with 0 <= x - dx < width:
      acc[y * width + x] += w * P[(y - dy) * width + (x - dx)]
out[i] = clampToByte(round(acc[i]))
```

Pixels with no in-range source receive nothing from that layer. Layers are only read.

## Types (`src/core/kinematic-controller`)

| Type | Definition |
|---|---|
| `TrackId` | `number`, an integer slot index in `[0, maxTracks)` |
| `InterpolationMode` | `'linear' \| 'cubic' \| 'parametric'` |
| `KeyframeMotion` | `{ mode: 'linear' \| 'cubic', times: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number> }` |
| `ParametricMotion` | `{ mode: 'parametric', centerX: number, centerY: number, amplitudeX: number, amplitudeY: number, periodMs: number, phaseMs: number, exponent: number }` |
| `MotionTrack` | `KeyframeMotion \| ParametricMotion` (an input description only; copied into flat storage and not retained) |

## KinematicState (plain mutable record, no class)

| Field | Type | Notes |
|---|---|---|
| `compositor` | `CompositorState` | Held by reference |
| `maxTracks` | `number` | Positive integer, fixed at creation |
| `maxKeyframes` | `number` | Positive integer, fixed at creation |
| `trackLayer` | `Int32Array` | Length `maxTracks`; bound `LayerId`, or `-1` when free |
| `trackMode` | `Uint8Array` | Length `maxTracks`; `0` linear, `1` cubic, `2` parametric (meaningful only when occupied) |
| `trackLength` | `Int32Array` | Length `maxTracks`; keyframe count for keyframe modes, `0` otherwise |
| `times` | `Float64Array` | Length `maxTracks * maxKeyframes`; track `t` uses `[t * maxKeyframes, t * maxKeyframes + trackLength[t])` |
| `xs` | `Float64Array` | Same layout as `times` |
| `ys` | `Float64Array` | Same layout as `times` |
| `params` | `Float64Array` | Length `maxTracks * 7`; track `t` uses `[7t, 7t + 7)` as `centerX, centerY, amplitudeX, amplitudeY, periodMs, phaseMs, exponent` |

Constant: `maxOffsetMagnitude = 16_777_216`.

## Validation rules (`addMotionTrack`)

All run before any mutation, in this order:

1. `motion.mode` is `'linear'`, `'cubic'`, or `'parametric'`, otherwise `'invalid-motion'`.
2. Keyframe modes: `times.length === x.length === y.length`, `1 <= length <= maxKeyframes`; every time finite and strictly greater than the previous; every `x` and `y` finite with magnitude `<= 16_777_216`; otherwise `'invalid-motion'`.
3. Parametric mode: all seven parameters finite; `periodMs > 0`; `exponent` an integer `>= 1`; `|centerX| + |amplitudeX| <= 16_777_216` and the same for Y; otherwise `'invalid-motion'`.
4. `layerId` is an integer in `[0, compositor.maxLayers)` and `compositor.layers[layerId] !== null`, otherwise `'unknown-layer'`.
5. No existing track has `trackLayer === layerId`, otherwise `'layer-already-driven'`.
6. At least one free track slot, otherwise `'capacity-exceeded'`.

Other validation:
- `createKinematicController`: `maxTracks` and `maxKeyframes` positive integers, otherwise `'invalid-dimensions'`.
- `removeTrack`: `trackId` integer in range with an occupied slot, otherwise `'unknown-track'`.
- `evaluateMotion`: `timeMs` finite, otherwise `'invalid-time'`, before any write.

## State transitions

```text
track slot free (trackLayer = -1)
  -- addMotionTrack(layerId, motion) --> bound (keyframes or parameters copied in, mode stored)
bound
  -- evaluateMotion(timeMs) --> integer offset written to the layer (no controller state change)
  -- removeMotionTrack      --> free (trackLength = 0, trackLayer = -1)
```

## Evaluation rules

For a keyframe track with keyframes `(t[0], p[0]) ... (t[n-1], p[n-1])` (separately for X and Y), `timeMs <= t[0]` gives `p[0]` and `timeMs >= t[n-1]` gives `p[n-1]`; otherwise for the segment `t[k] <= timeMs < t[k+1]` with `h = t[k+1] - t[k]` and `u = (timeMs - t[k]) / h`:

```text
linear: p[k] + (p[k+1] - p[k]) * u
cubic:  h00(u) p[k] + h10(u) h m[k] + h01(u) p[k+1] + h11(u) h m[k+1]
        h00 = 2u^3 - 3u^2 + 1   h10 = u^3 - 2u^2 + u   h01 = -2u^3 + 3u^2   h11 = u^3 - u^2
        m[k]   = (p[k+1] - p[k-1]) / (t[k+1] - t[k-1])   for 0 < k < n-1
        m[0]   = (p[1] - p[0]) / (t[1] - t[0])
        m[n-1] = (p[n-1] - p[n-2]) / (t[n-1] - t[n-2])
```

A single keyframe is constant. For a parametric track, per axis, for all `timeMs`:

```text
offset = center + amplitude * (2 * cos(PI * (timeMs - phaseMs) / periodMs) ^ (2 * exponent) - 1)
```

Finally each axis is `Math.round`-ed and applied with `setLayerOffset(compositor, layerId, x, y)`.
