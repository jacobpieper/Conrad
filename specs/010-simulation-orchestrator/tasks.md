---

description: "Task list for simulation-orchestrator"
---

# Tasks: Simulation Orchestrator

**Input**: Design documents from `/specs/010-simulation-orchestrator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/simulation-orchestrator-api.md, quickstart.md; composes `src/core/compositor-core`, `src/core/temporal-controller`, `src/core/kinematic-controller`, `src/core/noise-controller`, and `src/core/headless-renderer` (all unchanged).

**Tests**: Included. The spec (SC-001 to SC-004) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero JS heap allocation.

**Organization**: Tasks are grouped by user story: US2 = Engine Creation and Teardown (P1), US1 = One Call Per Frame (P1), US3 = Zero Allocation Per Tick (P1). All three are P1; US2 comes first because `tick` cannot be exercised without a created engine, so US1 depends on US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, and always use `npx vitest run` (never watch mode or bare `npm test` without `run`)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)
- Hot path (`tick`): plain property reads and calls only; no destructuring, object or array literals, closures, spreads, iterators, array methods, template strings, `try`/`catch`, or `Math.random`
- Edit tools run in parallel with terminal commands when called in the same step, so run `git add` in a separate step after the file edits

---

## Phase 1: Setup

No new dependencies, configuration, or tooling are needed. The directories `src/core/simulation-orchestrator/` and `tests/unit/simulation-orchestrator/` are created by the tasks below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types used by all stories.

- [ ] T001 Create `src/core/simulation-orchestrator/types.ts` per data-model.md and the contract:
  - `EngineOptions = { width: number; height: number; maxLayers: number; maxTracks?: number; maxKeyframes?: number; viewportWidth?: number; viewportHeight?: number; noise?: NoiseOptions }` with defaults documented in one-line comments: `maxTracks` defaults to `maxLayers`, `maxKeyframes` to `16`, `viewportWidth` and `viewportHeight` to `width` and `height`
  - `EngineState` plain record (no class) with fields `compositor: CompositorState`, `temporal: TemporalState`, `kinematic: KinematicState`, `noise: NoiseState`, `renderer: RendererState` ("Fields are assigned once at creation and never replaced")
  - `SimulationErrorReason = 'invalid-time'` and `class SimulationError extends Error` with `readonly reason: SimulationErrorReason` and `name = 'SimulationError'` (same shape as `NoiseError` in `src/core/noise-controller/types.ts`)
  - Import the state types from `../compositor-core`, `../temporal-controller`, `../kinematic-controller`, `../noise-controller` (also `NoiseOptions`), and `../headless-renderer`, and `GrayscaleImage` from `../image-loader`; re-export the type `GrayscaleImage`

**Checkpoint**: Types compile (`npm run typecheck`).

---

## Phase 3: User Story 2 - Engine Creation and Teardown (Priority: P1) MVP

**Goal**: `createEngine(options)` builds and wires the five sub-states from one options record, rejects invalid options with the sub-module's own error and without leaving a canvas allocated, and `destroyEngine` tears down the renderer.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator/engine.test.ts` passes: wiring invariants, defaults, pass-through errors, no renderer canvas on failed creation, and teardown.

### Tests for User Story 2

