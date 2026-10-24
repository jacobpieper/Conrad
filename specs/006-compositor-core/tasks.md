---

description: "Task list for compositor-core"
---

# Tasks: Compositor Core

**Input**: Design documents from `/specs/006-compositor-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/compositor-core-api.md, quickstart.md

**Tests**: Included. The spec (SC-001, SC-002) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero allocation.

**Organization**: Tasks are grouped by user story: US1 = Layer Controller (P1), US2 = Zero-Allocation Composition (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)

---

## Phase 1: Setup

No new dependencies, configuration, or tooling are needed (Vitest Browser Mode and `--enable-precise-memory-info` are already configured). New directories `src/core/compositor-core/` and `tests/unit/compositor-core/` are created by the tasks below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types used by both stories.

- [ ] T001 Create `src/core/compositor-core/types.ts` per data-model.md and the contract:
  - `export type LayerPixels = Uint8Array | Uint8ClampedArray` ("row-major, single channel, length `width * height`") and `export type LayerId = number` ("an integer slot index in `[0, maxLayers)`")
  - `CompositorState` plain record (no class) with fields: `width`, `height` ("Positive integers, fixed at creation"), `pixelCount` (`width * height`), `maxLayers` ("Positive integer, fixed at creation"), `layers: (LayerPixels | null)[]` ("Length `maxLayers`, filled with `null`; a slot is free iff `null`"), `weights: Float32Array` ("Length `maxLayers`; each finite and `>= 0`"), `active: Uint8Array` ("Length `maxLayers`; `1` when the slot is occupied and enabled, otherwise `0`"), `accumulator: Float32Array` ("Length `pixelCount`"), `output: GrayscaleImage` (`{ width, height, data: Uint8ClampedArray(pixelCount) }`)
  - `CompositorErrorReason = 'invalid-dimensions' | 'invalid-layer' | 'invalid-weight' | 'capacity-exceeded' | 'unknown-layer'` and `class CompositorError extends Error` with `readonly reason`, `name = 'CompositorError'` (same shape as `RendererError` in `src/core/headless-renderer/types.ts`)
  - Re-export `GrayscaleImage` from `../image-loader`

**Checkpoint**: Types compile (`npm run typecheck`).

---

## Phase 3: User Story 1 - Layer Controller (Priority: P1) MVP

**Goal**: Register and manage static layers and their attenuation weights on a pre-allocated, fixed-capacity table.

**Independent Test**: `npx vitest run tests/unit/compositor-core/layers.test.ts` passes: create, register, update, deactivate, unregister, and every rejection case leaves state unchanged.

### Tests for User Story 1

- [ ] T002 [P] [US1] Create `tests/unit/compositor-core/layers.test.ts` (real typed arrays, no mocks) covering: first two registrations return ids `0` and `1` with the given weights and `active[id] === 1`; `registerLayer` accepts both `Uint8Array` and `Uint8ClampedArray`; the layer is stored by reference (`state.layers[id] === pixels`); `setLayerWeight` and `setLayerActive` change only the target slot; `unregisterLayer` frees the slot (`layers[id] === null`, weight `0`, `active[id] === 0`), the next `registerLayer` reuses the lowest free slot, and the old id throws `'unknown-layer'` until reused; rejections with exact reasons and unchanged state (snapshot `layers`, `weights`, `active` before and after): `createCompositor` with `0`, `-1`, `1.5` for each of width, height, `maxLayers` gives `'invalid-dimensions'`; wrong-length pixels gives `'invalid-layer'`; weights `-1`, `NaN`, `Infinity`, `-Infinity` give `'invalid-weight'` on both `registerLayer` and `setLayerWeight`; registering beyond `maxLayers` gives `'capacity-exceeded'`; ids `-1`, `1.5`, `maxLayers`, and a free slot give `'unknown-layer'` on `unregisterLayer`, `setLayerWeight`, and `setLayerActive`; weight `0` and weight `3` (above 1) are accepted

### Implementation for User Story 1

- [ ] T003 [US1] Create `src/core/compositor-core/layers.ts` with `createCompositor(width, height, maxLayers)`: validate all three are positive integers (else `CompositorError('invalid-dimensions')`), then allocate once: `layers` as `new Array<LayerPixels | null>(maxLayers).fill(null)`, `weights = new Float32Array(maxLayers)`, `active = new Uint8Array(maxLayers)`, `accumulator = new Float32Array(width * height)`, `output = { width, height, data: new Uint8ClampedArray(width * height) }` (depends on T001)
- [ ] T004 [US1] In `src/core/compositor-core/layers.ts` add `registerLayer(state, pixels, weight): LayerId`: validate `pixels.length === state.pixelCount` (`'invalid-layer'`), weight finite and `>= 0` (`'invalid-weight'`), at least one free slot (`'capacity-exceeded'`), all before mutation; store `pixels` by reference in the lowest free slot found by an indexed `for` scan, set `weights[slot]`, set `active[slot] = 1`, return the slot (same file as T003)
- [ ] T005 [US1] In `src/core/compositor-core/layers.ts` add `unregisterLayer(state, id)`, `setLayerWeight(state, id, weight)`, `setLayerActive(state, id, active: boolean)` using one shared unexported `assertOccupied(state, id)` helper (`Number.isInteger(id)`, `0 <= id < maxLayers`, `layers[id] !== null`, else `'unknown-layer'`) and one shared unexported weight validator reused by `registerLayer`; `unregisterLayer` sets `layers[id] = null`, `weights[id] = 0`, `active[id] = 0`; `setLayerActive` stores `1` or `0` (same file as T004)
- [ ] T006 [US1] Create `src/core/compositor-core/index.ts` exporting `createCompositor`, `registerLayer`, `unregisterLayer`, `setLayerWeight`, `setLayerActive` from `./layers`, `CompositorError` from `./types`, and the types `CompositorState`, `CompositorErrorReason`, `LayerId`, `LayerPixels`, `GrayscaleImage` (after T005)
- [ ] T007 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/compositor-core/layers.test.ts` and fix failures

