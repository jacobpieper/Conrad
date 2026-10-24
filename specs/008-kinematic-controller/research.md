# Research: Kinematic Controller

## R1: Storing and applying offsets in the compositor

- **Decision**: Add `offsetsX: Int32Array(maxLayers)` and `offsetsY: Int32Array(maxLayers)` to `CompositorState`, allocated in `createCompositor`, zero by default, reset by `unregisterLayer`, set via `setLayerOffset(state, id, x, y)` (validates the layer is registered and both values are integers within the int32 range).
- **Rationale**: Same flat, per-slot layout as `weights` and `active` (Principle I); `Int32Array` enforces exact integers; a function keeps validation in one place.
- **Alternatives**: A packed interleaved array (harder to read, no gain); `Float32Array` (would permit fractional values and invite sub-pixel handling, which is out of scope); storing offsets in the controller (the compositor could not compose without it).

## R2: Shifted accumulation without copies

- **Decision**: For each active layer with offset `(dx, dy)`, output row `y` reads source row `sy = y - dy` and is skipped unless `0 <= sy < height`. The valid output columns are `xStart = max(0, dx)` to `xEnd = min(width, width + dx)` (exclusive); skip the row if `xStart >= xEnd`. Inner loop: `acc[y * width + x] += weight * pixels[sy * width + (x - dx)]`.
- **Rationale**: Pure index arithmetic on the original buffer: nothing is copied or mutated. Skipping out-of-range pixels is exactly "0 attenuation" because the accumulator already holds 0 there. Row-wise bounds avoid a per-pixel range check in the inner loop. Offsets of magnitude at least the image size make the range empty, so they cost nothing.
- **Alternatives**: Per-pixel bounds checks (slower, branchy); copying a shifted layer into scratch (violates "never copied" and costs memory); reading padded buffers (needs layer copies).

## R3: Offset semantics

- **Decision**: Output `(x, y)` shows source `(x - dx, y - dy)`: positive `dx` moves content right, positive `dy` moves it down. Offset `(0, 0)` is the identity.
- **Rationale**: Matches the top-left-origin screen convention in the constitution and the intuitive meaning of "offset of the layer".
- **Alternatives**: The opposite sign (reads as "camera" movement and surprises users).

## R4: Controller structure

- **Decision**: A new module `kinematic-controller` mirrors `temporal-controller`: plain `KinematicState` record, fixed `maxTracks` and `maxKeyframes`, `TrackId` as slot index, `trackLayer: Int32Array` with `-1` for free slots, one track per layer, free functions `createKinematicController`, `addMotionTrack`, `removeMotionTrack`, `evaluateMotion`.
- **Rationale**: Reuses a design already validated against the constitution and the project's style; the user asked for it explicitly. `Motion`-qualified names avoid import collisions with the temporal controller.
- **Alternatives**: Extending `temporal-controller` with offset channels (mixes two concerns and grows one module); a generic controller framework (forbidden by Principle VII).

## R5: Track input shape and mode selection

- **Decision**: `addMotionTrack(state, layerId, motion)` takes a discriminated union: `{ mode: 'linear' | 'cubic', times, x, y }` or `{ mode: 'parametric', centerX, centerY, amplitudeX, amplitudeY, periodMs, phaseMs, exponent }`. The mode is stored in a `Uint8Array` as a numeric code and evaluated with a `switch`. The input object is read once and not retained.
- **Rationale**: "Selectable interpolation" is one argument; the type system prevents mixing keyframes with parametric fields. The object is allocated by the caller during setup, not in any hot path.
- **Alternatives**: One `add*Track` function per mode (more API surface, same behavior); changing mode in place (needs mode-specific storage reuse and re-validation; deferred).

## R6: Keyframe storage

- **Decision**: `times`, `xs`, `ys` as `Float64Array(maxTracks * maxKeyframes)`; track `t` owns the range starting at `t * maxKeyframes`, with `trackLength[t]` entries. Parametric tracks store seven numbers in `params: Float64Array(maxTracks * 7)`: `centerX, centerY, amplitudeX, amplitudeY, periodMs, phaseMs, exponent`.
- **Rationale**: Same contiguous layout as the temporal controller (Principle I); `Float64Array` keeps millisecond times exact; a fixed stride avoids per-track objects.
- **Alternatives**: Separate X and Y tracks bound to one layer (doubles table use and complicates "one track per layer"); `Float32Array` (precision loss on times).

## R7: Linear mode

- **Decision**: Piecewise-linear interpolation of `x` and `y` over the same keyframe times; clamp to the first and last keyframe outside the range; a single keyframe is constant.
- **Rationale**: The baseline and cheapest mode; identical segment search to the temporal controller.
- **Alternatives**: Extrapolation (unbounded motion beyond data).

