---

description: "Task list for the Grayscale Blending feature"
---

# Tasks: Grayscale Blending

**Input**: Design documents from `/specs/003-grayscale-blending/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/grayscale-blending-api.md](./contracts/grayscale-blending-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The constitution mandates `vitest` tests with real buffers and no mocks for pixel pipelines, and benchmarks for hot loops.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project (per [plan.md](./plan.md) Structure Decision): `src/core/grayscale-blending/` (exactly 3 files: `index.ts`, `types.ts`, `blend.ts`) and `tests/unit/grayscale-blending/` (`blend.test.ts`, `blend.bench.ts`). All operations and helpers live in `blend.ts` as plain functions; helpers are unexported. Do NOT add more source files, classes, mode enums, or per-mode strategies. Code style: strict TypeScript, no `any`/`@ts-ignore`, no semicolons, no `Math.min`/`Math.max` clamping in loops (native `Uint8ClampedArray` store does the clamping), no allocation inside loops. Node/npm commands must be prefixed with `fnm env --shell fish | source; and fnm use 24; and` and written in Fish syntax.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directories only; no new dependencies or config changes are needed

- [X] T001 Create directories `src/core/grayscale-blending/` and `tests/unit/grayscale-blending/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The error type, the validation helpers, and the public entry point that every story depends on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Define in `src/core/grayscale-blending/types.ts`: `BlendError` (`class BlendError extends Error`, constructor `(message: string)`, `this.name = 'BlendError'`, no reason codes, no `cause`) and re-export `GrayscaleImage` with `export type { GrayscaleImage } from '../image-loader'`; this is the only class in the module and holds no image data (depends on T001)
- [X] T003 [P] Add unexported validation helpers to `src/core/grayscale-blending/blend.ts`, each throwing a single `BlendError` with a message naming the failure and writing nothing: `validateLayer(layer, width, height)` throws unless "`width` and `height` are positive integers, equal to the layer's `width` and `height`, and `layer.data.length === width * height`"; `validateOut(out, pixelCount)` throws unless `out.length === pixelCount`. No reason codes, no error classification (depends on T002)
- [X] T004 [P] Create `src/core/grayscale-blending/index.ts` exporting `BlendError` and the `GrayscaleImage` type from `./types` (later stories append `addLayers`, `subtractLayers`, `alphaMask` in their own tasks) (depends on T002)

**Checkpoint**: Error type and validation helpers exist; no blend operations yet.

---

## Phase 3: User Story 1 - Add and subtract layers (Priority: P1) MVP

**Goal**: `addLayers` and `subtractLayers` combine two or more same-size layers into one flat buffer, saturating at 0-255 without wrapping, without modifying inputs.

**Independent Test**: Blend small hand-written layers and compare the output to hand-computed expected values, including overflow and underflow.

### Tests for User Story 1

> Write these first and confirm they fail before T006.

- [X] T005 [US1] Create `tests/unit/grayscale-blending/blend.test.ts` with US1 tests (Vitest, real `Uint8Array` fixtures written by hand, no mocks, no fixture generation scripts): (a) `addLayers` of `[200,100,0,50]` and `[100,100,0,250]` (2x2) equals `[255,200,0,255]` (saturates, never wraps); (b) `addLayers` of three layers `[100,0,50,255]`, `[100,0,50,1]`, `[100,0,50,0]` equals `[255,0,150,255]`; (c) `subtractLayers` of `[10,100,255,0]` minus `[20,40,5,0]` equals `[0,60,250,0]` (floors at 0, never wraps); (d) three-layer `subtractLayers` of `[100,50,10,255]`, `[30,60,5,5]`, `[20,10,10,250]` equals `[50,0,0,0]` (later layers subtracted from the first, in order); (e) a single layer passed to either function returns an exact copy of its `data` that is a different `Uint8Array` instance; (f) the output `length` equals `width * height` and the input `data` arrays are byte-for-byte unchanged after every call; (g) each of these throws `BlendError` for both functions: empty `layers`, differing widths, differing heights, `data.length !== width * height`, width or height of `0`, negative, or non-integer (e.g. `2.5`) (depends on T003, T004)

