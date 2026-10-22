# Quickstart: Validating the Headless Renderer

This guide proves the renderer works end-to-end once implemented. See [contracts/headless-renderer-api.md](./contracts/headless-renderer-api.md) for the API and [data-model.md](./data-model.md) for state and fit rules.

## Prerequisites

- Node.js via `fnm` (per constitution).
- Dependencies installed, including the dev-only `@webgpu/types`.
- Playwright Chromium installed (`npx playwright install chromium`).
- `vitest.config.ts` Chromium launch args extended so headless Chromium exposes a WebGPU adapter (flag set confirmed by the first implementation task; see research R10).

## Setup

```bash
npm install
npx playwright install chromium
```

## Run the validation scenarios

```bash
npx vitest run tests/unit/headless-renderer
npm run typecheck
npm run lint
```

### Scenario 1 - Headless render (User Story 1)

- `createRenderer(64, 64)`; `readSurface` -> every pixel is the background, alpha 255.
- `updateBuffer` with a known 4x4 gradient image at a 4x4 viewport -> surface R=G=B equals the image intensities exactly (FR-005).
- `updateBuffer` with a non-matching aspect ratio -> compare `readSurface` to `tests/unit/headless-renderer/reference.ts` within +/-1 per channel; letterboxed area equals the background.
- `updateBuffer` with `data.length !== width*height` -> throws `RendererError('invalid-image')` and the surface is unchanged.

### Scenario 2 - Resize (User Story 2)

- Render, then `resize` larger, smaller, and back; each time `readSurface` with the new-size buffer matches the reference.
- `resize` to the same size leaves the surface unchanged.
- `resize(0, 10)`, `resize(10.5, 10)`, `resize(-1, 10)` throw `RendererError('invalid-viewport')`, state unchanged.

### Scenario 3 - Presentation target (User Story 3)

- Without a target, all of the above works (no canvas in the test).
- `bindTarget(state, new OffscreenCanvas(1, 1))` -> canvas gets the viewport size; capture via `transferToImageBitmap()` into a 2D canvas and compare to `readSurface`.
- `updateBuffer` and `resize` while bound -> target matches the surface each time.
- `unbindTarget`, then `updateBuffer` -> the surface changes; the former target is not updated.

### Scenario 4 - Isolation (FR-014)

- Create two renderers with different images; each `readSurface` shows only its own image.

### Scenario 5 - Benchmark (SC-005, SC-006)

- `tests/unit/headless-renderer/update-buffer.bench.ts`: 1920x1080 viewport and image; `updateBuffer` + wait for GPU completion under 50 ms.
- Repeated `updateBuffer` at constant size does not grow JS heap beyond a small noise threshold.

## Success criteria mapping

| Scenario | Spec reference |
|---|---|
| 1 | User Story 1, FR-001 to FR-005, FR-011, FR-012, SC-001, SC-004 |
| 2 | User Story 2, FR-006, FR-012, FR-013, SC-001, SC-004 |
| 3 | User Story 3, FR-007 to FR-010, SC-002, SC-003 |
| 4 | FR-014 |
| 5 | FR-016, SC-005, SC-006 |

If all five scenarios pass, the feature is validated and ready for `/speckit-tasks` and `/speckit-implement`.
