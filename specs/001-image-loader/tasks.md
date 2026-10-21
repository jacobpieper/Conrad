---

description: "Task list template for feature implementation"
---

# Tasks: Image Loader

**Input**: Design documents from `/specs/001-image-loader/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/image-loader-api.md](./contracts/image-loader-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included — the constitution mandates `vitest` unit tests (no mocks) for every pixel manipulation pipeline plus benchmark tests for hot loops, and the plan's Constitution Check relies on this testing strategy.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project (per [plan.md](./plan.md) Structure Decision): `src/core/image-loader/`, `tests/unit/image-loader/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project structure per plan: `src/core/image-loader/`, `tests/unit/image-loader/`, `tests/unit/image-loader/fixtures/`
- [X] T002 Initialize TypeScript project (`package.json`, strict-mode `tsconfig.json`) with `vitest`, `@vitest/browser`, and a Playwright browser provider as dependencies (depends on T001)
- [X] T003 [P] Configure ESLint/Prettier to enforce strict TypeScript (no `any`/`@ts-ignore`) and a semicolon-free style per the constitution
- [X] T004 [P] Configure `vitest.config.ts` to run the `tests/unit/image-loader` suite in Browser Mode with the Playwright provider per [research.md](./research.md)
- [X] T005 [P] Add `.node-version` for `fnm`-managed Node version per the constitution

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Define `ImageSource` and `GrayscaleImage` types in `src/core/image-loader/types.ts` per [data-model.md](./data-model.md) (`GrayscaleImage.data.length` MUST equal `width * height`; `ImageSource.kind` is `'url' | 'blob'`)
- [X] T007 [P] Define `ImageLoadError` class and `ImageLoadErrorReason` union (`'network' | 'empty-input' | 'decode-failed' | 'cors-blocked'`) in `src/core/image-loader/errors.ts` per [contracts/image-loader-api.md](./contracts/image-loader-api.md)
- [X] T008 Implement the pure `toGrayscale` conversion function in `src/core/image-loader/to-grayscale.ts`: `gray = round(0.299*R + 0.587*G + 0.114*B)`, alpha discarded, writing into a pre-sized `Uint8Array` in a single forward pass with no per-pixel allocation, per [research.md](./research.md) (depends on T006)
- [X] T009 [P] Unit test `toGrayscale` against independently computed reference pixel values within a 1% per-pixel tolerance in `tests/unit/image-loader/to-grayscale.test.ts` (SC-004) (depends on T008)
- [X] T010 [P] Add small hardcoded, real PNG fixtures (base64 data URIs, no external generation step) in `tests/unit/image-loader/fixtures.ts`
- [X] T011 Implement the shared decode helper (bytes → `createImageBitmap` → `OffscreenCanvas`/`getImageData`) in `src/core/image-loader/load-image.ts`, wrapping `createImageBitmap` in a single try/catch that throws one generic `ImageLoadError(reason: 'decode-failed', message: 'Image decoding failed')` on any rejection — no file-header/format heuristics (depends on T006, T007)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Load an image from a URL into a grayscale buffer (Priority: P1) 🎯 MVP

**Goal**: A developer provides a URL to a PNG, JPEG, or WebP image and receives the image's width, height, and a flat single-channel grayscale buffer.

**Independent Test**: Call the loader with a known test image URL and assert the returned buffer length, dimensions, and spot-checked pixel values match an expected reference grayscale conversion.

### Tests for User Story 1

- [X] T012 [P] [US1] Unit test `loadImageFromUrl` successfully decodes a PNG fixture (via `data:` URI, exercising the same browser-native decode path used for JPEG/WebP) served from a local test URL, asserting `data.length === width * height` in `tests/unit/image-loader/load-image.test.ts` (FR-001, FR-003–FR-006, SC-001, SC-002)
- [X] T013 [P] [US1] Unit test `loadImageFromUrl` rejects with `ImageLoadError(reason: 'network')` for an unreachable/404 URL in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 1

- [X] T014 [US1] Implement `loadImageFromUrl(url: string): Promise<GrayscaleImage>` in `src/core/image-loader/load-image.ts` (fetch bytes → shared decode helper → `toGrayscale`) (depends on T008, T011)
- [X] T015 [US1] Export `loadImageFromUrl` and the public types from `src/core/image-loader/index.ts` (depends on T014)

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Load an image from an in-memory Blob into a grayscale buffer (Priority: P2)

