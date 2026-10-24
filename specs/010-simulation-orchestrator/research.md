# Research: Simulation Orchestrator

## R1: What the orchestrator is

- **Decision**: A composition module with two functions that matter, `createEngine` and `tick`, plus `destroyEngine`. It holds the five sub-states in a plain record and contains no pixel or time math.
- **Rationale**: Every stage already exists as a pure function over a plain state record (Principle I, II). Putting more logic here would duplicate them; leaving it as a pure sequencer means the zero-allocation property is inherited and the module cannot drift from the sub-modules' behavior.
- **Alternatives**: A class `Engine` with methods (forbidden by Principle I); a pipeline framework with registered stages (speculative extensibility, forbidden by Principle VII); folding the stages into one fused loop (breaks module boundaries and duplicates logic).

## R2: Order of stages in a tick

- **Decision**: `evaluate(temporal)` -> `evaluateMotion(kinematic)` -> `compose(compositor)` -> `processFrame(noise, composed)` -> `updateBuffer(renderer, processed)`.
- **Rationale**: Temporal weights and kinematic offsets are both written into the compositor's arrays and both read by `compose`, so they must run before it; the two are independent of each other, so their order does not change the result. Noise reads the composed output, and the renderer reads the noise output, so those follow in data order. This is exactly the "Intended use" sequence in the noise-controller contract.
- **Alternatives**: Kinematic before temporal (same result, no benefit); presenting the composed frame and skipping noise when it is off (the noise path with dose `Infinity` is a single table lookup per pixel, and a branch would complicate the contract for no gain).

## R3: Single source of time

- **Decision**: `tick(engine, timeMs)` takes one finite number and passes the same value to both controllers. The orchestrator stores no time, no previous time, and no delta.
- **Rationale**: Both controllers are already stateless in time (pure functions of `timeMs`), which gives scrubbing, seeking, and looping for free and keeps the requirement of a "global time". A playback model belongs to the UI layer that owns `requestAnimationFrame`.
- **Alternatives**: Storing a clock and advancing by a delta (adds state, breaks scrubbing, reads a clock); separate times per controller (defeats "global time").

## R4: Validating time in the orchestrator

- **Decision**: `tick` checks `Number.isFinite(timeMs)` first and throws `SimulationError('invalid-time')`. After that, nothing in the pipeline can throw for an engine built by `createEngine`.
- **Rationale**: `evaluate` throws on a bad time before mutating, but if it passed and `evaluateMotion` then threw (it would not today, but could if the two validations diverged), the compositor would hold new weights and old offsets. One check at the top makes the whole tick all-or-nothing. After that point the image sizes match by construction (all three sized from the compositor), so `processFrame` and `updateBuffer` cannot reject.
- **Alternatives**: Relying on the sub-module checks (error type depends on which stage notices first); wrapping in try/catch (hides errors and costs in the hot path).

## R5: Engine options and creation order

- **Decision**: `createEngine(options: EngineOptions): Promise<EngineState>` with `{ width, height, maxLayers, maxTracks?, maxKeyframes?, viewportWidth?, viewportHeight?, noise? }`. Create the compositor, then the temporal and kinematic controllers (bound to it), then the noise controller, then `await createRenderer(viewportWidth ?? width, viewportHeight ?? height)` last. Defaults: `maxTracks = maxLayers`, `maxKeyframes = 16`.
- **Rationale**: The synchronous creators throw before allocating anything outside typed arrays, so failing there leaks no canvas resource; the renderer is the only resource needing explicit teardown, so creating it last means a thrown error never needs cleanup. The renderer's image size comes from the first `updateBuffer`, and its viewport is independent of the image size, hence the optional viewport fields. Validation is delegated: each creator already validates its own arguments with a precise error reason, and passing those errors through unchanged avoids a second, divergent set of checks (Principle VII).
- **Alternatives**: Validating everything in the orchestrator first (duplicates rules); creating the renderer first and cleaning up on failure (needs try/catch and teardown logic); a synchronous `createEngine` taking an existing renderer (see R6).

## R6: Why `createEngine` is async

- **Decision**: Accept that `createEngine` returns a promise because `createRenderer` is async.
- **Rationale**: The requirement is that the engine "initializes and holds" the headless renderer. The renderer's `createRenderer` is the existing contract and is async. The cost is one `await` at startup and none in the loop.
- **Alternatives**: Caller-provided renderer (changes ownership, `destroyEngine` would then not own it); changing `createRenderer` to sync (touches a finished module for no real reason).

## R7: What `tick` returns

- **Decision**: Return the processed `GrayscaleImage` that `processFrame` returns (`engine.noise.output`), the same instance on every call.
- **Rationale**: The brief says to "expose the final buffer for rendering". Returning an existing reference costs nothing and lets a caller hand the buffer to a worker or other consumer, while the engine's own renderer has already been updated. The identity is stable, so it is safe to cache.
- **Alternatives**: Returning `void` and requiring `engine.noise.output` (one more thing to know); returning a result object (an allocation per tick, forbidden).

## R8: Zero-allocation audit of each stage

- **Decision**: Treat the zero-allocation property of the existing functions as established and verify it again end to end with a benchmark. Specific checks of each callee as of this plan:
  - `evaluate`, `evaluateMotion`: indexed loops over typed arrays; `setLayerWeight` and `setLayerOffset` run `assertOccupied`/validation with no allocation; the `throw` statements are only on failure paths.
  - `compose`: destructures state, fills the accumulator, plain loops.
  - `processFrame`: allocation-free by its own benchmark.
  - `updateBuffer`: `validateImage` allocates nothing; the existing `ImageState` is reused when size is unchanged; `render` uses stored contexts only.
- **Rationale**: The orchestrator's own code is an ordered list of calls with existing references and one number. Object destructuring or a spread in `tick` would risk allocation, so `tick` reads fields as plain property accesses.
- **Alternatives**: Re-implementing stages inline (duplication); accepting allocation and relying on the GC (violates Principle I).

## R9: Native canvas cost

- **Decision**: Document, do not hide: `putImageData` and `drawImage` inside `updateBuffer` may allocate natively, which JS heap statistics do not show. The benchmark measures JS heap only, and the time budget is calibrated on the whole tick including the renderer.
- **Rationale**: Principle VI requires flagging a roadblock rather than silently breaking a rule. The renderer is a finished, canvas-2D-based module (the project pivoted to Canvas 2D in feature 005), so the output path is fixed here. This is a limit of the measurement, not a violation by the orchestrator.
- **Alternatives**: Skipping the renderer in the benchmark (would hide the cost that matters to the frame budget); instrumenting native memory (not available in browser tests).

## R10: Testing and budgets

- **Decision**: Engine tests check wiring and creation errors (including that a failed creation leaves no renderer, tested by an invalid noise option). Tick tests use tiny images (for example 4x1) with hand-computed expectations: weight interpolation, a one-pixel shift, both tracks together, identical frames for equal times, backward time, non-finite time with no state change. An integration test reads the renderer surface through `readSurface` and compares it with the returned image. A benchmark on a 512x512 four-layer engine measures a batch to calibrate a per-frame budget (initial 8 ms) and asserts heap growth under 100 KB against an allocating control, with a warm-up.
- **Rationale**: Principle IV; hand-computed bytes keep the tests honest and follow the pattern of the sibling modules.
- **Alternatives**: Mocking the sub-modules (forbidden); only asserting sub-module behavior (would not prove the sequencing).
