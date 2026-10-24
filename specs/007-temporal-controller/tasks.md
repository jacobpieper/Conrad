---

description: "Task list for temporal-controller"
---

# Tasks: Temporal Controller

**Input**: Design documents from `/specs/007-temporal-controller/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/temporal-controller-api.md, quickstart.md; depends on the existing `src/core/compositor-core` (unchanged).

**Tests**: Included. The spec (SC-001, SC-002) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero allocation.

**Organization**: Tasks are grouped by user story: US1 = Weight Tracks (P1), US2 = Time Evaluation (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, and always use `npx vitest run` (never watch mode or bare `npm test` without `run`)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)

---

## Phase 1: Setup

No new dependencies, configuration, or tooling are needed. The directories `src/core/temporal-controller/` and `tests/unit/temporal-controller/` are created by the tasks below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types used by both stories.

- [ ] T001 Create `src/core/temporal-controller/types.ts` per data-model.md and the contract:
  - `export type TrackId = number` ("an integer slot index in `[0, maxTracks)`")
  - `TemporalState` plain record (no class) with fields: `compositor: CompositorState` ("held by reference"), `maxTracks` and `maxKeyframes` ("Positive integer, fixed at creation"), `trackLayer: Int32Array` ("Length `maxTracks`; the bound `LayerId`, or `-1` when the slot is free"), `trackLength: Int32Array` ("Length `maxTracks`; keyframe count, `0` when free"), `times: Float64Array` ("Length `maxTracks * maxKeyframes`; track `t` uses `[t * maxKeyframes, t * maxKeyframes + trackLength[t])`"), `values: Float64Array` ("Same layout as `times`")
  - `TemporalErrorReason = 'invalid-dimensions' | 'invalid-keyframes' | 'unknown-layer' | 'layer-already-driven' | 'capacity-exceeded' | 'unknown-track' | 'invalid-time'` and `class TemporalError extends Error` with `readonly reason`, `name = 'TemporalError'` (same shape as `CompositorError` in `src/core/compositor-core/types.ts`)
  - Re-export the types `CompositorState` and `LayerId` from `../compositor-core`

**Checkpoint**: Types compile (`npm run typecheck`).

---

## Phase 3: User Story 1 - Weight Tracks (Priority: P1) MVP

**Goal**: Attach, store, and remove keyframe tracks for registered compositor layers on a pre-allocated, fixed-capacity table.

**Independent Test**: `npx vitest run tests/unit/temporal-controller/tracks.test.ts` passes: add, remove, slot reuse, and every rejection case leaves state unchanged.

### Tests for User Story 1

- [ ] T002 [P] [US1] Create `tests/unit/temporal-controller/tracks.test.ts` (real typed arrays and a real compositor from `src/core/compositor-core`, no mocks) covering: the first two `addTrack` calls on two registered layers return ids `0` and `1`, `trackLayer` holds the layer ids, `trackLength` holds the counts, and the keyframes are copied into `times` and `values` at `trackId * maxKeyframes` (accepting both plain arrays and `Float64Array` inputs); the input arrays are not retained (mutating them afterwards does not change stored data); `removeTrack` frees the slot (`trackLayer[id] === -1`, `trackLength[id] === 0`), the next `addTrack` reuses the lowest free slot, and the removed id throws `'unknown-track'` until reused; a single keyframe is accepted; rejections with exact reasons and unchanged state (snapshot `trackLayer`, `trackLength`, `times`, `values` before and after): `createTemporalController` with `0`, `-1`, `1.5` for each of `maxTracks` and `maxKeyframes` gives `'invalid-dimensions'`; an unregistered layer, `-1`, `1.5`, and `maxLayers` as layer id give `'unknown-layer'`; a second track on an already driven layer gives `'layer-already-driven'`; a track beyond `maxTracks` gives `'capacity-exceeded'`; empty keyframes, more than `maxKeyframes`, mismatched `times` and `values` lengths, equal times, decreasing times, `NaN` or `Infinity` in times or values, and a negative value give `'invalid-keyframes'`; ids `-1`, `1.5`, `maxTracks`, and a free slot give `'unknown-track'` on `removeTrack`; two controllers on separate compositors share nothing

### Implementation for User Story 1

- [ ] T003 [US1] Create `src/core/temporal-controller/tracks.ts` with `createTemporalController(compositor, maxTracks, maxKeyframes)`: validate both are positive integers (else `TemporalError('invalid-dimensions')`), then allocate once: `trackLayer = new Int32Array(maxTracks).fill(-1)`, `trackLength = new Int32Array(maxTracks)`, `times = new Float64Array(maxTracks * maxKeyframes)`, `values = new Float64Array(maxTracks * maxKeyframes)`; hold `compositor` by reference (depends on T001)
- [ ] T004 [US1] In `src/core/temporal-controller/tracks.ts` add `addTrack(state, layerId, times, values): TrackId` with `times` and `values` typed `ArrayLike<number>`; validate in this order, all before any mutation: (1) `times.length === values.length` and `1 <= length <= maxKeyframes`, every time finite and strictly greater than the previous, every value finite and `>= 0` (else `'invalid-keyframes'`); (2) `layerId` is an integer in `[0, compositor.maxLayers)` and `compositor.layers[layerId]` is not `null` (else `'unknown-layer'`); (3) no existing track has `trackLayer === layerId` (else `'layer-already-driven'`); (4) a free slot exists (else `'capacity-exceeded'`); then copy the keyframes into the lowest free slot found by an indexed `for` scan, set `trackLayer` and `trackLength`, and return the slot (same file as T003)
- [ ] T005 [US1] In `src/core/temporal-controller/tracks.ts` add `removeTrack(state, trackId)`: `Number.isInteger(trackId)`, `0 <= trackId < maxTracks`, and `trackLayer[trackId] !== -1`, else `'unknown-track'`; set `trackLayer[trackId] = -1` and `trackLength[trackId] = 0` (the stored keyframes may stay, unreachable) (same file as T004)
- [ ] T006 [US1] Create `src/core/temporal-controller/index.ts` exporting `createTemporalController`, `addTrack`, `removeTrack` from `./tracks`, `TemporalError` from `./types`, and the types `TemporalState`, `TemporalErrorReason`, `TrackId`, `CompositorState`, `LayerId` (after T005)
- [ ] T007 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/temporal-controller/tracks.test.ts` and fix failures

