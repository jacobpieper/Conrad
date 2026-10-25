---

description: "Task list for frame-capture"
---

# Tasks: Frame Capture

**Input**: Design documents from `/specs/012-frame-capture/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/frame-capture-api.md, quickstart.md; adds `src/core/frame-capture/` (`types.ts`, `create.ts`, `capture.ts`, `index.ts`) and modifies `src/core/simulation-orchestrator/` (`types.ts`, `engine.ts`, `tick.ts`, `index.ts`); all other core modules, `vitest.config.ts`, `vitest.tick-bench.config.ts`, and `package.json` are unchanged.

**Tests**: Included. The spec (SC-001 to SC-005) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero JS heap allocation and the time budget for the hot-loop change.

**Organization**: Tasks are grouped by user story: US1 = Capture Targets Are Pre-Allocated at Engine Creation (P1), US2 = Stop Mode Fills Once and Halts (P1), US3 = Loop Mode Is a Ring Buffer (P1), US4 = Zero Allocation Within the Tick Budget (P1), US5 = Targets Do Not Disturb the Pipeline (P2). The types and error class (Phase 2) are shared by every story; US1 adds validation, allocation, and engine wiring; US2 adds `captureFrame`, the `tick` call, and stop semantics; US3 adds the loop branch; US4 and US5 add verification only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, never chain commands with `&&`, `||`, or `;` beyond the mandatory prefix, and always use `npx vitest run` (never watch mode)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)
- Hot path (`captureFrame` and the `tick` call): plain property reads, indexed `for`, and `.set(frame, offset)` only; no destructuring, object or array literals, closures, spreads, `for...of`, array methods, template strings, `try`/`catch`, `subarray`, `slice`, `Math.random`, or any growth, resizing, or reassignment of a target `buffer` (FR-004, FR-008)
- Edit tools run in parallel with terminal commands when called in the same step, so run `git add` in a separate step after the file edits
- Tests mirror the style of `tests/unit/simulation-orchestrator/tick.test.ts`: real engine via `createEngine`, `destroyEngine` in `afterEach`, 4x1 layer `Uint8Array.from([0, 100, 200, 250])` at weight `1`, temporal track `[0, 1000]` values `[0, 1]`, so `tick(engine, 0)`, `500`, `1000` return `[0,0,0,0]`, `[0,50,100,125]`, `[0,100,200,250]`

---

## Phase 1: Setup

- [ ] T001 Confirm no setup is needed: `tsconfig.json` (`include: ["src", "tests"]`) and `eslint.config.js` already cover `src/core/frame-capture/` and `tests/unit/frame-capture/`, and no dependency or config change is required; the module files are created by the tasks below

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, the error class, and the engine type fields, used by all stories.

- [ ] T002 In `src/core/frame-capture/types.ts` define, matching the style of `src/core/noise-controller/types.ts`: `export type CaptureMode = 'stop' | 'loop'`; `export type CaptureTargetConfig = { id: string; maxCapacity: number; mode: CaptureMode }`; `export type CaptureTarget = { id: string; mode: CaptureMode; maxCapacity: number; frameSize: number; buffer: Uint8ClampedArray; isRecording: boolean; headIndex: number; totalFramesRecorded: number }` with `id`, `mode`, `maxCapacity`, `frameSize`, and `buffer` documented in one-line comments as fixed after creation ("`buffer`: Length `maxCapacity * frameSize`. Zero-filled at creation; created once, never resized or replaced."); `export type CaptureErrorReason = 'invalid-id' | 'duplicate-id' | 'invalid-capacity' | 'invalid-mode'`; and `export class CaptureError extends Error` with `readonly reason: CaptureErrorReason`, constructor `(reason, message)`, `this.name = 'CaptureError'`, using the same shape as `SimulationError` in `src/core/simulation-orchestrator/types.ts`
- [ ] T003 In `src/core/frame-capture/index.ts` export `CaptureError`, and the types `CaptureMode`, `CaptureTarget`, `CaptureTargetConfig`, `CaptureErrorReason` from `./types` (the functions are added to this file by T005 and T008) (depends on T002)
- [ ] T004 In `src/core/simulation-orchestrator/types.ts` import `CaptureTarget` and `CaptureTargetConfig` from `../frame-capture`; add `captureTargets?: CaptureTargetConfig[]` to `EngineOptions` with the comment `// Defaults to none`; add `captureTargets: CaptureTarget[]` to `EngineState` after `previousFrame` with a one-line comment. It is "Same order as the options; empty array when none. Assigned once, never replaced." (data-model.md). Do not change any other type (depends on T003)