### Implementation for User Story 1

- [X] T006 [US1] Implement in `src/core/grayscale-blending/blend.ts` an unexported `accumulate(layers, sign, out)` and the exported `addLayers(layers: readonly GrayscaleImage[]): Uint8Array` and `subtractLayers(layers: readonly GrayscaleImage[]): Uint8Array` (the optional `out` parameter is added in T010). At the very top of each exported function, throw `BlendError` if `layers.length === 0`, then `validateLayer` every layer against the first layer's `width`/`height` (the first layer is validated against its own dimensions), all before any allocation or write. Then create `new Uint8Array(width * height)` and call `accumulate`, which creates one `new Uint8ClampedArray(out.buffer, out.byteOffset, out.length)` and runs a single pixel-major `for` loop: `let acc = first.data[i]`, inner loop over `k = 1..layers.length - 1` doing `acc += sign * layers[k].data[i]`, then one store `clamped[i] = acc` (`sign` is `1` for add, `-1` for subtract). No `Math.min`/`Math.max`, no allocation inside the loops. Export both functions from `src/core/grayscale-blending/index.ts` (depends on T005)

**Checkpoint**: User Story 1 is fully functional and independently testable (MVP).

---

## Phase 4: User Story 2 - Composite with an alpha mask (Priority: P2)

**Goal**: `alphaMask` composites an overlay onto a base using a same-size mask, from fully transparent (base) to fully opaque (overlay), with proportional blends in between.

**Independent Test**: Composite known base, overlay, and mask buffers and compare each pixel to the hand-computed blend.

### Tests for User Story 2

> Write these first and confirm they fail before T008.

- [X] T007 [US2] Add US2 tests to `tests/unit/grayscale-blending/blend.test.ts`: (a) base `[0,100,200,50]`, overlay `[255,200,100,150]`, mask `[0,255,128,64]` (2x2) equals `[0,200,150,75]`; (b) an all-`0` mask returns exactly the base values and an all-`255` mask returns exactly the overlay values; (c) input `data` arrays (base, overlay, mask) are byte-for-byte unchanged and the result is a new `Uint8Array` of length `width * height`; (d) `BlendError` is thrown when the mask, base, or overlay has a different width or height from the others, when any `data.length !== width * height`, and when any width or height is zero, negative, or non-integer (depends on T006)

### Implementation for User Story 2

- [X] T008 [US2] Implement exported `alphaMask(base, overlay, mask): Uint8Array` in `src/core/grayscale-blending/blend.ts` (the optional `out` parameter is added in T010): at the very top `validateLayer(base, base.width, base.height)`, then `validateLayer(overlay, ...)` and `validateLayer(mask, ...)` against the base's dimensions, before any allocation or write (no temporary array of layers). Then create `new Uint8Array(width * height)`, one `Uint8ClampedArray` view over it, and a single `for` loop storing `clamped[i] = b + (o - b) * m / 255` where `b`, `o`, `m` are the base, overlay, and mask values at `i`; rely on the native store for rounding and clamping (no `Math.round`, `Math.min`, `Math.max`). Export it from `src/core/grayscale-blending/index.ts` (depends on T007)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Blend into a reusable output buffer (Priority: P3)

**Goal**: All three functions accept an optional `out` buffer, fill it in place, return the same reference, and stay correct when `out` is also one of the inputs, with no allocation that scales with image size.

**Independent Test**: Blend repeatedly into a supplied `out`, check the returned reference and values, check aliasing for every input position, and benchmark time and heap growth.

### Tests for User Story 3

> Write these first and confirm they fail before T010.

- [X] T009 [US3] Add US3 tests to `tests/unit/grayscale-blending/blend.test.ts`: (a) for each of `addLayers`, `subtractLayers`, and `alphaMask`, a supplied `out` of length `width * height` receives the same values as the no-`out` call and the returned value `toBe` the supplied `out`; (b) without `out`, a new `Uint8Array` of length `width * height` is returned; (c) aliasing: with `out` being the same `data` reference as each input in turn (first, second, and third layer for three-layer add and subtract; base, overlay, and mask for `alphaMask`), the result equals the expected values computed from the original inputs (copy the originals before the call); (d) a wrong-length `out` (too short and too long) throws `BlendError` for each function and leaves `out` byte-for-byte unchanged (e.g. pre-filled with `7`), as does any other validation failure with `out` supplied (depends on T008)

