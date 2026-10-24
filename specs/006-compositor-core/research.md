# Research: Compositor Core

## R1: State shape and the "controller"

- **Decision**: Plain `CompositorState` record plus free functions (`createCompositor`, `registerLayer`, `unregisterLayer`, `setLayerWeight`, `setLayerActive`, `compose`). No `LayerController` class.
- **Rationale**: Constitution I forbids stateful objects with methods for pixel and simulation state, and Principle VII forbids abstract layers. The renderer and loader modules already use this style.
- **Alternatives**: A class with methods (forbidden); module-level singleton state (breaks independent instances).

## R2: Fixed-capacity layer table

- **Decision**: `maxLayers` fixed at creation; slots are `LayerPixels | null` in a pre-sized array, with `weights: Float32Array(maxLayers)` and `active: Uint8Array(maxLayers)`. A `LayerId` is the slot index. `registerLayer` takes the lowest free slot by linear scan; `unregisterLayer` nulls the slot and clears its flags.
- **Rationale**: Registration, removal, and composition never grow arrays or allocate; a linear scan over a small capacity is simpler than a free list. Stale ids are caught because freed slots are `null`.
- **Alternatives**: A growable array (allocates and complicates the hot path); a Map keyed by id (allocation and iteration cost); a free list (more state for no measurable gain at small `maxLayers`).

## R3: Layer input type

- **Decision**: `LayerPixels = Uint8Array | Uint8ClampedArray`, held by reference.
- **Rationale**: The request names `Uint8Array`, while the upstream loader produces `Uint8ClampedArray`; reading either yields the same bytes. Referencing avoids copying every layer (Principle I) and lets callers update a layer in place.
- **Alternatives**: `Uint8Array` only (forces a copy of every loader result); `Uint8ClampedArray` only (contradicts the request); copying into owned storage (extra memory and an upload cost per change).

## R4: Accumulation loop

- **Decision**: Layer-major: `accumulator.fill(0)`, then for each active layer `for (i...) accumulator[i] += weight * pixels[i]`, then `for (i...) output[i] = accumulator[i]`. Plain indexed loops only.
- **Rationale**: Layer-major streams one source array at a time (sequential access, easy for the JIT to vectorize) and keeps the weight in a register. Pixel-major would index every layer per pixel. `fill`, indexed loops, and typed-array stores allocate nothing.
- **Alternatives**: Pixel-major (worse locality, nested array lookups); `forEach` or `reduce` (closures, not allowed in hot paths).

## R5: Clamping

- **Decision**: Rely on `Uint8ClampedArray` assignment for rounding (to nearest, ties to even) and clamping to 0-255; NaN becomes 0.
- **Rationale**: It is native, branch-free in the loop, and matches the request. Weights and layer bytes are always finite, so NaN cannot occur.
- **Alternatives**: Manual `Math.min/Math.max/Math.round` (slower, redundant).

## R6: Output ownership

- **Decision**: The state owns a pre-allocated `output: GrayscaleImage` and `compose(state)` returns it.
- **Rationale**: Gives zero allocation per call and a value that goes straight into `updateBuffer`, which does not retain `data`. Differs from `grayscale-blending`, which accepts an optional `out`, because here the state already owns every other buffer.
- **Alternatives**: Caller-provided `out` (an extra parameter and length checks with no benefit); returning a fresh array (allocates).

## R7: Weight validation

- **Decision**: Weights must be finite and `>= 0`, stored in a `Float32Array`; values above 1 are allowed.
- **Rationale**: "Attenuation weight" implies non-negative scaling; the final clamp bounds any overflow. Rejecting NaN and infinity keeps the loop free of non-finite values.
- **Alternatives**: Restrict to `[0, 1]` (blocks legitimate gain, such as compensating for several dim layers); allow negatives (subtraction already exists in `grayscale-blending`).

## R8: Errors

- **Decision**: `CompositorError` with `reason`: `'invalid-dimensions' | 'invalid-layer' | 'invalid-weight' | 'capacity-exceeded' | 'unknown-layer'`, thrown synchronously before any mutation.
- **Rationale**: Mirrors `RendererError` and `ImageLoadError`; fail-fast per Principle VII. The error class carries no pixel state, so Principle I's no-classes rule does not apply.
- **Alternatives**: Result tuples or boolean returns (not the project's convention).

## R9: Testing and budget

- **Decision**: Unit tests assert exact bytes for hand-computed sums, rounding, clamping, empty and inactive cases; the benchmark uses 8 layers at 512x512, flushes nothing (pure CPU), asserts a time budget, and asserts heap growth under 100 KB over repeated calls with an allocating control, as in the renderer benchmark.
- **Rationale**: Principle IV requires real buffers and proof of zero allocation.
- **Alternatives**: Allocation counting via instrumentation (not available in browser tests).
