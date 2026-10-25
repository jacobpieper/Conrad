# Research: Previous Frame State

## R1: Buffer type and size

- **Decision**: `previousFrame: Uint8ClampedArray` of length `width * height`, the same type and length as `GrayscaleImage.data` produced by `processFrame` (`engine.noise.output.data`).
- **Rationale**: `.set` between identical typed-array types is a straight native copy with no per-element conversion. The size equals the compositor's and noise controller's pixel count (the image resolution, independent of the renderer viewport). A plain typed array matches Principle I and stays transferable.
- **Alternatives**: A `GrayscaleImage` record `{ width, height, data }` (an extra object for no gain; dimensions already live on `engine.noise`); a `Uint8Array` (mismatched type would force per-element conversion in `.set`); a `Float32Array` for filter precision (4x memory, wrong format for the working pipeline, and speculative).

## R2: Where the buffer lives

- **Decision**: A new field `previousFrame` directly on `EngineState`, assigned once in `createEngine`.
- **Rationale**: Every stage already receives the engine or one of its states from `tick`; a top-level field is reachable without new plumbing. The engine already holds all cross-stage state.
- **Alternatives**: Inside `NoiseState` (couples frame history to one stage and a finished module); a separate module `frame-history` (a module for one array, over-engineered, Principle VII); a module-level global (forbidden, hidden state).

## R3: What to copy, and when

- **Decision**: In `tick`, after `updateBuffer(engine.renderer, processed)`, run `engine.previousFrame.set(processed.data)`, then return `processed`.
- **Rationale**: `processed` is the final frame, the same bytes the renderer receives. Copying last means every earlier stage in the next tick sees the previous final frame, and a thrown error in an earlier stage never leaves a half-updated history. The time check precedes everything, so an invalid time leaves the buffer untouched.
- **Alternatives**: Copy before `updateBuffer` (same bytes, but breaks the requested order for no gain); copy the composed pre-noise frame (needs a second buffer, and the request is for the final pixel data); swap two buffers by reference (the noise output is owned and reused by the noise controller, so swapping would mutate another module's state).

## R4: Why a copy and not an alias

- **Decision**: Always copy bytes; never point `previousFrame` at `noise.output.data`.
- **Rationale**: `processFrame` rewrites `noise.output.data` in place every tick. An alias would always equal the current frame and make a difference or filter stage compute against itself.
- **Alternatives**: Double-buffering the noise output (changes the noise controller's contract and the stable-identity guarantee of the returned image).

## R5: Zero-allocation audit of the copy

- **Decision**: Use `engine.previousFrame.set(processed.data)` with no offset and no intermediate view.
- **Rationale**: `.set` with a typed-array source of the same element type copies bytes in native code and allocates no JS object. Calling `.subarray()`, `.slice()`, or spreading would allocate and is avoided. Both arrays are the same length by construction, so `.set` cannot throw a `RangeError`.
- **Alternatives**: A manual `for` loop (slower than the native copy, more code); `copyWithin` (same array only); `structuredClone` or `new Uint8ClampedArray(...)` per tick (allocates).

## R6: Initial contents

- **Decision**: Zero-filled at creation (the default for a new typed array); no history flag.
- **Rationale**: Zero is a valid "black" frame and the natural start for IIR and subtraction math. A flag would be speculative (Principle VII).
- **Alternatives**: Prime the buffer with the first real frame (needs a branch in the hot path and ordering rules); a `hasHistory` boolean (extra state, no current consumer).

## R7: Creation order

- **Decision**: Allocate `previousFrame` after the compositor, controllers, and noise controller are created, and before the `await createRenderer`.
- **Rationale**: Its length is `options.width * options.height`, which is validated by `createCompositor` first, so an invalid size is rejected with the existing `CompositorError` before an allocation of invalid length is attempted. Allocating before the renderer keeps the rule that the renderer is the last, only resource needing teardown. Use `compositor.width * compositor.height` (or `noise.pixelCount`) rather than re-reading options.
- **Alternatives**: Allocate first from options (could throw a raw `RangeError` for bad sizes instead of the sub-module error); allocate after the renderer (an allocation failure would leak the canvas).

## R8: Time budget

- **Decision**: Keep the existing 5 ms per-tick assertion in `tick.bench.ts`; no new threshold.
- **Rationale**: The 512x512 benchmark measured about 3.51 ms per tick. A 256 KB copy is tiny against that (native copy bandwidth is many GB/s), so the headroom to 5 ms is preserved. The benchmark remeasures with the copy included.
- **Alternatives**: A separate micro-benchmark of the copy alone (added surface, same information).
