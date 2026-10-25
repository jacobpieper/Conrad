---

description: "Task list for previous-frame-state"
---

# Tasks: Previous Frame State

**Input**: Design documents from `/specs/011-previous-frame-state/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/previous-frame-api.md, quickstart.md; modifies `src/core/simulation-orchestrator/` (`types.ts`, `engine.ts`, `tick.ts`) and adds isolated benchmark configuration in `vitest.tick-bench.config.ts`, a `test:tick-bench` script in `package.json`, and an exclusion in `vitest.config.ts`; all other core modules are unchanged.

**Tests**: Included. The spec (SC-001 to SC-004) and constitution Principle IV require vitest unit tests with real buffers (no mocks) and a benchmark proving zero JS heap allocation and the time budget for the hot-loop change.

**Organization**: Tasks are grouped by user story: US1 = Previous Output Is Retained Across Ticks (P1), US2 = Readable by Later Stages (P1), US3 = No Allocation, No Budget Impact (P1). The field and its allocation (Phase 2) are shared by every story; US1 adds the copy in `tick`; US2 and US3 add verification only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Terminal commands use Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and ...` (constitution V). Run each command on its own, never pipe its output through `grep`, `head`, or `tail`, never use here-docs, never chain commands with `&&`, `||`, or `;` beyond the mandatory prefix, and always use `npx vitest run` (never watch mode)
- Code style: strict TypeScript, no semicolons, no `any`, no `@ts-ignore`, no blanket `as` casts (constitution V)
- Hot path (`tick`): plain property reads and calls only; no destructuring, object or array literals, closures, spreads, iterators, array methods, template strings, `try`/`catch`, `subarray`, `slice`, or `Math.random`
- Edit tools run in parallel with terminal commands when called in the same step, so run `git add` in a separate step after the file edits

---

## Phase 1: Setup

No new dependencies are needed. The isolated time-sensitive benchmark uses `vitest.tick-bench.config.ts` and the `test:tick-bench` package script; no new files in `src/` are needed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `previousFrame` field and its one-time allocation, used by all stories.

- [X] T001 In `src/core/simulation-orchestrator/types.ts` add `previousFrame: Uint8ClampedArray` to the `EngineState` record after `renderer`, with a one-line comment: `// width * height bytes; holds the previous tick's final frame`. It is "Zero-filled at creation, overwritten in place at the end of every successful tick with a copy of `noise.output.data`" and "assigned once at creation and never replaced" (data-model.md). Do not change any other type
- [X] T002 In `src/core/simulation-orchestrator/engine.ts` update `createEngine` to allocate `previousFrame` once as `new Uint8ClampedArray(noise.pixelCount)` (zero-filled, length `width * height`, equal to `compositor.width * compositor.height`) after `createNoiseController` and before `await createRenderer(...)`, and include it in the returned `EngineState` record; do no new validation and add no `try`/`catch`, so invalid sizes are still rejected by the existing sub-module errors unchanged and no canvas is allocated on failure (FR-002, FR-003; research R7). `destroyEngine` stays unchanged (depends on T001)

**Checkpoint**: Run `fnm env --shell fish | source; and fnm use 24; and npm run typecheck`; types compile and existing engine tests still pass.

---

## Phase 3: User Story 1 - Previous Output Is Retained Across Ticks (Priority: P1) MVP

**Goal**: After each successful tick, `engine.previousFrame` equals the final frame that tick produced; a throwing tick leaves it unchanged.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator/tick.test.ts` passes: copy contents match the returned frame and hand-computed bytes, with noise and window/level, invalid time, and call order.

### Tests for User Story 1

- [X] T003 [P] [US1] In `tests/unit/simulation-orchestrator/tick.test.ts` add tests (real states, no mocks, using the existing `makeEngine` helper and the 4x1 layer `Uint8Array.from([0, 100, 200, 250])` at weight `1`) covering: US1/AC2 and the contract worked example with `addTemporalTrack(engine.temporal, id, [0, 1000], [0, 1])`: after `tick(engine, 500)` `Array.from(engine.previousFrame)` equals `[0, 50, 100, 125]` and equals the returned `data` byte for byte, after `tick(engine, 1000)` it equals `[0, 100, 200, 250]`, and after `tick(engine, 0)` it equals `[0, 0, 0, 0]`; `engine.previousFrame` is not the same instance as `engine.noise.output.data`; US1/AC4: with noise and window/level the stored frame equals the returned final bytes; US1/AC5 and SC-004: invalid times preserve the buffer byte-for-byte; US1/AC6: backwards time follows call order

### Implementation for User Story 1

- [X] T004 [US1] In `src/core/simulation-orchestrator/tick.ts` add `engine.previousFrame.set(processed.data)` as the statement after `updateBuffer(engine.renderer, processed)` and immediately before `return processed`; no offset argument, no `subarray`, `slice`, view, loop, or helper; the `Number.isFinite` check stays first so a throwing tick never reaches the copy (FR-004 to FR-006) (depends on T001)
- [X] T005 [US1] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator/tick.test.ts` and fix failures; if the copy cannot be done without allocation or without breaking a constitution principle, halt and flag it (Principle VI)

**Checkpoint**: The previous frame is stored correctly (MVP).

---

## Phase 4: User Story 2 - Readable by Later Stages (Priority: P1)

