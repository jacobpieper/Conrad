# Research: Temporal Controller

## R1: Clock ownership

- **Decision**: The controller never reads a clock. `evaluate(state, timeMs)` takes the time as an argument.
- **Rationale**: The requirement is an "external global clock". Passing time in keeps evaluation pure, deterministic, and testable, supports pausing, scrubbing, and fixed-step simulation, and works in workers.
- **Alternatives**: Reading `performance.now()` internally (hidden state, untestable); a clock object or subscription (stateful class and indirection, forbidden by Principles I and VII).

## R2: Curve model

- **Decision**: Piecewise-linear keyframes `(time, weight)` per track, clamped to the first and last keyframe outside the range.
- **Rationale**: Wash-in is a rise and wash-out is a decay; a handful of keyframes captures both and any measured curve. Interpolation is cheap and branch-light. Clamping avoids extrapolating past the data and keeps weights within `[min, max]` of the keyframes.
- **Alternatives**: Parametric gamma-variate or exponential models (fewer inputs but fixed shapes, extra math, and extra validation); cubic splines (more state, overshoot below 0); easing function registry (extensibility layer, forbidden by Principle VII).

## R3: Storage layout

- **Decision**: Flat arrays sized at creation: `trackLayer: Int32Array(maxTracks)` (`-1` when free), `trackLength: Int32Array(maxTracks)`, `times: Float64Array(maxTracks * maxKeyframes)`, `values: Float64Array(maxTracks * maxKeyframes)`. Track `t` owns the range starting at `t * maxKeyframes`.
- **Rationale**: Contiguous, cache-friendly, transferable buffers, and no per-track objects (Principle I). `Float64Array` avoids precision loss for millisecond times (Float32 loses sub-millisecond precision beyond about 2^24 ms).
- **Alternatives**: An array of track objects (OOP-style entities, allocations); a single interleaved array (harder to validate and read, no benefit at this size).

## R3b: Track table lifecycle

- **Decision**: Fixed `maxTracks`; a `TrackId` is the slot index; `addTrack` takes the lowest free slot by indexed scan; `removeTrack` sets `trackLayer[id] = -1` and `trackLength[id] = 0`.
- **Rationale**: Same pattern as the compositor's layer table; no growth and no free list.
- **Alternatives**: A growable list (allocates); a Map from layer to track (allocates, iterates poorly).

## R4: Segment search

- **Decision**: Linear scan over the track's keyframes per evaluation.
- **Rationale**: Keyframe counts are small (tens at most), so a scan is as fast as binary search in practice and simpler. It keeps evaluation stateless, so time may go backwards.
- **Alternatives**: Binary search (more code for negligible gain); caching the last segment (mutable per-track state, breaks statelessness and scrubbing).

## R5: Writing weights

- **Decision**: Call the compositor's public `setLayerWeight(compositor, layerId, weight)` for each active track.
- **Rationale**: Reuses its weight validation and keeps the compositor as the only writer of its own state. It allocates nothing on the success path.
- **Alternatives**: Writing `compositor.weights[layerId]` directly (faster by a negligible amount, bypasses validation and the module boundary).

## R6: Layer-binding rules

- **Decision**: `addTrack` requires the layer to be registered at that moment (`compositor.layers[id] !== null`) and not already bound to another track. A removed or unregistered layer is the caller's responsibility.
- **Rationale**: One track per layer avoids ambiguous last-writer-wins behavior. Checking registration at add time catches typos early; later unregistration is surfaced by the compositor's own `'unknown-layer'` error during evaluation (fail fast, Principle VII).
- **Alternatives**: Silently skipping dead layers (hides bugs and forbidden heuristics); re-validating every track before applying any update (an extra pass in the hot path for a rare caller error).

## R7: Validation

- **Decision**: Keyframes: `times.length === values.length`, `1 <= count <= maxKeyframes`, times finite and strictly increasing, values finite and `>= 0` (the compositor's own weight rule). `timeMs` must be finite.
- **Rationale**: Strict ordering makes every segment well defined and avoids division by zero in interpolation. Rejecting invalid weights at registration avoids discovering them mid-frame.
- **Alternatives**: Sorting keyframes on input (hides mistakes); allowing equal times as step changes (division by zero and ambiguous value at the step).

## R8: Errors

- **Decision**: `TemporalError` with `reason`: `'invalid-dimensions' | 'invalid-keyframes' | 'unknown-layer' | 'layer-already-driven' | 'capacity-exceeded' | 'unknown-track' | 'invalid-time'`, thrown synchronously.
- **Rationale**: Same pattern as `CompositorError`, `RendererError`, and `ImageLoadError`. The error class carries no pixel state, so Principle I's no-classes rule does not apply.
- **Alternatives**: Reusing `CompositorError` (blurs module ownership).

## R9: Testing and budget

- **Decision**: Hand-computed values (`(0,0), (1000,1), (4000,0.2)` at `500`, `1000`, `2500`, below range, above range); an integration test composes a constant layer of value 100 at `500`, `1000`, and `4000` giving 50, 100, and 20; a benchmark with 8 tracks of 16 keyframes asserting a time budget (initial `1` ms) and heap growth under 100 KB against an allocating control.
- **Rationale**: Principle IV requires real buffers and proof of zero allocation.
- **Alternatives**: Allocation counting via instrumentation (not available in browser tests).