## R8: Cubic mode

- **Decision**: Cubic Hermite interpolation per segment `[t_k, t_{k+1}]` with `h = t_{k+1} - t_k` and `u = (t - t_k) / h`: `p = h00 p_k + h10 h m_k + h01 p_{k+1} + h11 h m_{k+1}`, with the standard Hermite basis. Tangents are Catmull-Rom finite differences for non-uniform times: interior `m_k = (p_{k+1} - p_{k-1}) / (t_{k+1} - t_{k-1})`; ends use the one-sided difference. Tangents are computed on the fly, so nothing is precomputed or stored. Two keyframes reduce to linear.
- **Rationale**: A genuine cubic spline (C1 continuous, passes through the keyframes), local support, no matrix solve, no scratch memory, and no state: it fits the zero-allocation, stateless constraint and handles non-uniform times. Hand check: keyframes `(0,0),(1000,10),(2000,0)` at `500` give `0.5*0 + 0.125*1000*0.01 + 0.5*10 + (-0.125)*1000*0 = 6.25`.
- **Alternatives**: Natural cubic spline (C2, needs a tridiagonal solve and scratch arrays at registration; deferred); monotone cubic (PCHIP, prevents overshoot but adds tangent limiting; deferred); uniform Catmull-Rom (wrong for non-uniform times).

## R9: Parametric sine/respiratory mode

- **Decision**: Per axis, `offset(t) = center + amplitude * (2 * cos(pi * (t - phaseMs) / periodMs)^(2 * exponent) - 1)`, with `periodMs > 0` and `exponent` a positive integer. It is periodic in `t`, defined for all times, and equals `center + amplitude` at `t = phaseMs`.
- **Rationale**: With `exponent = 1` it is exactly `center + amplitude * cos(2 * pi * (t - phaseMs) / periodMs)`, a pure sinusoid. Larger exponents produce the Lujan-style `cos^(2n)` model of breathing: a sharper inhale and a longer end-expiration plateau. One formula therefore covers both "sine" and "respiratory" with two shared parameters per axis and an even integer power, which avoids NaN from negative bases. Hand checks (center 0, amplitude 10, period 4000): exponent 1 gives `10, 0, -10, 10` at `0, 1000, 2000, 4000`; exponent 2 gives `-5` at `1000` (`cos^4(pi/4) = 0.25`, so `2 * 0.25 - 1 = -0.5`).
- **Alternatives**: Separate `sine` and `respiratory` modes (duplicate code for one special case); real-valued exponents (NaN for negative cosines); Fourier-series modes (more parameters and storage, not requested).

## R10: Rounding and range limits

- **Decision**: `Math.round(position)` per axis (nearest; ties toward positive infinity). Keyframe values must have magnitude at most `16_777_216` (2^24), and `|center| + |amplitude| <= 16_777_216` per axis.
- **Rationale**: Offsets must be integers for the compositor and no sub-pixel blending is allowed. Hermite overshoot with finite-difference tangents is bounded by a small multiple of the input magnitude (well under 3x), so rounded results stay far inside int32 and `setLayerOffset` cannot reject a valid track at evaluation time.
- **Alternatives**: Truncation (biased toward zero); no limit (possible int32 wraparound or evaluation-time errors).

## R11: Writing offsets and error handling

- **Decision**: Call `setLayerOffset(compositor, layerId, x, y)` for each active track. `KinematicError` reasons: `'invalid-dimensions' | 'invalid-motion' | 'unknown-layer' | 'layer-already-driven' | 'capacity-exceeded' | 'unknown-track' | 'invalid-time'`, thrown synchronously before mutation, except that `CompositorError('unknown-layer')` propagates from `setLayerOffset` if a tracked layer was unregistered.
- **Rationale**: The compositor stays the only writer of its state and keeps its validation; same error style as the other modules and the same documented exception as the temporal controller (Principle VII, fail fast).
- **Alternatives**: Writing `compositor.offsetsX` directly (bypasses validation); silently skipping dead layers (forbidden heuristics).

## R12: Testing and budgets

- **Decision**: Compositor tests cover every worked example in the spec plus buffer-identity checks (same array object, bytes unchanged) and offset validation; controller tests assert exact integers for each mode at the spec's times; integration compose tests assert the composed bytes; two benchmarks (compose with offsets, evaluate with mixed modes) assert time budgets measured over batches and heap growth under 100 KB against an allocating control, with a warm-up before heap measurement (as learned in the temporal benchmark).
- **Rationale**: Principle IV; real buffers, no mocks.
- **Alternatives**: Allocation counting via instrumentation (not available in browser tests).