**Goal**: A stage running inside the next tick can read `engine.previousFrame` with the same type and length as the working frame, and it holds the previous tick's final frame until the final copy.

**Independent Test**: `npx vitest run tests/unit/simulation-orchestrator` passes: type, length, zero initial contents, identity stability, and between-tick contents.

### Tests for User Story 2

- [X] T006 [P] [US2] In `tests/unit/simulation-orchestrator/engine.test.ts` verify `previousFrame` is a zero-filled `Uint8ClampedArray` matching image pixel count, remains image-sized when viewport differs, is distinct from output data, and is not shared between engines; existing creation-failure assertions continue passing
- [X] T007 [P] [US2] In `tests/unit/simulation-orchestrator/tick.test.ts` verify initial zeros, stable identity, prior tick contents between ticks, and new final contents after each tick
- [X] T008 [US2] Audit `src/core/simulation-orchestrator/tick.ts` and usages of `previousFrame`: confirm the only writer is the single `.set` following `updateBuffer`, immediately before return; no new consumer or stage registry is added
- [X] T009 [US2] Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator` and fix failures

**Checkpoint**: The buffer's type, size, identity, and between-tick contents are verified.

---

## Phase 5: User Story 3 - No Allocation, No Budget Impact (Priority: P1)

**Goal**: Prove the copy creates no JS heap garbage and the tick stays within the existing 5 ms budget.

**Independent Test**: `npm run test:tick-bench` passes: bounded heap growth against the allocating control, stable identities including `previousFrame`, and mean tick time under 5 ms.

### Tests for User Story 3

- [X] T010 [P] [US3] Extend `tests/unit/simulation-orchestrator/tick.bench.ts` to verify the copied 512x512 bytes and stable `previousFrame` identity; retain the existing heap and 5ms assertions
- [X] T011 [US3] Audit `src/core/simulation-orchestrator/tick.ts`: it contains no new allocation construct and only one `.set` after the renderer update
- [X] T012 [US3] Measure the 512x512 `.set()` copy at 0.0035-0.0036ms and run `npm run test:tick-bench` in its dedicated single-worker context; warmed tick timing measures 3.37ms and passes the `< 5` assertion

**Checkpoint**: All three stories verified; the benchmark covers the hot-loop change.

---

## Phase 6: Polish & Cross-Cutting

- [X] T013 Run full verification: `npm test` passes all 259 standard tests with the timing benchmark excluded; `npm run test:tick-bench` passes all 4 dedicated benchmark tests; `npm run typecheck` and `npm run lint` pass
- [X] T014 Run the applicable `quickstart.md` scenarios 1-9 through engine/tick tests and focused benchmark; all specified buffer contents, identity, invalid-time, renderer and benchmark checks pass in the focused suite
- [X] T015 Commit per constitution V with Conventional Commits under 50 characters, staging with `git add` as its own command and committing as its own command: `feat: add previous frame buffer` followed by `test: isolate tick performance benchmark`

---

## Dependencies & Execution Order

- **Foundational (T001 -> T002)** blocks all stories; T001 also blocks T004.
- **US1**: T003 (test) || T004; both need T001 (T003 also needs T002 to compile and run); T004 -> T005.
- **US2**: needs T002 and T004; T006 || T007 || T008; T009 after all three.
- **US3**: needs T004; T010 || T011; T010 and T011 -> T012.
- **Polish** after all stories.

### Parallel Opportunities

- T003 || T004
- T006 || T007 || T008
- T010 || T011

### Parallel Example

```text
Task: "Add previous-frame tests to tests/unit/simulation-orchestrator/engine.test.ts" (T006)
Task: "Add identity and between-tick tests to tests/unit/simulation-orchestrator/tick.test.ts" (T007)
Task: "Audit previousFrame writers in src/core/simulation-orchestrator/tick.ts" (T008)
```

## Implementation Strategy

### MVP First

1. Foundational: T001, T002
2. US1 (T003-T005): the copy and its contents; stop and validate, then commit

### Incremental Delivery

1. Add US2 (T006-T009): type, size, identity, and between-tick checks
2. Add US3 (T010-T012): zero-allocation and 5 ms budget confirmed with the copy included
3. Polish (T013-T015) and commit

---

## Phase 7: Convergence

- [X] T016 Correct the Phase 5 independent benchmark command in `tasks.md` to `npm run test:tick-bench`; `quickstart.md` and `spec.md` contain no stale direct command for the excluded benchmark
- [X] T017 Record the dedicated benchmark config, package script, default-suite exclusion and rationale in `plan.md`; the dedicated command is the Constitution IV time and heap gate
- [X] T018 Add the requested `previousFrame` field comment in `types.ts`
- [X] T019 Remove `console.info` from `tick.bench.ts`, retain the `< 0.1` ms copy assertion, and record measured copy cost in a one-line comment

---

## Phase 8: Convergence

- [X] T020 Commit T016-T019 with Conventional Commits under 50 characters in `9f2891b` and `049c7af`; `.specify/memory/constitution.md` was not staged
- [X] T021 Reconcile the plan Summary, task prerequisites and Phase 1 setup text, and research R8 with the existing isolated benchmark config, package script, exclusion, copy-only assertion, and unchanged 5 ms tick gate