- [ ] T002 [P] [US2] Create `tests/unit/simulation-orchestrator/engine.test.ts` (real states, no mocks) covering: a created engine has `compositor`, `temporal`, `kinematic`, `noise`, and `renderer`; `engine.temporal.compositor` and `engine.kinematic.compositor` are `engine.compositor` (same object); `engine.noise.width`, `height`, and `pixelCount` equal the compositor's; `engine.compositor.maxLayers` equals `maxLayers`; `maxTracks` defaults to `maxLayers` and `maxKeyframes` to `16` on both controllers (`temporal.maxTracks`, `kinematic.maxTracks`, `temporal.maxKeyframes`, `kinematic.maxKeyframes`) and explicit values are used when given; `engine.renderer.viewport` equals the image size by default and the given `viewportWidth` and `viewportHeight` when set; noise options are applied (`engine.noise.dose`, `window`, `level` equal the options); two engines share nothing (no common state object); engines the tests create are destroyed with `destroyEngine` in `afterEach`. Failure cases (each `await expect(createEngine(...)).rejects` with the exact error class and `reason`): `width` `0`, `-1`, `1.5` give `CompositorError` `'invalid-dimensions'`; `maxLayers` `0` gives `CompositorError` `'invalid-dimensions'`; `maxTracks` `0` and `maxKeyframes` `0` give `TemporalError` `'invalid-dimensions'`; `noise: { dose: -1 }` gives `NoiseError` `'invalid-dose'`; `viewportWidth: 0` gives `RendererError` `'invalid-viewport'`. SC-004: temporarily wrap `globalThis.OffscreenCanvas` in a counting subclass (restored in `afterEach`) and assert zero constructions after each rejected creation in this list, and exactly one construction (the surface; the staging canvas appears on the first `updateBuffer`) after one successful creation. `destroyEngine`: after it, `engine.renderer.surface.width` is `0` and `engine.renderer.image` is `null`

### Implementation for User Story 2

- [ ] T003 [US2] Create `src/core/simulation-orchestrator/engine.ts` with `async function createEngine(options: EngineOptions): Promise<EngineState>` and `function destroyEngine(engine: EngineState): void`: in this order, `createCompositor(width, height, maxLayers)`, `createTemporalController(compositor, maxTracks, maxKeyframes)`, `createKinematicController(compositor, maxTracks, maxKeyframes)`, `createNoiseController(width, height, options.noise)`, then `await createRenderer(options.viewportWidth ?? width, options.viewportHeight ?? height)` last, with `maxTracks = options.maxTracks ?? maxLayers` and `maxKeyframes = options.maxKeyframes ?? 16` (name the default as a module constant); do no validation of its own and no `try`/`catch` so sub-module errors pass through unchanged and the renderer is only created after every synchronous creator succeeded (FR-003, FR-009); return the five states in a plain record; `destroyEngine` calls `destroyRenderer(engine.renderer)` and nothing else; read `options` once and do not retain it (depends on T001)
- [ ] T004 [US2] Create `src/core/simulation-orchestrator/index.ts` exporting `createEngine`, `destroyEngine` from `./engine`, `SimulationError` from `./types`, and the types `EngineOptions`, `EngineState`, `SimulationErrorReason`, `GrayscaleImage` (after T003; `tick` is added in T009)
- [ ] T005 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator/engine.test.ts` and fix failures

**Checkpoint**: Engine creation and teardown are complete and independently testable (MVP).

---

## Phase 4: User Story 1 - One Call Per Frame (Priority: P1)

**Goal**: `tick(engine, timeMs)` validates time, runs temporal, kinematic, compose, noise, and renderer stages in order, and returns the processed image.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator` passes: hand-computed frames at known times, both tracks together, determinism and scrubbing, time validation with no mutation, noise and window/level, and renderer output.

### Tests for User Story 1

