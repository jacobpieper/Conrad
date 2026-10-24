---

description: "Task list for kinematic-controller"
---

# Tasks: Kinematic Controller

**Input**: Design documents from `/specs/008-kinematic-controller/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/compositor-offsets-api.md, contracts/kinematic-controller-api.md, quickstart.md; modifies the existing `src/core/compositor-core` additively and mirrors `src/core/temporal-controller`.

**Tests**: Included. The spec (SC-001 to SC-004) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and benchmarks proving zero allocation.

**Organization**: Tasks are grouped by user story: US1 = Layer Spatial Offsets in the Compositor (P1), US2 = Motion Tracks (P2), US3 = Path Evaluation (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, and always use `npx vitest run` (never watch mode or bare `npm test` without `run`)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)
- Hot paths (`compose`, `evaluateMotion`): plain indexed loops only; no iterators, closures, spreads, array methods, or object and array literals

---

## Phase 1: Setup

No new dependencies, configuration, or tooling are needed. The directories `src/core/kinematic-controller/` and `tests/unit/kinematic-controller/` are created by the tasks below.

---

## Phase 2: Foundational

No blocking prerequisites beyond the existing modules. US1 (compositor offsets) is the dependency of US3; US2 (track table) depends only on the existing compositor and may run in parallel with US1.

---

## Phase 3: User Story 1 - Layer Spatial Offsets in the Compositor (Priority: P1) MVP

**Goal**: `compositor-core` stores integer X/Y offsets per layer and `compose` shifts read indices, treating out-of-bounds source coordinates as 0 attenuation, without copying or mutating layers.

**Independent Test**: `npx vitest run tests/unit/compositor-core` passes: the worked examples compose to the stated bytes, `(0, 0)` offsets behave as before, and every existing compositor test still passes unchanged.

### Tests for User Story 1

- [X] T001 [P] [US1] Create `tests/unit/compositor-core/offsets.test.ts` (real typed arrays, no mocks) covering: compose results at weight 1 for `[10, 20, 30]` (3x1) at `(1, 0)` gives `[0, 10, 20]` and at `(-1, 0)` gives `[20, 30, 0]`; `[1, 2, 3, 4]` (2x2) at `(1, 1)` gives `[0, 0, 0, 1]`, at `(0, 1)` gives `[0, 0, 1, 2]`, and at `(2, 0)`, `(0, -2)`, `(2147483647, 0)`, and `(0, -2147483648)` gives `[0, 0, 0, 0]`; a rectangular 3x2 layer shifted in both axes (hand-computed bytes); `(0, 0)` composes exactly as without offsets (compare against bytes computed before `setLayerOffset`); several layers with different offsets and weights sum, round, and clamp correctly (including a sum above 255); an inactive layer ignores its offset; `offsetsX` and `offsetsY` are `0` for a new layer and `0` again after `unregisterLayer` with the slot reused by the next `registerLayer`; buffer identity: after `compose` with offsets each `state.layers[id]` is the same object as registered and its bytes equal a copy taken beforehand; `compose` still returns the same reusable `GrayscaleImage`; validation with exact reasons and unchanged state (snapshot `offsetsX`, `offsetsY`, `weights`, `active`): x or y of `1.5`, `NaN`, `Infinity`, `-Infinity`, `2147483648`, `-2147483649` give `'invalid-offset'`, ids `-1`, `1.5`, `maxLayers`, and a free slot give `'unknown-layer'`; two compositors share nothing

### Implementation for User Story 1

- [X] T002 [US1] In `src/core/compositor-core/types.ts` add to `CompositorState` the fields `offsetsX: Int32Array` ("Length `maxLayers`; integer X offset per slot, `0` by default and after `unregisterLayer`; positive moves content right") and `offsetsY: Int32Array` ("Length `maxLayers`; integer Y offset per slot, `0` by default and after `unregisterLayer`; positive moves content down"), and add `'invalid-offset'` to `CompositorErrorReason`
- [X] T003 [US1] In `src/core/compositor-core/layers.ts`: allocate `offsetsX` and `offsetsY` as `new Int32Array(maxLayers)` in `createCompositor`; set both to `0` for the slot in `unregisterLayer`; add `setLayerOffset(state, id, x, y)` that calls the existing `assertOccupied(state, id)` (`'unknown-layer'`), then requires both `x` and `y` to satisfy `Number.isInteger` and lie within `[-2147483648, 2147483647]` (else `CompositorError('invalid-offset', ...)`), all before any mutation, then writes `state.offsetsX[id]` and `state.offsetsY[id]` (depends on T002)
- [X] T004 [US1] In `src/core/compositor-core/compose.ts` replace the flat accumulation with the row-wise shifted loop per research.md R2: for each active slot read `weight`, `pixels`, `dx = offsetsX[slot]`, `dy = offsetsY[slot]`; compute `xStart = max(0, dx)` and `xEnd = min(width, width + dx)` once, skip the layer if `xStart >= xEnd`; for each output row `y` with `0 <= y - dy < height` accumulate `acc[y * width + x] += weight * pixels[(y - dy) * width + (x - dx)]` for `x` from `xStart` to `xEnd - 1` (exclusive end); keep `accumulator.fill(0)` and the final round-and-clamp copy; pixels with no in-range source receive nothing from that layer; layers are only read, never mutated or copied; no allocation; compose results for `(0, 0)` offsets must be unchanged (depends on T002)
- [X] T005 [US1] In `src/core/compositor-core/index.ts` add `setLayerOffset` to the export from `./layers` (after T003)
- [X] T006 [US1] Extend `tests/unit/compositor-core/compose.bench.ts` with an offsets case: 8 layers at 512x512 with non-zero offsets (for example layer `i` at `(i * 7 - 20, i * 5 - 15)` set through `setLayerOffset`); assert one `compose` is under the existing 10 ms budget and that heap growth over repeated calls is `< 100_000` bytes against the existing allocating control, with a warm-up of a few thousand `compose` calls before the heap measurement (after T004 and T005)
- [X] T007 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/compositor-core` and fix failures; the existing compositor tests and benchmarks must pass unchanged; if the 10 ms budget is at risk, add a zero-offset flat fast path in `compose.ts` (research.md and plan.md flag 9) and re-run

