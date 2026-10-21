# Quickstart: Validating the Image Loader

This guide proves the Image Loader module works end-to-end once implemented. See [contracts/image-loader-api.md](./contracts/image-loader-api.md) for the API surface and [data-model.md](./data-model.md) for the data shapes referenced below.

## Prerequisites

- Node.js managed via `fnm` (per constitution) with the project's `.node-version`/`.nvmrc` applied.
- Project dependencies installed (`npm install` / `pnpm install`, per whichever manifest `/speckit-tasks` scaffolds).
- Test fixtures present at `tests/unit/image-loader/fixtures/` (small real `.png`, `.jpg`, `.webp` files).

## Setup

```bash
# from repo root
npm install
```

## Run the validation scenarios

```bash
# Runs the Vitest suite in Browser Mode (see research.md) for real-decode fidelity
npx vitest run tests/unit/image-loader
```

### Scenario 1 — Load from URL (User Story 1)

- Serve `tests/unit/image-loader/fixtures/sample.png` (and `.jpg`, `.webp`) from the local Vitest browser test server.
- Call `loadImageFromUrl(url)` for each fixture.
- **Expected**: resolves with `{ width, height, data }` where `data.length === width * height`, and spot-checked pixel values are within 1% of an independently computed reference grayscale conversion (SC-004).

### Scenario 2 — Load from Blob (User Story 2)

- Read each fixture file's bytes into a `Blob` within the test.
- Call `loadImageFromBlob(blob)`.
- **Expected**: same shape/tolerance guarantees as Scenario 1, with output matching the URL path for the same source image.

### Scenario 3 — Reject invalid input (User Story 3)

- Call `loadImageFromBlob(new Blob([]))` (empty blob) → expect a rejected `ImageLoadError` with `reason: 'empty-input'`.
- Call `loadImageFromBlob(new Blob(['not an image']))` → expect a rejected `ImageLoadError` with `reason: 'decode-failed'` or `'unsupported-format'`.
- Call `loadImageFromUrl('https://example.invalid/missing.png')` → expect a rejected `ImageLoadError` with `reason: 'network'`.

### Scenario 4 — Performance spot-check (SC-001)

- Time a `loadImageFromUrl`/`loadImageFromBlob` call against a 1920×1080 fixture.
- **Expected**: completes in under 1 second on a typical development machine/connection.

## Success criteria mapping

| Scenario | Spec reference |
|---|---|
| 1 | User Story 1, FR-001, FR-003–FR-006, SC-001, SC-002 |
| 2 | User Story 2, FR-002, SC-002 |
| 3 | User Story 3, FR-008, SC-003 |
| 4 | SC-001 |

If all four scenarios pass, the feature is validated end-to-end and ready for `/speckit-tasks` → `/speckit-implement` to produce the full test suite and implementation.