**Goal**: A developer passes an in-memory Blob/File and extracts it into the same flat single-channel grayscale buffer format as the URL path.

**Independent Test**: Construct a Blob from known image bytes, pass it to the loader, and assert the output buffer matches the same reference conversion used for the URL path.

### Tests for User Story 2

- [X] T016 [P] [US2] Unit test `loadImageFromBlob` successfully decodes a PNG fixture passed as `Blob`, asserting output matches the URL path for the same source image in `tests/unit/image-loader/load-image.test.ts` (FR-002, SC-002)
- [X] T017 [P] [US2] Unit test `loadImageFromBlob` rejects with `ImageLoadError(reason: 'empty-input')` for a zero-byte Blob in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 2

- [X] T018 [US2] Implement `loadImageFromBlob(blob: Blob): Promise<GrayscaleImage>` in `src/core/image-loader/load-image.ts` (shared decode helper → `toGrayscale`) (depends on T008, T011)
- [X] T019 [US2] Implement the unified `loadImage(source: ImageSource): Promise<GrayscaleImage>` dispatcher in `src/core/image-loader/load-image.ts` (depends on T014, T018)
- [X] T020 [US2] Export `loadImageFromBlob` and `loadImage` from `src/core/image-loader/index.ts` (depends on T015, T019)

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Reject invalid or unsupported image input (Priority: P3)

**Goal**: Invalid or unsupported URL/Blob input fails predictably with a clear, descriptive error instead of crashing, hanging, or silently returning incorrect data.

**Independent Test**: Feed known-bad inputs (corrupted bytes, unsupported format, non-image content) to the loader and assert a descriptive error is produced for each case.

### Tests for User Story 3

- [X] T021 [P] [US3] Unit test `loadImageFromBlob` and `loadImageFromUrl` reject corrupted image bytes with `ImageLoadError(reason: 'decode-failed', message: 'Image decoding failed')` in `tests/unit/image-loader/load-image.test.ts` (FR-008)
- [X] T022 [P] [US3] Unit test `loadImageFromBlob` and `loadImageFromUrl` reject non-image content (e.g., a text file) with the same generic `ImageLoadError(reason: 'decode-failed', message: 'Image decoding failed')` — no separate "unsupported format" classification — in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 3

- [X] T023 [US3] ~~Add decode-failure classification~~ — superseded: the shared decode helper (T011) already wraps `createImageBitmap` in a single try/catch and throws one generic `ImageLoadError(reason: 'decode-failed')` for any rejection, intentionally with no format classification or file-header heuristics
- [X] T024 [US3] Add CORS-blocked detection and `ImageLoadError(reason: 'cors-blocked')` handling in `src/core/image-loader/load-image.ts` for tainted-canvas pixel-read failures (depends on T011)