**Checkpoint**: Compositor offsets work and are independently testable (MVP).

---

## Phase 4: User Story 2 - Motion Tracks (Priority: P2)

**Goal**: Attach, store, and remove motion tracks of mode `linear`, `cubic`, or `parametric` for registered compositor layers, on a pre-allocated, fixed-capacity table.

**Independent Test**: `npx vitest run tests/unit/kinematic-controller/tracks.test.ts` passes: add and remove for each mode, slot reuse, and every rejection case leaves state unchanged.

### Tests for User Story 2

- [X] T008 [P] [US2] Create `tests/unit/kinematic-controller/tracks.test.ts` (real typed arrays and a real compositor from `src/core/compositor-core`, no mocks) covering: adding one track of each mode on three registered layers returns ids `0`, `1`, `2`; `trackLayer` holds the layer ids, `trackMode` holds `0`, `1`, `2`, `trackLength` holds the keyframe counts (`0` for parametric); keyframes are copied into `times`, `xs`, `ys` at `trackId * maxKeyframes` (accepting plain arrays and `Float64Array`); the seven parametric parameters are stored in `params` at `7 * trackId` in the order `centerX, centerY, amplitudeX, amplitudeY, periodMs, phaseMs, exponent`; inputs are not retained (mutating the arrays or the motion object afterwards does not change stored data); a single keyframe is accepted for `linear` and `cubic`; `removeMotionTrack` frees the slot (`trackLayer[id] === -1`, `trackLength[id] === 0`), the next `addMotionTrack` reuses the lowest free slot, and the removed id throws `'unknown-track'` until reused; rejections with exact reasons and unchanged state (snapshot all state arrays before and after): `createKinematicController` with `0`, `-1`, `1.5` for each of `maxTracks` and `maxKeyframes` gives `'invalid-dimensions'`; an unknown mode string, mismatched `times`, `x`, `y` lengths, empty keyframes, more than `maxKeyframes`, equal times, decreasing times, `NaN` or `Infinity` in times, x, or y, a value of magnitude `16_777_217`, parametric `periodMs` of `0` or negative, `NaN` in any parametric field, `exponent` of `0`, `-1`, `1.5`, and `|center| + |amplitude|` above `16_777_216` on either axis give `'invalid-motion'`; an unregistered layer, `-1`, `1.5`, and `maxLayers` as layer id give `'unknown-layer'`; a second track on an already driven layer gives `'layer-already-driven'`; a track beyond `maxTracks` gives `'capacity-exceeded'`; ids `-1`, `1.5`, `maxTracks`, and a free slot give `'unknown-track'` on `removeMotionTrack`; values exactly at `16_777_216` and `|center| + |amplitude| === 16_777_216` are accepted; two controllers on separate compositors share nothing