- [ ] T006 [P] [US1] Create `tests/unit/simulation-orchestrator/tick.test.ts` (real states, no mocks) using a 4x1 engine with `maxLayers` `2` and a layer `Uint8Array.from([0, 100, 200, 250])` registered at weight `1` through `registerLayer(engine.compositor, ...)`, with `destroyEngine` in `afterEach`: with no tracks and defaults `tick(engine, 0)` returns `[0, 100, 200, 250]` and `readSurface` (viewport equal to the image size, buffer `4 * 4` bytes) returns R = G = B equal to those bytes with alpha `255`; with `addTrack(engine.temporal, id, [0, 1000], [0, 1])` the frames at `0`, `500`, and `1000` ms are `[0, 0, 0, 0]`, `[0, 50, 100, 125]`, and `[0, 100, 200, 250]`; with `addMotionTrack(engine.kinematic, id, { mode: 'linear', times: [0, 1000], x: [0, 1], y: [0, 0] })` and no temporal track the frame at `1000` ms is `[0, 0, 100, 200]` (vacated column `0`) and at `0` ms is unchanged; with both tracks the frame at `500` ms is `[0, 0, 50, 100]` (weight `0.5`, offset `Math.round(0.5) = 1`) and at `1000` ms is `[0, 0, 100, 200]`; a layer with no temporal track keeps its registered weight and a layer with no kinematic track keeps its offset (two layers, one driven); a tick with no layers registered returns an all-zero frame (default identity window/level); determinism with noise off: ticking `500` twice gives identical bytes, ticking `1000` then `0` returns exactly the bytes of a fresh engine's `tick(0)`, and two engines with the same setup produce identical frames and share nothing; `tick` returns `engine.noise.output`; time validation: `NaN`, `Infinity`, and `-Infinity` throw `SimulationError` with `reason` `'invalid-time'`, and after a successful tick at `500` the copies of `compositor.weights`, `compositor.offsetsX`, `compositor.offsetsY`, and `noise.output.data` are unchanged after the failed tick; window/level and dose: `setWindowLevel(engine.noise, 100, 100)` is reflected in the next frame (bytes equal a standalone `processFrame` of `engine.compositor.output`), and with `noise: { window: 100, level: 100, dose: 500, seed: 2024 }` the tick result equals `processFrame(standalone, engine.compositor.output)` for a standalone `createNoiseController(4, 1, sameOptions)` and differs from the noise-free result somewhere; the frame is also presented to a canvas bound with `bindTarget(engine.renderer, new OffscreenCanvas(1, 1))` (read back with `getContext('2d').getImageData`)
- [ ] T007 [P] [US1] Create `tests/unit/simulation-orchestrator/integration.test.ts`: a 16x16 engine with four layers filled with distinct patterns (`(index * k) & 255` for `k` = `3`, `5`, `7`, `11`), a temporal track and a linear kinematic track on every layer (weights from `0` to `1` and `x` from `0` to `3`, `y` from `0` to `-2`, over `0..1000` ms), `window` `200`, `level` `128`, dose `1000`, seed `1`; compute the expected frame independently by running `evaluate`, `evaluateMotion`, `compose`, and `processFrame` by hand on a second identical set of states at `250`, `500`, and `750` ms and assert the engine's `tick` bytes are identical at each time in sequence, that every registered layer buffer is byte-identical before and after the ticks (same objects, same bytes), and that `readSurface` equals the returned bytes expanded to RGB with alpha `255`

### Implementation for User Story 1

- [ ] T008 [US1] Create `src/core/simulation-orchestrator/tick.ts` with `function tick(engine: EngineState, timeMs: number): GrayscaleImage`: if `!Number.isFinite(timeMs)` throw `new SimulationError('invalid-time', 'timeMs must be a finite number')` before any stage; then call, in this order and reading fields with plain property access (no destructuring), `evaluate(engine.temporal, timeMs)`, `evaluateMotion(engine.kinematic, timeMs)`, `const composed = compose(engine.compositor)`, `const processed = processFrame(engine.noise, composed)`, `updateBuffer(engine.renderer, processed)`, and `return processed`; no other statements, no `try`/`catch`, no allocation (FR-004 to FR-006) (depends on T001)
- [ ] T009 [US1] In `src/core/simulation-orchestrator/index.ts` add `tick` exported from `./tick` (after T004 and T008)
- [ ] T010 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator` and fix failures; if a stage cannot be sequenced without allocation or without breaking a constitution principle, halt and flag it (Principle VI)

**Checkpoint**: Engine creation and the frame loop work together.

---

## Phase 5: User Story 3 - Zero Allocation Per Tick (Priority: P1)

**Goal**: Prove `tick` creates no JS heap garbage and keeps every engine reference stable, within a calibrated time budget.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator/tick.bench.ts` passes: bounded heap growth against an allocating control, stable identities, and the per-frame time under budget.

### Tests for User Story 3