**Checkpoint**: Track registration is complete and independently testable.

---

## Phase 4: User Story 2 - Time Evaluation (Priority: P2)

**Goal**: `evaluate(state, timeMs)` writes each track's interpolated weight into its compositor layer, statelessly and without allocating.

**Independent Test**: `npx vitest run tests/unit/temporal-controller` passes, including exact interpolation values, compositor integration, and the benchmark (bounded heap growth plus time budget).

### Tests for User Story 2

- [ ] T008 [P] [US2] Create `tests/unit/temporal-controller/evaluate.test.ts` (real compositor, no mocks) with keyframes times `[0, 1000, 4000]` and values `[0, 1, 0.2]` on one layer, asserting `compositor.weights[layerId]` with `toBeCloseTo(expected, 6)` (the compositor stores float32): `500` gives `0.5`, `1000` gives `1`, `2500` gives `0.6`, `0` gives `0`, `4000` gives `0.2`; clamping: `-100` gives `0` and `9999` gives `0.2`; a single-keyframe track is constant at any time; statelessness: evaluating `2500`, then `500`, then `2500` gives `0.6`, `0.5`, `0.6`, and the same time twice gives the same weight; two tracks on two layers are both updated in one call while a third layer without a track keeps its weight, `active` flags, and pixels; after `removeTrack` the layer keeps its last weight and later calls no longer change it; `NaN`, `Infinity`, `-Infinity` throw `TemporalError` with `reason: 'invalid-time'` and write nothing (weights unchanged); after unregistering a tracked layer in the compositor, `evaluate` throws `CompositorError` with `reason: 'unknown-layer'`
- [ ] T009 [P] [US2] Create `tests/unit/temporal-controller/compositor-integration.test.ts`: a 2x2 compositor with one layer of constant value `100` at weight `1`, a track with times `[0, 1000, 4000]` and values `[0, 1, 0.2]`, then `evaluate` followed by `compose` at `500`, `1000`, and `4000` gives every output byte `50`, `100`, and `20` respectively (SC-003); a second case with two layers and two tracks (one rising, one falling) checks the summed bytes at two times
- [ ] T010 [P] [US2] Create `tests/unit/temporal-controller/evaluate.bench.ts` modeled on `tests/unit/compositor-core/compose.bench.ts` (`usedHeap` and `maxHeapGrowth` helpers over `performance.memory`): a compositor with 8 layers and a controller with 8 tracks of 16 keyframes each; warm up once, then assert a single `evaluate` is under the time budget (initial value `1` ms, calibrate against measured results and record the chosen value in a one-line comment); assert heap growth over repeated `evaluate` calls with varying times is `< 100_000` bytes while an allocating control (`new Array(1000).fill(0)` per iteration) is `> 100_000`