### Implementation for User Story 2

- [X] T009 [US2] Create `src/core/kinematic-controller/types.ts` per data-model.md and the contract: `TrackId = number` ("an integer slot index in `[0, maxTracks)`"); `InterpolationMode = 'linear' | 'cubic' | 'parametric'`; `KeyframeMotion` (`mode: 'linear' | 'cubic'`, `times`, `x`, `y` as `ArrayLike<number>`), `ParametricMotion` (`mode: 'parametric'`, `centerX`, `centerY`, `amplitudeX`, `amplitudeY`, `periodMs`, `phaseMs`, `exponent` as numbers), `MotionTrack = KeyframeMotion | ParametricMotion`; `KinematicState` plain record (no class) with fields `compositor: CompositorState` ("Held by reference"), `maxTracks` and `maxKeyframes` ("Positive integer, fixed at creation"), `trackLayer: Int32Array` ("Length `maxTracks`; bound `LayerId`, or `-1` when free"), `trackMode: Uint8Array` ("Length `maxTracks`; `0` linear, `1` cubic, `2` parametric"), `trackLength: Int32Array` ("Length `maxTracks`; keyframe count for keyframe modes, `0` otherwise"), `times`, `xs`, `ys: Float64Array` ("Length `maxTracks * maxKeyframes`; track `t` uses `[t * maxKeyframes, t * maxKeyframes + trackLength[t])`"), `params: Float64Array` ("Length `maxTracks * 7`; track `t` uses `[7t, 7t + 7)` as `centerX, centerY, amplitudeX, amplitudeY, periodMs, phaseMs, exponent`"); exported constants `maxOffsetMagnitude = 16_777_216`, `modeLinear = 0`, `modeCubic = 1`, `modeParametric = 2`, `paramStride = 7`; `KinematicErrorReason = 'invalid-dimensions' | 'invalid-motion' | 'unknown-layer' | 'layer-already-driven' | 'capacity-exceeded' | 'unknown-track' | 'invalid-time'` and `class KinematicError extends Error` with `readonly reason`, `name = 'KinematicError'` (same shape as `TemporalError` in `src/core/temporal-controller/types.ts`); re-export the types `CompositorState` and `LayerId` from `../compositor-core`
- [X] T010 [US2] Create `src/core/kinematic-controller/tracks.ts` with `createKinematicController(compositor, maxTracks, maxKeyframes)`: validate both are positive integers (else `KinematicError('invalid-dimensions')`), then allocate once: `trackLayer = new Int32Array(maxTracks).fill(-1)`, `trackMode = new Uint8Array(maxTracks)`, `trackLength = new Int32Array(maxTracks)`, `times`, `xs`, `ys` as `new Float64Array(maxTracks * maxKeyframes)`, `params = new Float64Array(maxTracks * paramStride)`; hold `compositor` by reference (depends on T009)
- [X] T011 [US2] In `src/core/kinematic-controller/tracks.ts` add `addMotionTrack(state, layerId, motion): TrackId`; validate in this order, all before any mutation: (1) `motion.mode` is `'linear'`, `'cubic'`, or `'parametric'` (else `'invalid-motion'`); (2) keyframe modes: `times.length === x.length === y.length` with `1 <= length <= maxKeyframes`, every time finite and strictly greater than the previous, every `x` and `y` finite with magnitude `<= 16_777_216` (else `'invalid-motion'`); (3) parametric mode: all seven parameters finite, `periodMs > 0`, `exponent` an integer `>= 1`, `|centerX| + |amplitudeX| <= 16_777_216` and the same for Y (else `'invalid-motion'`); (4) `layerId` is an integer in `[0, compositor.maxLayers)` and `compositor.layers[layerId] !== null` (else `'unknown-layer'`); (5) no existing track has `trackLayer === layerId` (else `'layer-already-driven'`); (6) a free slot exists (else `'capacity-exceeded'`); then copy into the lowest free slot found by an indexed `for` scan, store `trackMode`, `trackLayer`, and `trackLength` (`0` for parametric), and return the slot (same file as T010)
- [X] T012 [US2] In `src/core/kinematic-controller/tracks.ts` add `removeMotionTrack(state, trackId)`: `Number.isInteger(trackId)`, `0 <= trackId < maxTracks`, and `trackLayer[trackId] !== -1`, else `'unknown-track'`; set `trackLayer[trackId] = -1` and `trackLength[trackId] = 0` (stored data may stay, unreachable) (same file as T011)
- [X] T013 [US2] Create `src/core/kinematic-controller/index.ts` exporting `createKinematicController`, `addMotionTrack`, `removeMotionTrack` from `./tracks`, `KinematicError` from `./types`, and the types `KinematicState`, `KinematicErrorReason`, `TrackId`, `InterpolationMode`, `KeyframeMotion`, `ParametricMotion`, `MotionTrack`, `CompositorState`, `LayerId` (after T012)
- [X] T014 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/kinematic-controller/tracks.test.ts` and fix failures

**Checkpoint**: Track registration is complete and independently testable.

---

## Phase 5: User Story 3 - Path Evaluation (Priority: P3)

**Goal**: `evaluateMotion(state, timeMs)` writes each track's rounded integer (X, Y) offset into its compositor layer, statelessly and without allocating, in all three interpolation modes.

**Independent Test**: `npx vitest run tests/unit/kinematic-controller` passes, including exact values for each mode, compositor integration, and the benchmark (bounded heap growth plus time budget).

### Tests for User Story 3

- [X] T015 [P] [US3] Create `tests/unit/kinematic-controller/evaluate.test.ts` (real compositor, no mocks) asserting `compositor.offsetsX[layerId]` and `offsetsY[layerId]` exactly (integers): with `times [0, 1000, 2000]` and `x [0, 10, 0]`: `linear` gives `5`, `10`, `5` at `500`, `1000`, `1500` and `0` at `-100` and `5000` (clamping); `cubic` gives `6`, `10`, `6` at `500`, `1000`, `1500` (Hermite value `6.25` rounded) and clamps the same way; two keyframes `times [0, 1000]`, `x [0, 10]` give identical results for `linear` and `cubic` at `0`, `300`, `500`, `1000`; a single keyframe is constant in both keyframe modes at any time; Y is evaluated independently of X (different `y` keyframes); parametric with `centerX 0`, `amplitudeX 10`, `periodMs 4000`, `phaseMs 0`: `exponent 1` gives `10`, `0`, `-10`, `10` at `0`, `1000`, `2000`, `4000`, is periodic (`8000` gives `10`) and valid for negative times (`-1000` gives `0`, `-2000` gives `-10`); `exponent 2` gives `-5` at `1000`; `phaseMs 1000` gives `10` at `1000`; `centerX 5` gives `15` at `0`; `amplitudeX -10` gives `-10` at `0`; rounding: linear `x [0, 1]` over `[0, 1000]` gives `1` at `500` (0.5 rounds up) and `x [0, -1]` gives `0` at `500` (-0.5 rounds toward positive infinity); a track of each mode on three layers updates all offsets in one call while a fourth layer without a track keeps its offsets, weight, `active` flag, and pixels; layer buffers are never mutated (same object, same bytes before and after many evaluations); statelessness: `500`, `1500`, `500` gives the same offsets for the first and third calls; after `removeMotionTrack` the layer keeps its last offset and later calls no longer change it; `NaN`, `Infinity`, `-Infinity` throw `KinematicError` with `reason: 'invalid-time'` and write nothing (offsets unchanged); after unregistering a tracked layer in the compositor `evaluateMotion` throws `CompositorError` with `reason: 'unknown-layer'`
- [X] T016 [P] [US3] Create `tests/unit/kinematic-controller/compositor-integration.test.ts`: a 4x1 compositor with one layer `[10, 20, 30, 40]` at weight `1` and a `linear` track with `times [0, 1000]`, `x [0, 2]`, `y [0, 0]`, then `evaluateMotion` followed by `compose` gives `[0, 10, 20, 30]` at `500` and `[0, 0, 10, 20]` at `1000` (SC-004, with the layer's bytes unchanged afterwards); a `parametric` track (`amplitudeX 2`, `periodMs 4000`, `exponent 1`) gives `[0, 0, 10, 20]` at `0` and `[30, 40, 0, 0]` at `2000`; a layer also driven by a weight track from `src/core/temporal-controller` (`times [0, 1000]`, `values [1, 0.5]`) with the linear X track above gives `[0, 0, 5, 10]` after both `evaluate` and `evaluateMotion` at `1000`
- [X] T017 [P] [US3] Create `tests/unit/kinematic-controller/evaluate.bench.ts` modeled on `tests/unit/temporal-controller/evaluate.bench.ts` (`usedHeap` and `maxHeapGrowth` helpers over `performance.memory`): a compositor with 8 layers and a controller with 8 mixed-mode tracks (three `linear`, three `cubic` with 16 keyframes each, two `parametric`); time a batch of `1000` `evaluateMotion` calls and divide by the count, asserting the per-call time is under the budget (initial value `0.05` ms, calibrate in T021 and record the measured figure and chosen budget in a one-line comment); before the heap measurement run a warm-up of `5000` calls, then assert heap growth over repeated `evaluateMotion` calls with varying times is `< 100_000` bytes while an allocating control (`new Array(1000).fill(0)` per iteration) is `> 100_000`

### Implementation for User Story 3

- [X] T018 [US3] Create `src/core/kinematic-controller/evaluate.ts` with `evaluateMotion(state, timeMs): void`: if `!Number.isFinite(timeMs)` throw `KinematicError('invalid-time')` before any write; then for each track slot with `trackLayer[t] !== -1` switch on `trackMode[t]`: for `modeLinear` and `modeCubic`, with `base = t * maxKeyframes` and `last = base + trackLength[t] - 1`, use the first value if `timeMs <= times[base]` and the last value if `timeMs >= times[last]`, otherwise find the segment with an indexed `while` scan, let `h = times[k + 1] - times[k]` and `u = (timeMs - times[k]) / h`, and compute `linear: p[k] + (p[k+1] - p[k]) * u` or `cubic: h00 * p[k] + h10 * h * m[k] + h01 * p[k+1] + h11 * h * m[k+1]` with `h00 = 2u^3 - 3u^2 + 1`, `h10 = u^3 - 2u^2 + u`, `h01 = -2u^3 + 3u^2`, `h11 = u^3 - u^2` and tangents `m[k] = (p[k+1] - p[k-1]) / (t[k+1] - t[k-1])` for interior points and one-sided `(p[1] - p[0]) / (t[1] - t[0])` and `(p[n-1] - p[n-2]) / (t[n-1] - t[n-2])` at the ends (compute on the fly; nothing stored); evaluate X from `xs` and Y from `ys` by calling a shared unexported helper twice (never return tuples or objects); for `modeParametric` read the seven values from `params` at `7 * t` and compute per axis `center + amplitude * (2 * Math.pow(Math.cos(Math.PI * (timeMs - phaseMs) / periodMs), 2 * exponent) - 1)`; then apply `Math.round` to both axes and call `setLayerOffset(state.compositor, layerId, x, y)` imported from `../compositor-core` (handle `noUncheckedIndexedAccess` without blanket casts, for example with `?? 0`) (depends on T005 and T009)
- [X] T019 [US3] In `src/core/kinematic-controller/index.ts` add `export { evaluateMotion } from './evaluate'` (after T013 and T018)
- [X] T020 [US3] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/kinematic-controller`, fix failures, and if zero-allocation cannot be met without breaking a constitution principle, halt and flag it (Principle VI)
- [X] T021 [US3] Calibrate the budget in `tests/unit/kinematic-controller/evaluate.bench.ts`: read the measured per-call time (console output is not shown by the reporter, so temporarily assert `expect(perCall).toBe(-1)` to see the value in the failure message, then restore the real assertion), set a budget with wide headroom, and record the measured figure and the chosen budget in the one-line comment; do the same for the offsets case added in T006 if its measured time is not already recorded