### Implementation for User Story 3

- [X] T010 [US3] In `src/core/grayscale-blending/blend.ts`, add the optional trailing parameter `out?: Uint8Array` to `addLayers`, `subtractLayers`, and `alphaMask`: after the existing layer validation and still before any write, call `validateOut(out, width * height)` when `out` is supplied, otherwise allocate `new Uint8Array(width * height)` once; compute into the chosen buffer and return that same reference. Keep the single pixel-major loop (each index's inputs are read before that index is written) so aliasing is safe, and do not copy inputs or use temporary buffers; update the exports and the contract-matching signatures in `src/core/grayscale-blending/index.ts` if needed (depends on T009)
- [X] T011 [P] [US3] Create `tests/unit/grayscale-blending/blend.bench.ts`, following the pattern and heap-growth control in `tests/unit/image-loader/to-grayscale.bench.ts`: (a) `addLayers` of two 4096x4096 layers into a pre-sized `out` completes under 50 ms (SC-005), and the same for `alphaMask`; (b) repeated calls (e.g. 5 rounds of 200 iterations) on 1024x1024 layers with a supplied `out` show maximum JS heap growth far below the 1 MiB pixel buffer size and below the control's growth (SC-004: only a constant-size view header per call is permitted), with the allocating control asserted to register above 100_000 bytes so a zero reading means something (depends on T010)

**Checkpoint**: All three user stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T012 [P] Run `fnm env --shell fish | source; and fnm use 24; and npm run typecheck` and `fnm env --shell fish | source; and fnm use 24; and npm run lint` and fix findings in `src/core/grayscale-blending/` and `tests/unit/grayscale-blending/` (no semicolons, no `any`, no `@ts-ignore`) (depends on T011)
- [X] T013 Run `fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/grayscale-blending` and then the full `npm test`, and walk through every scenario in [quickstart.md](./quickstart.md); confirm `src/core/grayscale-blending/` contains exactly the 3 planned files, `blend.ts` contains no `Math.min`/`Math.max`/`Math.round` in loops and no loop-time allocation, and nothing imports Svelte, `document`, `window`, Canvas, or WebGPU. If the 4096x4096 benchmark misses 50 ms, add a two-layer fast path inside `accumulate` in the same file (per [research.md](./research.md) section 3) and re-run; do not add new files (depends on T012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories
- **User Stories (Phase 3-5)**: Depend on Foundational. They all edit the same `blend.ts` and `blend.test.ts`, so they proceed sequentially in priority order (P1, P2, P3) rather than in parallel
- **Polish (Phase 6)**: Depends on all stories

### Task-Level Dependencies

- T002 needs T001; T003 and T004 need T002 and are independent of each other
- Each story: tests (T005, T007, T009) before implementation (T006, T008, T010)
- T011 needs T010; T012 needs T011; T013 needs T012

### Parallel Opportunities

- T003 and T004 (different files, both after T002)
- T011 can be authored in parallel with nothing else once T010 is complete; T012 can start once T011 is done

---

## Parallel Example: Foundational Phase

```text
# After T002 completes, launch together:
Task: "Add validation helpers in src/core/grayscale-blending/blend.ts"
Task: "Create src/core/grayscale-blending/index.ts exporting BlendError and GrayscaleImage"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (`addLayers`, `subtractLayers`)
4. **STOP and VALIDATE**: run `npx vitest run tests/unit/grayscale-blending` (Fish + `fnm` prefix)

### Incremental Delivery

1. Setup + Foundational: error type and validation ready
2. Add User Story 1: add/subtract with saturation (MVP)
3. Add User Story 2: alpha-mask compositing
4. Add User Story 3: reusable output buffer, aliasing safety, benchmark
5. Polish: typecheck, lint, full test run, quickstart walkthrough

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps each task to its user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group using Conventional Commits (subject under 50 characters)
- Native rounding in `Uint8ClampedArray` is round-half-to-even; the hand-computed alpha fixtures avoid exact `.5` results

---

## Phase 7: Convergence

- [X] T014 Add tests to `tests/unit/grayscale-blending/blend.test.ts` that each of `addLayers`, `subtractLayers`, and `alphaMask` throws `BlendError` and leaves a supplied `out` (pre-filled with `7`, correct length) byte-for-byte unchanged when the layers are invalid: mismatched widths or heights, `data.length !== width * height`, zero/negative/non-integer dimensions, an empty `layers` list for add/subtract, and a mismatched mask for `alphaMask` per FR-011, SC-002 (partial)
- [X] T015 Add tests to `tests/unit/grayscale-blending/blend.test.ts` covering the two-layer path of `addLayers` and `subtractLayers` with a supplied `out`: saturation at 255 and 0, and correct results when `out` is the first layer's `data` and when it is the second layer's `data` per FR-009, US3/AC4 (partial)
- [X] T016 Extend the heap-growth check in `tests/unit/grayscale-blending/blend.bench.ts` to also run `subtractLayers` with two layers and `addLayers` with three layers into a supplied `out`, keeping the existing control and thresholds per Constitution IV, SC-004 (partial)

## Phase 8: Convergence

- [X] T017 Resolve the `Uint8ClampedArray` view allocation in `src/core/grayscale-blending/blend.ts`: redesign the output/input buffer typing and clamped-write path so calls with a supplied output allocate no heap memory while preserving same-reference input aliasing, saturating results, and the public grayscale buffer contract; update focused tests and buffer contract references as required, and verify the supplied-output path structurally and with benchmarks per Constitution I, Constitution IV, FR-009, FR-013 (contradicts)
- [X] T018 Add a warmed 4096x4096 `subtractLayers` benchmark with a supplied output and assert completion under 50 ms, matching the existing add benchmark's setup and budget per SC-005 (partial)

## Phase 9: Convergence

- [X] T019 Tighten the heap-growth assertions in `tests/unit/grayscale-blending/blend.bench.ts` from `< 64_000` to `< 10_000` per operation (matching `tests/unit/image-loader/to-grayscale.bench.ts`), keeping the `> 100_000` control, and confirm the benchmark passes since supplied-output calls no longer allocate per Constitution IV, FR-013, SC-004 (partial)
- [X] T020 Reconcile the shared `GrayscaleImage` buffer-type change: update `specs/003-grayscale-blending/plan.md` (Technical Context dependencies and Structure Decision) to list the modified `src/core/image-loader/` files and the adjusted image-loader and headless-renderer tests, and update the `Uint8Array` references for `GrayscaleImage.data` in the `specs/001-image-loader` and `specs/002-headless-renderer` data-model and contract documents to `Uint8ClampedArray` per plan: Technical Context and Structure Decision, Constitution II (unrequested)

## Phase 10: Convergence

- [X] T021 Update the grayscale image-data buffer type from `Uint8Array` to `Uint8ClampedArray` in `specs/001-image-loader/plan.md` (summary, Constraints, Constitution Check rows, structure comment), `specs/001-image-loader/research.md` (grayscale decision), `specs/002-headless-renderer/plan.md` (Constitution I row and tension 2), and `specs/002-headless-renderer/research.md` (image texture rationale and worker-transfer finding), leaving RGBA readback `Uint8Array` references unchanged per plan: Technical Context, Constitution II (partial)
- [X] T022 Correct `specs/003-grayscale-blending/research.md` section 4 so it states that `GrayscaleImage.data` is `Uint8ClampedArray` only, instead of accepting both `Uint8Array` and `Uint8ClampedArray` per FR-001, plan: Technical Context (partial)
- [X] T023 Make the heap-growth check in `tests/unit/grayscale-blending/blend.bench.ts` independent of baseline subtraction: assert each operation raw heap growth (for example the minimum over repeated rounds) against the `< 10_000` limit while keeping the `> 100_000` allocating control, and confirm it passes reliably per Constitution IV, SC-004 (partial)
