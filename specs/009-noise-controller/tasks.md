---

description: "Task list for noise-controller"
---

# Tasks: Noise Controller

**Input**: Design documents from `/specs/009-noise-controller/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/noise-controller-api.md, quickstart.md; consumes the `GrayscaleImage` type from `src/core/image-loader` and, in tests only, uses `src/core/compositor-core` and `src/core/headless-renderer` (all unchanged).

**Tests**: Included. The spec (SC-001 to SC-004) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero allocation.

**Organization**: Tasks are grouped by user story: US1 = Window/Level Post-Processing (P1), US2 = Dose-Dependent Quantum Mottle (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, and always use `npx vitest run` (never watch mode or bare `npm test` without `run`)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)
- Hot path (`processFrame`): plain indexed loops only; no iterators, closures, spreads, array methods, object or array literals, `Math.random`, or transcendental math
- Edit tools run in parallel with terminal commands when called in the same step, so run `sed` or `git add` in a separate step after the file edits

---

## Phase 1: Setup

No new dependencies, configuration, or tooling are needed. The directories `src/core/noise-controller/` and `tests/unit/noise-controller/` are created by the tasks below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types used by both stories.

- [X] T001 Create `src/core/noise-controller/types.ts` per data-model.md and the contract:
  - `NoiseOptions = { window?: number; level?: number; dose?: number; seed?: number }` (all optional; defaults window `255`, level `127.5`, dose `Infinity`, seed `1`)
  - `NoiseState` plain record (no class) with fields: `width`, `height` ("Positive integers, fixed at creation"), `pixelCount` (`width * height`), `window` ("Finite and `> 0`; default `255`"), `level` ("Finite; default `127.5`"), `dose` ("A number `> 0`, or `Infinity` for no noise; default `Infinity`"), `windowTable: Uint8ClampedArray` ("Length `256`; `windowTable[v]` is the display byte for input byte `v`"), `sigmaTable: Float32Array` ("Length `256`; noise standard deviation in byte units for input byte `v`"), `rng: Uint32Array` ("Length `1`; `mulberry32` state"), `output: GrayscaleImage` (`{ width, height, data: Uint8ClampedArray(pixelCount) }`)
  - `NoiseErrorReason = 'invalid-dimensions' | 'invalid-window-level' | 'invalid-dose' | 'invalid-seed' | 'invalid-image'` and `class NoiseError extends Error` with `readonly reason`, `name = 'NoiseError'` (same shape as `KinematicError` in `src/core/kinematic-controller/types.ts`)
  - Re-export the type `GrayscaleImage` from `../image-loader`

**Checkpoint**: Types compile (`npm run typecheck`).

---

## Phase 3: User Story 1 - Window/Level Post-Processing (Priority: P1) MVP

**Goal**: Create a controller and run frames through a pre-computed window/level table into a separate reusable output image, without noise and without touching the input.

**Independent Test**: `npx vitest run tests/unit/noise-controller/window-level.test.ts` passes: identity by default, the hand-computed mapping, in-place table rebuilds, untouched input, and every validation case leaves state unchanged.

### Tests for User Story 1

- [X] T002 [P] [US1] Create `tests/unit/noise-controller/window-level.test.ts` (real typed arrays, no mocks) covering: with defaults a 16x16 frame holding every byte `0` to `255` is returned unchanged (`windowTable[v] === v` for all `v`); window `100` and level `100` maps `[0, 50, 75, 100, 125, 150, 200]` to `[0, 0, 64, 128, 191, 255, 255]`; window `510` and level `255` maps `[0, 100, 255]` to `[0, 50, 128]`; window `50` and level `128` maps `103` to `0` and `153` to `255`; creation options `{ window, level }` and `setWindowLevel` give the same table, `setWindowLevel` rebuilds the table in place (the same `windowTable` object before and after) and the next frame uses the new mapping; `state.window` and `state.level` reflect the latest values; the input image keeps its original bytes (compare with a copy) and `processFrame` returns `state.output`, a different object from the input, the same object and the same `data` instance on every call, with `width` and `height` equal to the controller's; the controller's own output may be passed back in as input (pointwise); validation with exact reasons and unchanged state (snapshot `window`, `level`, and `windowTable` before and after): window `0`, `-1`, `NaN`, `Infinity`, `-Infinity` and level `NaN`, `Infinity`, `-Infinity` give `'invalid-window-level'` from both `setWindowLevel` and `createNoiseController` options; width or height of `0`, `-1`, `1.5` give `'invalid-dimensions'`; an image with a different width, a different height, or a `data.length` that does not equal `width * height` gives `'invalid-image'` and leaves `state.output` unchanged; two controllers share nothing

### Implementation for User Story 1

- [X] T003 [US1] Create `src/core/noise-controller/controller.ts` with `createNoiseController(width, height, options?)` and `setWindowLevel(state, window, level)`: validate width and height are positive integers (else `NoiseError('invalid-dimensions')`) and the window/level options (`window` finite and `> 0`, `level` finite, else `'invalid-window-level'`), all before allocating; then allocate once `windowTable = new Uint8ClampedArray(256)`, `sigmaTable = new Float32Array(256)` (all zeros), `rng = new Uint32Array(1)` set to the default seed `1`, and `output = { width, height, data: new Uint8ClampedArray(width * height) }`, with `dose` stored as `Infinity`; build the table with an unexported `buildWindowTable(state)` that sets `windowTable[v] = (v - (level - window / 2)) / window * 255` for each `v` in `0..255` through the clamped array (native round-to-nearest and clamp); `setWindowLevel` validates then stores `window` and `level` and rebuilds the table in place; the `dose` and `seed` options are completed in T010 (depends on T001)
- [X] T004 [US1] Create `src/core/noise-controller/process.ts` with `processFrame(state, image): GrayscaleImage`: validate `image.width === state.width`, `image.height === state.height`, and `image.data.length === state.pixelCount` (else `NoiseError('invalid-image')`) before any write; then `for (let index = 0; index < pixelCount; index++) out[index] = windowTable[input[index] ?? 0] ?? 0` over `image.data` into `state.output.data`; never write to `image.data`; return `state.output`; the noise path is added in T011 (depends on T003)
- [X] T005 [US1] Create `src/core/noise-controller/index.ts` exporting `createNoiseController`, `setWindowLevel` from `./controller`, `processFrame` from `./process`, `NoiseError` from `./types`, and the types `NoiseState`, `NoiseOptions`, `NoiseErrorReason`, `GrayscaleImage` (after T004)
- [X] T006 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/noise-controller/window-level.test.ts` and fix failures