**Checkpoint**: All three stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting

- [X] T022 [P] Add an "Extended by 008" note: in `specs/006-compositor-core/contracts/compositor-core-api.md` and `specs/006-compositor-core/data-model.md` add a short note near the top that per-layer integer offsets, `setLayerOffset`, and the `'invalid-offset'` reason are added by `specs/008-kinematic-controller` (linking to its compositor-offsets contract)
- [X] T023 Run the full verification as three separate commands, each with the fnm prefix and no output piping: `npx vitest run`, then `npm run typecheck`, then `npm run lint`; resolve all errors; confirm all existing tests (compositor, temporal, renderer, loader, blending) pass unchanged and that the new code has no semicolons, `any`, or `@ts-ignore`; if the heap-growth benchmarks flake under the full suite, lengthen their warm-up rather than loosening the limit
- [X] T024 Run the `quickstart.md` scenarios 1-11 and confirm each expected outcome
- [X] T025 Commit per constitution V with Conventional Commits under 50 characters, for example `feat: add compositor layer offsets` after T007, `feat: add motion track controller` after T014, `feat: add motion evaluation loop` after T021, and `docs: note compositor offsets in 006` for T022

---

## Dependencies & Execution Order

- **US1** (compositor): T001 (test) || T002; then T002 -> T003 -> T005 and T002 -> T004; T006 after T004 and T005; T007 last.
- **US2** (tracks): independent of US1 (it uses only the existing compositor); T008 (test) || T009; then T009 -> T010 -> T011 -> T012 -> T013 -> T014.
- **US3** (evaluation): needs T005 (`setLayerOffset` exported) and T013 (track table); T015, T016, T017 are parallel with each other and with T018; T019 after T013 and T018; T020 then T021 last.
- **Polish** after all stories; T022 can run any time.

### Parallel Opportunities

- T001 || T002 (and the whole of US1 || the whole of US2)
- T008 || T009
- T015 || T016 || T017 || T018
- T022 || any other task

### Parallel Example

```text
Task: "Extend compositor state and add setLayerOffset" (T002-T003)
Task: "Create kinematic-controller types and tracks" (T009-T013)
Task: "Create tests/unit/kinematic-controller/evaluate.test.ts" (T015)
Task: "Create tests/unit/kinematic-controller/evaluate.bench.ts" (T017)
```

## Implementation Strategy

### MVP First

1. US1 (T001-T007): compositor offsets, independently testable and the dependency of everything else
2. Stop and validate with `tests/unit/compositor-core`, then commit

### Incremental Delivery

1. Add US2 (T008-T014) and validate the track table
2. Add US3 (T015-T021) and validate evaluation, integration, and benchmarks
3. Polish (T022-T025) and commit