- [ ] T011 [P] [US3] Create `tests/unit/simulation-orchestrator/tick.bench.ts` modeled on `tests/unit/noise-controller/process.bench.ts` (`usedHeap` and `maxHeapGrowth` helpers over `performance.memory`) with a 512x512 engine of four layers (pixels `(index * k) & 255`), a temporal track and a linear kinematic track on every layer, `noise: { dose: 1000, window: 200, level: 128, seed: 1 }`, an initial `tick` before measuring, and `destroyEngine` in `afterAll`: time a batch of `20` ticks across rotating times and divide by the count, asserting the per-tick time is under the budget (initial value `8` ms, calibrate in T013 and record the measured figure and chosen budget in a one-line comment); before the heap measurement run a warm-up of `50` ticks, then assert heap growth over repeated ticks (`maxHeapGrowth(run, 3, 100)`) is `< 100_000` bytes while an allocating control (`new Array(1000).fill(0)` per iteration) is `> 100_000`; a separate test asserts that across many ticks the returned image, its `data`, and the five engine fields (`compositor`, `temporal`, `kinematic`, `noise`, `renderer`) are the same instances every time (US3/AC2)

### Implementation for User Story 3

- [ ] T012 [US3] Audit `src/core/simulation-orchestrator/tick.ts` by reading it: confirm it contains no destructuring, literals, closures, spreads, template strings, or helper calls beyond the five stage functions and `Number.isFinite`; fix any finding
- [ ] T013 [US3] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator/tick.bench.ts`, then calibrate the budget in `tests/unit/simulation-orchestrator/tick.bench.ts`: read the measured per-tick time (console output is not shown by the reporter, so temporarily assert `expect(perTick).toBe(-1)` to see the value in the failure message, then restore the real assertion), set a budget with wide headroom, and record the measured figure and the chosen budget in the one-line comment; keep the warm-up long enough that the heap test does not flake under the full suite; if heap growth cannot stay under the limit because of the stages themselves, halt and flag it rather than loosening the limit (Principle VI)

**Checkpoint**: All three stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T014 Run the full verification as three separate commands, each with the fnm prefix and no output piping: `npx vitest run`, then `npm run typecheck`, then `npm run lint`; resolve all errors; confirm all existing tests pass unchanged and that the new code has no semicolons, `any`, `@ts-ignore`, `Math.random`, or `console` calls; if the heap-growth benchmark flakes under the full suite, lengthen its warm-up rather than loosening the limit
- [ ] T015 Run the `quickstart.md` scenarios 1-13 and confirm each expected outcome
- [ ] T016 Commit per constitution V with Conventional Commits under 50 characters: `feat: add engine creation` after T005, `feat: add simulation tick` after T010, and `test: add tick benchmark` after T013

---

## Dependencies & Execution Order

- **Foundational (T001)** blocks all stories.
- **US2**: T002 (test) || T003; then T003 -> T004 -> T005 (T003 also depends on T001).
- **US1**: needs US2 (T003, T004); T006 and T007 are parallel with each other and with T008; T008 -> T009 -> T010 (T008 also depends on T001).
- **US3**: needs US1 (T008, T009); T011 || T012; T012 and T011 -> T013.
- **Polish** after all stories.

### Parallel Opportunities

- T002 || T003
- T006 || T007 || T008
- T011 || T012

### Parallel Example

```text
Task: "Create tests/unit/simulation-orchestrator/tick.test.ts" (T006)
Task: "Create tests/unit/simulation-orchestrator/integration.test.ts" (T007)
Task: "Create src/core/simulation-orchestrator/tick.ts" (T008)
```

## Implementation Strategy

### MVP First

1. Foundational: T001
2. US2 (T002-T005): a wired, creatable, destroyable engine
3. US1 (T006-T010): the frame loop, validated with hand-computed frames; stop and validate, then commit

### Incremental Delivery

1. Add US3 (T011-T013) and validate the heap and time budget with the renderer included
2. Polish (T014-T016) and commit