**Checkpoint**: Run `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`; expect only the expected "missing `captureTargets`" error in `src/core/simulation-orchestrator/engine.ts`, which T007 fixes.

---

## Phase 3: User Story 1 - Capture Targets Are Pre-Allocated at Engine Creation (Priority: P1) MVP

**Goal**: `createEngine` validates the configured targets and allocates one zero-filled buffer per target with the initial state, before the renderer.

**Independent Test**: `npx vitest run tests/unit/frame-capture/create.test.ts tests/unit/simulation-orchestrator/engine.test.ts` passes: sizes, types, initial state, validation errors, empty default, failure leaves no renderer.

### Tests for User Story 1

- [ ] T005 [P] [US1] Create `tests/unit/frame-capture/create.test.ts` testing `createCaptureTargets` directly with real arrays (no mocks): empty configs return `[]`; `{ id: 'a', maxCapacity: 4, mode: 'stop' }` with `frameSize` 6 gives a `Uint8ClampedArray` of length 24, all zero, `isRecording` true, `headIndex` 0, `totalFramesRecorded` 0, and `frameSize` 6; several configs give independent buffers (not the same instance) in config order; each of `id` of `''` and a non-string (cast through `unknown` via a typed helper, no `any`) throws `CaptureError` with reason `invalid-id`; a repeated `id` throws `duplicate-id`; `maxCapacity` of `0`, `-1`, `1.5`, `NaN`, `Infinity` throws `invalid-capacity`; a `mode` other than `'stop'` or `'loop'` throws `invalid-mode`; validation is in array order, first failure throws. Spec "US1/5" (depends on T002)
- [ ] T006 [P] [US1] In `tests/unit/simulation-orchestrator/engine.test.ts` add tests (use the existing `makeEngine` helper and its tracked-engine cleanup): an engine without `captureTargets` has `engine.captureTargets` equal to `[]`; a 3x2 engine with `{ id: 'a', maxCapacity: 4, mode: 'stop' }` and `{ id: 'b', maxCapacity: 2, mode: 'loop' }` has two targets in order with buffer lengths 24 and 12, buffers distinct from each other and from `engine.noise.output.data` and `engine.previousFrame`, and the initial state `isRecording` true, `headIndex` 0, `totalFramesRecorded` 0; buffer length stays image-based (not viewport-based) when `viewportWidth`/`viewportHeight` differ; an invalid target config rejects `createEngine` with `CaptureError`; the existing creation-failure assertions continue passing. For US1/6, assert an oversized `maxCapacity` rejects with the native `RangeError` (use a capacity such that `maxCapacity * width * height` exceeds the typed array limit, e.g. `Number.MAX_SAFE_INTEGER`) and, matching how existing tests spy on renderer creation, that no renderer was created (depends on T004)

### Implementation for User Story 1