**Checkpoint**: Window/level post-processing is complete and independently testable (MVP).

---

## Phase 4: User Story 2 - Dose-Dependent Quantum Mottle (Priority: P2)

**Goal**: With a finite dose, `processFrame` adds pixel-independent noise whose standard deviation is `sqrt(255 * v / dose)`, from a seeded integer PRNG, before the window/level mapping, without allocating.

**Independent Test**: `npx vitest run tests/unit/noise-controller` passes: statistics match the formula within 5% for a fixed seed, reproducibility and reseeding hold, the no-noise path leaves the generator untouched, and the benchmark shows bounded heap growth within the calibrated time budget.

### Tests for User Story 2

- [ ] T007 [P] [US2] Create `tests/unit/noise-controller/noise.test.ts` (real typed arrays, fixed seeds, no mocks) with a helper that fills a 256x256 frame with a constant byte and computes the mean and standard deviation of an output: with the default dose (`Infinity`) the output equals the window/level result for a non-constant frame and `state.rng[0]` is unchanged across frames; `128` at dose `1000` and seed `12345` has mean within `0.5` of `128` and standard deviation within 5% of `5.72`; the same input at dose `4000` has a standard deviation ratio of `0.5` within 5% against dose `1000` with the same seed; constant `192` and `48` at dose `1000` have a standard deviation ratio of `2` within 5%; constant `0` stays all `0` at any finite dose (`sigmaTable[0] === 0`); `setDose` rebuilds `sigmaTable` in place (same object) with `sigmaTable[128]` close to `sqrt(255 * 128 / 1000)` (5 digits) and all zeros for dose `Infinity`; with a finite dose `state.rng[0]` changes after a frame; reproducibility: two controllers with the same seed give identical frames over three consecutive frames, different seeds give different frames, successive frames from one controller differ, and `reseed(state, seed)` makes the next frame equal the first frame again; noise is added before windowing: for the same seed a constant `128` frame with window `50` and level `128` has a standard deviation `255 / 50` (5.1) times that of the identity window, within 5%; a dose of `0.01` never throws and every output byte stays within `0` to `255`; the input image keeps its original bytes with noise on; validation with exact reasons and unchanged state (snapshot `dose`, `sigmaTable`, and `rng[0]`): dose `0`, `-1`, `NaN`, `-Infinity` give `'invalid-dose'` from `setDose` and from the creation option, dose `Infinity` is accepted; seed `1.5`, `-1`, `4294967296`, `NaN`, `Infinity` give `'invalid-seed'` from `reseed` and from the creation option, seeds `0` and `4294967295` are accepted; two controllers share nothing
- [ ] T008 [P] [US2] Create `tests/unit/noise-controller/integration.test.ts`: a 4x1 compositor from `src/core/compositor-core` with layers whose composed bytes are `[0, 75, 100, 150]`; with window `100`, level `100`, dose `Infinity`, `processFrame(noise, compose(compositor))` gives `[0, 64, 128, 255]`, is a different object from the compositor output, processing the same compositor output twice gives the same bytes (no compounding), and the compositor output bytes and every registered layer buffer are byte-identical before and after (same objects, same bytes); with dose `500` and a fixed seed the result differs from the noise-free result somewhere, the compositor output and layers are still byte-identical, and passing the result to `updateBuffer` on a 4x1 `createRenderer` followed by `readSurface` returns R = G = B equal to the processed bytes with alpha `255` (`destroyRenderer` in `afterEach`)
- [ ] T009 [P] [US2] Create `tests/unit/noise-controller/process.bench.ts` modeled on `tests/unit/compositor-core/compose.bench.ts` (`usedHeap` and `maxHeapGrowth` helpers over `performance.memory`): a 512x512 controller with dose `1000`, window `200`, level `128`, and an input frame filled with `(index * 7) & 255`; time a batch of `20` `processFrame` calls and divide by the count, asserting the per-frame time is under the budget (initial value `5` ms, calibrate in T014 and record the measured figure and chosen budget in a one-line comment); before the heap measurement run a warm-up of `50` frames, then assert heap growth over repeated `processFrame` calls (`maxHeapGrowth(run, 3, 100)`) is `< 100_000` bytes while an allocating control (`new Array(1000).fill(0)` per iteration) is `> 100_000`