### Implementation for User Story 2

- [ ] T011 [US2] Create `src/core/temporal-controller/evaluate.ts` with `evaluate(state, timeMs): void`: if `!Number.isFinite(timeMs)` throw `TemporalError('invalid-time')` before any write; then for each track slot `t` in `0..maxTracks-1` with `trackLayer[t] !== -1`, let `base = t * maxKeyframes` and `n = trackLength[t]`: if `timeMs <= times[base]` use `values[base]`; else if `timeMs >= times[base + n - 1]` use `values[base + n - 1]`; else find the segment with an indexed `for` scan and use `v[k] + (v[k+1] - v[k]) * (timeMs - t[k]) / (t[k+1] - t[k])`; call `setLayerWeight(state.compositor, layerId, weight)` imported from `../compositor-core` (plain indexed loops only; no iterators, closures, spreads, or array methods; handle `noUncheckedIndexedAccess` without blanket casts, for example with `?? 0`) (depends on T001)
- [ ] T012 [US2] In `src/core/temporal-controller/index.ts` add `export { evaluate } from './evaluate'` (after T006 and T011)
- [ ] T013 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/temporal-controller`, fix failures, then calibrate the benchmark budget in `tests/unit/temporal-controller/evaluate.bench.ts`; if zero-allocation cannot be met without breaking a constitution principle, halt and flag it (Principle VI)

**Checkpoint**: Both stories work independently and together.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T014 Run the full verification as three separate commands, each with the fnm prefix and no output piping: `npx vitest run`, then `npm run typecheck`, then `npm run lint`; resolve all errors and confirm the new module and tests have no semicolons, `any`, or `@ts-ignore`
- [ ] T015 Run the `quickstart.md` scenarios 1-9 and confirm each expected outcome
- [ ] T016 Commit per constitution V with Conventional Commits under 50 characters, for example `feat: add temporal track controller` after T007 and `feat: add temporal evaluation loop` after T013

---

## Dependencies & Execution Order

- **Foundational (T001)** blocks both stories.
- **US1**: T002 (test) || T003; then T003 -> T004 -> T005 -> T006 -> T007 (all in `tracks.ts` or dependent on it).
- **US2**: needs T001; T008, T009, T010 are parallel with each other and with T011; T012 after T006 and T011; T013 last (the tests need `addTrack` from US1, so run T013 after T007).
- **Polish** after both stories.

### Parallel Opportunities

- T002 || T003
- T008 || T009 || T010 || T011

### Parallel Example

```text
Task: "Create tests/unit/temporal-controller/evaluate.test.ts" (T008)
Task: "Create tests/unit/temporal-controller/compositor-integration.test.ts" (T009)
Task: "Create tests/unit/temporal-controller/evaluate.bench.ts" (T010)
Task: "Create src/core/temporal-controller/evaluate.ts" (T011)
```

## Implementation Strategy

### MVP First

1. Foundational: T001
2. US1 (T002-T007): track registration, independently testable
3. Stop and validate with `tracks.test.ts`, then commit

### Incremental Delivery

1. Add US2 (T008-T013) and validate tests plus benchmark
2. Polish (T014-T016) and commit