- [ ] T007 [US1] In `src/core/frame-capture/create.ts` export `createCaptureTargets(frameSize: number, configs: readonly CaptureTargetConfig[]): CaptureTarget[]`. For each config in array order, validate and throw `CaptureError` for the first failure: `id`: `typeof id === 'string'` and `id.length > 0`, else `invalid-id`; not seen earlier in the array, else `duplicate-id`; `maxCapacity`: `Number.isInteger(maxCapacity) && maxCapacity > 0`, else `invalid-capacity`; `mode`: `'stop'` or `'loop'`, else `invalid-mode`. Then allocate `new Uint8ClampedArray(config.maxCapacity * frameSize)` once and push a record `{ id, mode, maxCapacity, frameSize, buffer, isRecording: true, headIndex: 0, totalFramesRecorded: 0 }`. Do not wrap or catch the native `RangeError`; no size cap; no memory probing; `Set` or a nested loop is fine (creation path, not hot). Export it from `src/core/frame-capture/index.ts` (depends on T002, T003)
- [ ] T008 [US1] In `src/core/simulation-orchestrator/engine.ts` import `createCaptureTargets` and in `createEngine` call `createCaptureTargets(noise.pixelCount, options.captureTargets ?? [])` after `previousFrame` is allocated and before `await createRenderer(...)`, and include the result as `captureTargets` in the returned `EngineState`; add no `try`/`catch` so a validation error or `RangeError` leaves no canvas allocated and the existing sub-module errors for bad dimensions are unchanged (FR-002, FR-004; research R8). `destroyEngine` stays unchanged. In `src/core/simulation-orchestrator/index.ts` re-export `CaptureError` and the types `CaptureMode`, `CaptureTarget`, `CaptureTargetConfig`, `CaptureErrorReason` (depends on T004, T007)
- [ ] T009 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/frame-capture/create.test.ts` and then `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator/engine.test.ts` as separate commands, fix failures, then run `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`; if validation or pre-allocation cannot be done without breaking a constitution principle, halt and flag it (Principle VI)

**Checkpoint**: Targets are validated and pre-allocated at creation (MVP).

---

## Phase 4: User Story 2 - Stop Mode Fills Once and Halts (Priority: P1)

**Goal**: Each tick copies the final frame into every recording target at `headIndex * frameSize`; a stop-mode target halts when full.

**Independent Test**: `npx vitest run tests/unit/frame-capture/capture.test.ts tests/unit/simulation-orchestrator/tick.test.ts` passes: slot contents match the returned frames, head and count advance, and recording halts at capacity.

### Tests for User Story 2

- [ ] T010 [P] [US2] Create `tests/unit/frame-capture/capture.test.ts` testing `captureFrame` directly with real targets from `createCaptureTargets` and hand-written `Uint8ClampedArray` frames (no mocks): stop target capacity 3, `frameSize` 4, frames A, B, C, D, E; after each call the frame lies at slot `headIndex_before` (`buffer.subarray` in the test only), `headIndex` and `totalFramesRecorded` rise by 1; after the third call `headIndex` is 3, `totalFramesRecorded` is 3, `isRecording` is false; calls 4 and 5 leave the buffer, `headIndex`, and `totalFramesRecorded` unchanged; capacity 1 stores only the first frame and stops; targets are processed in array order and independently; an empty target list is a no-op; `isRecording = false` set by the test skips the target untouched, and setting it back to `true` resumes at the same `headIndex` (US5/3). Spec US2 AC1-4 (depends on T002, T007)
- [ ] T011 [P] [US2] In `tests/unit/simulation-orchestrator/tick.test.ts` add tests: with a stop target of capacity 2 on the 4x1 engine, `tick(engine, 0)` then `tick(engine, 500)` leaves slot 0 equal to `[0,0,0,0]` and slot 1 equal to `[0,50,100,125]`, both equal to the returned `data` byte for byte, `headIndex` 2, `totalFramesRecorded` 2, `isRecording` false, and `tick(engine, 1000)` changes nothing in the target; with noise and a narrow window/level the newest slot equals the returned final bytes and `engine.previousFrame` (SC-002); an engine with no targets ticks as before (depends on T008)

### Implementation for User Story 2

- [ ] T012 [US2] In `src/core/frame-capture/capture.ts` export `captureFrame(targets: CaptureTarget[], frame: Uint8ClampedArray): void` using an indexed `for (let i = 0; i < targets.length; i++)` with `const target = targets[i]`. `tsconfig.json` enables `noUncheckedIndexedAccess`, so `targets[i]` is `CaptureTarget | undefined`; narrow with a plain `if (target === undefined) continue`, never a cast. Skip when `!target.isRecording`; else `target.buffer.set(frame, target.headIndex * target.frameSize)`, `target.headIndex++`, `target.totalFramesRecorded++`, then `if (target.headIndex === target.maxCapacity)` set `target.isRecording = false` when `target.mode === 'stop'` (leave `headIndex` at `maxCapacity`). Loop handling is added by T015. No allocation, no validation of `frame.length`. Export it from `src/core/frame-capture/index.ts` (depends on T007)
- [ ] T013 [US2] In `src/core/simulation-orchestrator/tick.ts` import `captureFrame` from `../frame-capture` and add `captureFrame(engine.captureTargets, processed.data)` directly after `engine.previousFrame.set(processed.data)` and before `return processed`; the `Number.isFinite` check stays first so a throwing tick never reaches it (FR-006, FR-009) (depends on T008, T012)
- [ ] T014 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/frame-capture/capture.test.ts` and then `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator/tick.test.ts` as separate commands and fix failures