### Implementation for User Story 2

- [ ] T010 [US2] In `src/core/noise-controller/controller.ts` complete the noise configuration: validate the `dose` option and `setDose(state, dose)` as `typeof dose === 'number'` and `dose > 0` ("A number `> 0`, or `Infinity` for no noise", `NaN`, `0`, and negatives rejected, else `NoiseError('invalid-dose')`); validate the `seed` option and `reseed(state, seed)` as `Number.isInteger(seed)` and `0 <= seed <= 4294967295` (else `'invalid-seed'`); validate every option before allocating or mutating; add an unexported `buildSigmaTable(state)` that sets `sigmaTable[v] = Number.isFinite(dose) ? Math.sqrt(255 * v / dose) : 0` for each `v` in `0..255`; `setDose` validates, stores `dose`, and rebuilds the table in place; `reseed` sets `rng[0] = seed`; creation applies the `dose` option (default `Infinity`) and the `seed` option (default `1`) (after T003)
- [ ] T011 [US2] In `src/core/noise-controller/process.ts` add the noisy loop chosen outside the pixel loop: when `Number.isFinite(state.dose)` read `a = rng[0] | 0` into a local and for each pixel do `a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; const draw = (t ^ (t >>> 14)) >>> 0`, then `z = ((draw & 255) + ((draw >>> 8) & 255) + ((draw >>> 16) & 255) + (draw >>> 24) - 510) * inverseDeviation` with a module constant `inverseDeviation = 1 / Math.sqrt((4 * (256 * 256 - 1)) / 12)` (about `1 / 147.80`), `f = v + sigmaTable[v] * z`, clamp `f` to `0` to `255`, `noisy = (f + 0.5) | 0`, and `out[index] = windowTable[noisy]`; write `rng[0] = a` once after the loop; otherwise keep the table-only loop from T004 and leave the generator untouched; never call `Math.random`; never write to `image.data` (after T004 and T010)
- [ ] T012 [US2] In `src/core/noise-controller/index.ts` add `setDose` and `reseed` to the export from `./controller` (after T005 and T010)
- [ ] T013 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/noise-controller`, fix failures, and if zero-allocation cannot be met without breaking a constitution principle, halt and flag it (Principle VI)
- [ ] T014 [US2] Calibrate the budget in `tests/unit/noise-controller/process.bench.ts`: read the measured per-frame time (console output is not shown by the reporter, so temporarily assert `expect(perFrame).toBe(-1)` to see the value in the failure message, then restore the real assertion), set a budget with wide headroom, and record the measured figure and the chosen budget in the one-line comment; keep the heap warm-up long enough that the heap test does not flake under the full suite

**Checkpoint**: Both stories work independently and together.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T015 Run the full verification as three separate commands, each with the fnm prefix and no output piping: `npx vitest run`, then `npm run typecheck`, then `npm run lint`; resolve all errors; confirm all existing tests pass unchanged and that the new code has no semicolons, `any`, `@ts-ignore`, `Math.random`, or `console` calls; if the heap-growth benchmarks flake under the full suite, lengthen their warm-up rather than loosening the limit
- [ ] T016 Run the `quickstart.md` scenarios 1-11 and confirm each expected outcome
- [ ] T017 Commit per constitution V with Conventional Commits under 50 characters, for example `feat: add window/level post-processing` after T006, and `feat: add quantum mottle noise` after T014

---

## Dependencies & Execution Order

- **Foundational (T001)** blocks both stories.
- **US1**: T002 (test) || T003; then T003 -> T004 -> T005 -> T006 (T003 and T004 also depend on T001).
- **US2**: needs US1 (T003, T004, T005); T007, T008, T009 are parallel with each other and with T010; T010 -> T011 -> T012 -> T013 -> T014.
- **Polish** after both stories.

### Parallel Opportunities

- T002 || T003
- T007 || T008 || T009 || T010

### Parallel Example

```text
Task: "Create tests/unit/noise-controller/noise.test.ts" (T007)
Task: "Create tests/unit/noise-controller/integration.test.ts" (T008)
Task: "Create tests/unit/noise-controller/process.bench.ts" (T009)
Task: "Complete the noise configuration in controller.ts" (T010)
```

## Implementation Strategy

### MVP First

1. Foundational: T001
2. US1 (T002-T006): window/level post-processing, independently testable
3. Stop and validate with `window-level.test.ts`, then commit

### Incremental Delivery

1. Add US2 (T007-T014) and validate statistics, reproducibility, integration, and the benchmark
2. Polish (T015-T017) and commit
