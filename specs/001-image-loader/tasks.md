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

- [ ] T006 [P] Define `ImageSource` and `GrayscaleImage` types in `src/core/image-loader/types.ts` per [data-model.md](./data-model.md) (`GrayscaleImage.data.length` MUST equal `width * height`; `ImageSource.kind` is `'url' | 'blob'`)
- [ ] T007 [P] Define `ImageLoadError` class and `ImageLoadErrorReason` union (`'network' | 'empty-input' | 'unsupported-format' | 'decode-failed' | 'cors-blocked'`) in `src/core/image-loader/errors.ts` per [contracts/image-loader-api.md](./contracts/image-loader-api.md)
- [ ] T008 Implement the pure `toGrayscale` conversion function in `src/core/image-loader/to-grayscale.ts`: `gray = round(0.299*R + 0.587*G + 0.114*B)`, alpha discarded, writing into a pre-sized `Uint8Array` in a single forward pass with no per-pixel allocation, per [research.md](./research.md) (depends on T006)
- [ ] T009 [P] Unit test `toGrayscale` against independently computed reference pixel values within a 1% per-pixel tolerance in `tests/unit/image-loader/to-grayscale.test.ts` (SC-004) (depends on T008)
- [ ] T010 [P] Add small real PNG/JPEG/WebP test fixture images under `tests/unit/image-loader/fixtures/`
- [ ] T011 Implement the shared decode helper (bytes → `createImageBitmap` → `OffscreenCanvas`/`getImageData`, with `HTMLImageElement` + `<canvas>` fallback) in `src/core/image-loader/load-image.ts` per [research.md](./research.md) (depends on T006, T007)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Load an image from a URL into a grayscale buffer (Priority: P1) 🎯 MVP

**Goal**: A developer provides a URL to a PNG, JPEG, or WebP image and receives the image's width, height, and a flat single-channel grayscale buffer.

**Independent Test**: Call the loader with a known test image URL and assert the returned buffer length, dimensions, and spot-checked pixel values match an expected reference grayscale conversion.

### Tests for User Story 1

- [ ] T012 [P] [US1] Unit test `loadImageFromUrl` successfully decodes PNG, JPEG, and WebP fixtures served from a local test URL, asserting `data.length === width * height` in `tests/unit/image-loader/load-image.test.ts` (FR-001, FR-003–FR-006, SC-001, SC-002)
- [ ] T013 [P] [US1] Unit test `loadImageFromUrl` rejects with `ImageLoadError(reason: 'network')` for an unreachable/404 URL in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 1

- [ ] T014 [US1] Implement `loadImageFromUrl(url: string): Promise<GrayscaleImage>` in `src/core/image-loader/load-image.ts` (fetch bytes → shared decode helper → `toGrayscale`) (depends on T008, T011)
- [ ] T015 [US1] Export `loadImageFromUrl` and the public types from `src/core/image-loader/index.ts` (depends on T014)

**Checkpoint**: User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 - Load an image from an in-memory Blob into a grayscale buffer (Priority: P2)

**Goal**: A developer passes an in-memory Blob/File and extracts it into the same flat single-channel grayscale buffer format as the URL path.

**Independent Test**: Construct a Blob from known image bytes, pass it to the loader, and assert the output buffer matches the same reference conversion used for the URL path.

### Tests for User Story 2

- [ ] T016 [P] [US2] Unit test `loadImageFromBlob` successfully decodes PNG, JPEG, and WebP fixtures passed as `Blob`, asserting output matches the URL path for the same source image in `tests/unit/image-loader/load-image.test.ts` (FR-002, SC-002)
- [ ] T017 [P] [US2] Unit test `loadImageFromBlob` rejects with `ImageLoadError(reason: 'empty-input')` for a zero-byte Blob in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 2

- [ ] T018 [US2] Implement `loadImageFromBlob(blob: Blob): Promise<GrayscaleImage>` in `src/core/image-loader/load-image.ts` (shared decode helper → `toGrayscale`) (depends on T008, T011)
- [ ] T019 [US2] Implement the unified `loadImage(source: ImageSource): Promise<GrayscaleImage>` dispatcher in `src/core/image-loader/load-image.ts` (depends on T014, T018)
- [ ] T020 [US2] Export `loadImageFromBlob` and `loadImage` from `src/core/image-loader/index.ts` (depends on T015, T019)

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Reject invalid or unsupported image input (Priority: P3)

**Goal**: Invalid or unsupported URL/Blob input fails predictably with a clear, descriptive error instead of crashing, hanging, or silently returning incorrect data.

**Independent Test**: Feed known-bad inputs (corrupted bytes, unsupported format, non-image content) to the loader and assert a descriptive error is produced for each case.

### Tests for User Story 3

- [ ] T021 [P] [US3] Unit test `loadImageFromBlob` and `loadImageFromUrl` reject corrupted image bytes with `ImageLoadError(reason: 'decode-failed')` in `tests/unit/image-loader/load-image.test.ts` (FR-008)
- [ ] T022 [P] [US3] Unit test `loadImageFromBlob` and `loadImageFromUrl` reject non-image content (e.g., a text file) with `ImageLoadError(reason: 'unsupported-format')` in `tests/unit/image-loader/load-image.test.ts` (FR-008)

### Implementation for User Story 3

- [ ] T023 [US3] Add decode-failure classification in the shared decode helper (`src/core/image-loader/load-image.ts`) so `createImageBitmap` rejections surface as typed `ImageLoadError` reasons (`'unsupported-format'` or `'decode-failed'`) (depends on T011)
- [ ] T024 [US3] Add CORS-blocked detection and `ImageLoadError(reason: 'cors-blocked')` handling in `src/core/image-loader/load-image.ts` for tainted-canvas pixel-read failures (depends on T011)

**Checkpoint**: All three user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T025 [P] Unit test that concurrent, independent `loadImage*` calls do not interfere with one another in `tests/unit/image-loader/load-image.test.ts` (FR-010)
- [ ] T026 [P] Unit test that an animated WebP source decodes only its first/default frame in `tests/unit/image-loader/load-image.test.ts` (FR-009)
- [ ] T027 [P] Benchmark test for the `toGrayscale` conversion pass asserting its execution time budget and zero additional allocations in `tests/unit/image-loader/to-grayscale.bench.ts` per constitution Principle IV
- [ ] T028 Run the [quickstart.md](./quickstart.md) validation scenarios end-to-end and confirm all four scenarios pass
- [ ] T029 Final review: confirm strict TypeScript (no `any`/`@ts-ignore`), a semicolon-free style, and Conventional Commits were applied throughout per constitution Principle V

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