**Checkpoint**: Stop-mode capture works end to end.

---

## Phase 5: User Story 3 - Loop Mode Is a Ring Buffer (Priority: P1)

**Goal**: A loop-mode target wraps `headIndex` to 0 at capacity and keeps recording, overwriting the oldest frame.

**Independent Test**: `npx vitest run tests/unit/frame-capture/capture.test.ts tests/unit/simulation-orchestrator/tick.test.ts` passes: wrap contents, head, count, and oldest/newest formulas.

### Tests for User Story 3

- [ ] T015 [P] [US3] In `tests/unit/frame-capture/capture.test.ts` add loop tests: capacity 3, `frameSize` 4, five distinct frames; after five calls slot 0 holds frame 4, slot 1 holds frame 5, slot 2 holds frame 3, `headIndex` 2, `totalFramesRecorded` 5, `isRecording` true; `headIndex` is 0 right after the third call and recording stays on; capacity 1 overwrites slot 0 every call with `headIndex` 0; run more than two full wraps (e.g. capacity 4, 11 frames) and assert after every call `totalFramesRecorded % maxCapacity === headIndex`, the newest slot `(headIndex - 1 + maxCapacity) % maxCapacity` equals the last frame, and once wrapped the oldest slot `headIndex` equals the frame written `maxCapacity` calls earlier; a loop and a stop target in the same array behave independently. Spec US3 AC1-4 (depends on T012)
- [ ] T016 [P] [US3] In `tests/unit/simulation-orchestrator/tick.test.ts` add the contract worked example: targets `{ id: 'first', maxCapacity: 2, mode: 'stop' }` and `{ id: 'last', maxCapacity: 2, mode: 'loop' }`; ticks at `0`, `500`, `1000` produce exactly the contract table: after tick 3 `first` is `a, b` / 2 / 2 / false and `last` is `c, b` / head 1 / total 3 / recording true, with the oldest slot 1 (`b`) and the newest slot 0 (`c`) (depends on T013)

### Implementation for User Story 3

- [ ] T017 [US3] In `src/core/frame-capture/capture.ts` extend the full-buffer branch: when `target.headIndex === target.maxCapacity`, a `'stop'` target sets `isRecording = false` and a `'loop'` target sets `headIndex = 0` and stays recording (FR-007); keep it a plain `if`/`else`, no modulo, no allocation (depends on T012)
- [ ] T018 [US3] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/frame-capture` and then `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator` as separate commands and fix failures

**Checkpoint**: Stop and loop semantics match the spec exactly (SC-003).

---

## Phase 6: User Story 4 - Zero Allocation Within the Tick Budget (Priority: P1)

**Goal**: Prove capture creates no JS heap garbage, never changes a buffer's identity or length, and stays within the 5 ms tick budget.

**Independent Test**: `npm run test:tick-bench` passes: bounded heap growth against the allocating control with targets recording, stable identities, mean tick under 5 ms.

### Tests for User Story 4

- [ ] T019 [P] [US4] Extend `tests/unit/simulation-orchestrator/tick.bench.ts`: add `captureTargets` of one loop target and one stop target, each with `maxCapacity: 8`, to the 512x512 benchmark engine options (about 2 MB each); keep the existing 5 ms and under-100 KB heap assertions and the allocating control unchanged; ensure the measured loop runs long enough to wrap the loop target several times and halt the stop target (assert `isRecording` false for the stop target and `totalFramesRecorded` greater than `maxCapacity` for the loop target after the run); assert each target and its `buffer` are the same instances with the same lengths before and after (US4/3). Remove any new `console.info` (depends on T013)
- [ ] T020 [P] [US4] In the same file add a capture-only micro-benchmark that calls `captureFrame` on a loop target of capacity 8 with a 512x512 frame, warmed up, and asserts mean time under 0.1 ms per call, with a one-line comment recording the measured cost (depends on T017)
- [ ] T021 [US4] Audit `src/core/frame-capture/capture.ts` and the `tick.ts` diff against the hot-path list in the Format section: one indexed `for`, one `.set(frame, offset)` per recording target, integer counter updates only, no new allocation construct, no `buffer` reassignment or resizing anywhere in `src/` (grep for `.buffer =` and `new Uint8ClampedArray` outside `create.ts`/`engine.ts`) (depends on T017, T013)
- [ ] T022 [US4] Run `fnm env --shell fish | source; and fnm use 24; and npm run test:tick-bench`; fix failures. If the heap or time assertion fails and cannot be fixed without allocation or breaking a constitution principle, halt and flag it (Principle VI) (depends on T019, T020, T021)

**Checkpoint**: Zero allocation and the 5 ms budget are proven with capture on.

---

## Phase 7: User Story 5 - Targets Do Not Disturb the Pipeline (Priority: P2)

**Goal**: Capture targets never change returned frames or error behavior.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator/tick.test.ts` passes: identical output with and without targets, and unchanged state after invalid time.