**Checkpoint**: Layer Controller is complete and independently testable.

---

## Phase 4: User Story 2 - Zero-Allocation Composition (Priority: P2)

**Goal**: `compose(state)` returns a reusable, renderer-ready `GrayscaleImage` computed without allocating.

**Independent Test**: `npx vitest run tests/unit/compositor-core` passes, including exact-byte composition, renderer hand-off, and the benchmark (bounded heap growth plus time budget).

### Tests for User Story 2

- [ ] T008 [P] [US2] Create `tests/unit/compositor-core/compose.test.ts` with exact-byte assertions using real arrays: layers `[100, 200]` (weight `0.5`) and `[50, 200]` (weight `2`) give `[150, 255]`; rounding via `[1, 3, 5]` with weight `0.5` gives `[0, 2, 2]` (round half to even); no active layers gives all zeros; `setLayerActive(false)` removes a contribution and `true` restores it; an unregistered layer contributes nothing; layer order does not change the result; in-place mutation of a registered layer's bytes appears on the next `compose`; two `compose` calls return the identical `GrayscaleImage` object with the identical `data` instance; the result has `width`, `height`, and `data.length === width * height`; two independent compositors do not affect each other
- [ ] T009 [P] [US2] Create `tests/unit/compositor-core/renderer-handoff.test.ts`: `createRenderer(w, h)`, compose two layers with distinct weights, pass `compose(state)` to `updateBuffer`, then `readSurface` and assert R = G = B equals the composed bytes and alpha is `255` (same-size viewport so the copy is exact, SC-003); `destroyRenderer` in `afterEach`
- [ ] T010 [P] [US2] Create `tests/unit/compositor-core/compose.bench.ts` modeled on `tests/unit/headless-renderer/update-buffer.bench.ts` (`usedHeap` and `maxHeapGrowth` helpers over `performance.memory`): 8 active layers at 512x512; warm up once, then assert a single `compose` is under the time budget (initial value `10` ms, calibrate against measured results and record the chosen value in a one-line comment); assert heap growth over repeated `compose` calls is `< 100_000` bytes while an allocating control (`new Array(1000).fill(0)` per iteration) is `> 100_000`

### Implementation for User Story 2

- [ ] T011 [US2] Create `src/core/compositor-core/compose.ts` with `compose(state): GrayscaleImage`: `state.accumulator.fill(0)`; for each slot `s` in `0..maxLayers-1` where `state.active[s] === 1`, read `weight = state.weights[s]` and `pixels = state.layers[s]` once, then `for (let i = 0; i < pixelCount; i++) accumulator[i] += weight * pixels[i]` (layer-major, plain indexed loops only; no iterators, closures, spreads, or array methods in the function; handle `noUncheckedIndexedAccess` without blanket casts, for example with an explicit `pixels === null` skip and `?? 0` outside the inner loop); finally `for (let i = 0; i < pixelCount; i++) output.data[i] = accumulator[i]` (native round-and-clamp via `Uint8ClampedArray`) and return `state.output` (depends on T001)
- [ ] T012 [US2] In `src/core/compositor-core/index.ts` add `export { compose } from './compose'` (after T006 and T011)
- [ ] T013 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/compositor-core`, fix failures, then calibrate the benchmark budget in `tests/unit/compositor-core/compose.bench.ts`; if zero-allocation cannot be met without breaking a constitution principle, halt and flag it (Principle VI)

**Checkpoint**: Both stories work independently and together.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T014 Run the full verification, each with the fnm prefix: `npm test`, `npm run typecheck`, `npm run lint`; resolve all errors and confirm the new module has no semicolons, `any`, or `@ts-ignore`
- [ ] T015 Run the `quickstart.md` scenarios 1-7 and confirm each expected outcome
- [ ] T016 Commit per constitution V with Conventional Commits under 50 characters, for example `feat: add compositor layer controller` after T007 and `feat: add compositor compose pipeline` after T013

---

## Dependencies & Execution Order

- **Foundational (T001)** blocks both stories.
- **US1**: T002 (test) || T003; then T003 -> T004 -> T005 -> T006 -> T007 (all in `layers.ts` or dependent on it).
- **US2**: needs T001, plus T006 only for T012 and the tests' imports; T008, T009, T010 are parallel with each other and with T011; T012 after T006 and T011; T013 last.
- **Polish** after both stories.
- US2 can start in parallel with US1 once T001 is done, since `compose.ts` only reads `CompositorState`; its tests need `registerLayer`, so run T013 after T007.

### Parallel Opportunities

- T002 || T003
- T008 || T009 || T010 || T011

### Parallel Example

```text
Task: "Create tests/unit/compositor-core/compose.test.ts" (T008)
Task: "Create tests/unit/compositor-core/renderer-handoff.test.ts" (T009)
Task: "Create tests/unit/compositor-core/compose.bench.ts" (T010)
Task: "Create src/core/compositor-core/compose.ts" (T011)
```

## Implementation Strategy

### MVP First

1. Foundational: T001
2. US1 (T002-T007): the Layer Controller, independently testable
3. Stop and validate with `layers.test.ts`, then commit

### Incremental Delivery

1. Add US2 (T008-T013) and validate tests plus benchmark
2. Polish (T014-T016) and commit