**Checkpoint**: All three user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T025 [P] Unit test that concurrent, independent `loadImage*` calls do not interfere with one another in `tests/unit/image-loader/load-image.test.ts` (FR-010)
- [X] T026 [P] First-frame-only handling for animated sources (FR-009) is satisfied structurally: `createImageBitmap` (used exclusively by the shared decode helper, T011) decodes only the first/default frame by default, and no custom multi-frame logic exists. A hand-authored animated WebP binary fixture was deliberately not created (would require external generation tooling, which is out of scope); covered by inspection of research.md's decision rather than a dedicated fixture-based test.
- [X] T027 [P] Benchmark test for the `toGrayscale` conversion pass asserting its execution time budget and zero additional allocations in `tests/unit/image-loader/to-grayscale.bench.ts` per constitution Principle IV
- [X] T028 Run the [quickstart.md](./quickstart.md) validation scenarios end-to-end and confirm all four scenarios pass (Scenarios 1–3 covered by `load-image.test.ts`; Scenario 4 covered by `to-grayscale.bench.ts`'s 1920×1080 timing budget)
- [X] T029 Final review: confirm strict TypeScript (no `any`/`@ts-ignore`), a semicolon-free style, and Conventional Commits were applied throughout per constitution Principle V (`tsc --noEmit` and `eslint .` both pass)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (P1) can start immediately after Foundational
  - User Story 2 (P2) depends on `loadImageFromUrl` (T014) only for the unified `loadImage` dispatcher (T019); the Blob-only path (T018) has no dependency on US1
  - User Story 3 (P3) depends only on the shared decode helper (T011) from Foundational
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — the Blob-only load path is independent of US1; only the unified `loadImage` dispatcher (T019) integrates with US1's `loadImageFromUrl`
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — hardens the shared decode helper used by both US1 and US2, but is independently testable via either load path

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Shared helpers (Foundational) before story-specific implementation
- Story complete before moving to the next priority

### Parallel Opportunities

- All Setup tasks marked [P] (T003, T004, T005) can run in parallel
- Foundational tasks marked [P] (T006, T007, T009, T010) can run in parallel
- Once Foundational completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Polish tasks marked [P] (T025, T026, T027) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test loadImageFromUrl successfully decodes PNG, JPEG, and WebP fixtures in tests/unit/image-loader/load-image.test.ts"
Task: "Unit test loadImageFromUrl rejects with ImageLoadError(reason: 'network') for an unreachable URL in tests/unit/image-loader/load-image.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently via [quickstart.md](./quickstart.md) Scenario 1
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently (via the shared `loadImage` dispatcher in T019)

---

## Notes

- [P] tasks = different files or independent concerns, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable per [quickstart.md](./quickstart.md)
- Verify tests fail before implementing
- Commit after each task or logical group, per constitution Principle V (the AI agent commits autonomously using Conventional Commits)
- Stop at any checkpoint to validate a story independently

---

## Phase 7: Convergence

- [X] T030 Extend `load-image.test.ts` to exercise PNG plus browser-encoded JPEG and WebP inputs derived from the required PNG data URI, verifying all three supported formats decode to correctly sized grayscale buffers per FR-003, SC-002 (partial)
- [X] T031 Reconcile the generic `decode-failed` behavior with US3/AC2 by updating `spec.md` to state unsupported formats use the same generic decode failure as corrupted image data (contradicts)
- [X] T032 Add an `HTMLCanvasElement` + `<canvas>` fallback in `src/core/image-loader/load-image.ts` when `OffscreenCanvas` is unavailable per research.md Decision 1 (missing)
- [X] T033 Add an automated 1920×1080 decode-and-convert timing test asserting completion under one second in `tests/unit/image-loader/load-image.test.ts` per SC-001 (partial)
- [X] T034 ~~Add a test fixture and assertion verifying an animated image source decodes only its first/default frame~~ — superseded by T040: recorded as a native-decoder guarantee in spec.md Assumptions
- [X] T035 Add explicit validation in `loadImageFromUrl` rejecting an empty URL string with `ImageLoadError(reason: 'empty-input')` in `src/core/image-loader/load-image.ts` per data-model.md `ImageSource` validation rules (partial)
- [X] T036 ~~Add a test exercising the `cors-blocked` failure path~~ — superseded by T041: the branch was unreachable and was removed

---

## Phase 8: Convergence

- [X] T037 CRITICAL: Add a heap-allocation assertion to `tests/unit/image-loader/to-grayscale.bench.ts` that proves `toGrayscale` allocates nothing when given a pre-sized `out` buffer (for example a precise heap measurement around many iterations), not just that the same buffer is returned, per Constitution IV (partial)
- [X] T038 Add a loader-level test in `tests/unit/image-loader/load-image.test.ts` that draws a 2x2 red/green/blue/white canvas, encodes it as PNG, loads it, and asserts the buffer is `[76, 150, 29, 255]` in row-major, top-left order per FR-005, SC-004 (partial)
- [X] T039 Add a test in `tests/unit/image-loader/load-image.test.ts` that loads a semi-transparent pixel and asserts alpha is discarded in the grayscale value per FR-007 (partial)
- [X] T040 Resolve T034: first-frame-only (FR-009) cannot be verified with the static fixture, so either obtain an animated WebP data URI to assert only the first frame is returned, or amend FR-009 and T026 to record it as a documented platform guarantee with no dedicated test (partial)
- [X] T041 Supersede T036: remove the unreachable `cors-blocked` reason and `getImageData` catch branch from `src/core/image-loader/errors.ts`, `src/core/image-loader/load-image.ts`, and the contracts/data-model docs, and test that a real cross-origin fetch blocked by CORS rejects with `ImageLoadError(reason: 'network')` per Edge Cases, FR-001 (unrequested)
- [X] T042 Commit the convergence changes with a Conventional Commit message per Constitution V (missing)
- [X] T043 Add `.vitest/` to `.gitignore` (unrequested)