### Tests for User Story 5

- [ ] T023 [P] [US5] In `tests/unit/simulation-orchestrator/tick.test.ts` add tests: two engines with identical options and layers except `captureTargets` return byte-identical frames on every tick of a sequence, including with noise (use the same seed via `reseed`); the returned image and its `data` remain the same instances across calls and are not any target buffer; for `NaN`, `Infinity`, and `-Infinity`, `tick` throws `SimulationError` with reason `invalid-time` and each target's `buffer` (copied before), `headIndex`, `totalFramesRecorded`, and `isRecording` are unchanged (SC-005); pausing via `isRecording = false` leaves buffer and counters untouched across ticks and resuming writes at the same `headIndex` (US5/3); `engine.captureTargets`, each target, and each buffer are the same instances after many ticks (depends on T017)
- [ ] T024 [US5] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator` and fix failures (depends on T023)

**Checkpoint**: All five stories verified.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T025 Run full verification as separate commands: `fnm env --shell fish | source; and fnm use 24; and npm test`, `fnm env --shell fish | source; and fnm use 24; and npm run test:tick-bench`, `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`, `fnm env --shell fish | source; and fnm use 24; and npm run lint`; all must pass with no semicolons, `any`, or `@ts-ignore` in changed files
- [ ] T026 Walk through `quickstart.md` scenarios 1-13 against the passing tests and note any scenario without a covering test; add the missing test rather than skipping it
- [ ] T027 Commit per constitution V with Conventional Commits under 50 characters, staging with `git add` as its own command and committing as its own command, in logical milestones: `feat: add frame capture targets`, then `test: bench frame capture`

---

## Dependencies & Execution Order

- **Setup (T001)** and **Foundational (T002 -> T003 -> T004)** block all stories.
- **US1**: T005 || T006; T007 needs T002, T003; T008 needs T004, T007; T009 after T005, T006, T008.
- **US2**: needs US1; T010 || T011; T012 needs T007; T013 needs T008, T012; T014 after T010, T011, T013.
- **US3**: needs T012; T015 || T016; T017 needs T012; T018 after T015, T016, T017. Note T014 passes the stop tests only if T012 includes stop handling; loop tests fail until T017.
- **US4**: needs T013, T017; T019 || T020 || T021; T022 after all three.
- **US5**: needs T017; T023 then T024.
- **Polish** after all stories.

### Parallel Opportunities

- T005 || T006
- T010 || T011
- T015 || T016
- T019 || T020 || T021
- US4 and US5 can proceed in parallel once US3 is done (different files except `tick.test.ts` vs `tick.bench.ts`)

### Parallel Example

```text
Task: "Create tests/unit/frame-capture/create.test.ts for createCaptureTargets" (T005)
Task: "Add target allocation tests to tests/unit/simulation-orchestrator/engine.test.ts" (T006)
```

## Implementation Strategy

### MVP First

1. Setup and Foundational: T001-T004
2. US1 (T005-T009): validated, pre-allocated targets; stop and validate, then commit

### Incremental Delivery

1. Add US2 (T010-T014): the per-tick copy and stop mode
2. Add US3 (T015-T018): ring buffer behavior
3. Add US4 (T019-T022): zero allocation and 5 ms budget confirmed with capture on
4. Add US5 (T023-T024): pipeline untouched, pause and resume
5. Polish (T025-T027) and commit
