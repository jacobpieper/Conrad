# Implementation Plan: Image Loader

**Branch**: `001-image-loader` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-image-loader/spec.md`

## Summary

Build a client-side Image Loader module that accepts a URL or Blob referencing a PNG, JPEG, or WebP image, decodes it using native browser image/canvas APIs, and flattens the decoded pixels into a single-channel grayscale `Uint8ClampedArray` buffer (plus width/height) using a standard luminance formula. The module is a pure-function, buffer-in/buffer-out core engine piece with no UI or framework dependency, so it can feed downstream pixel-processing pipelines (convolution, raycasting input, etc.).

## Technical Context

**Language/Version**: TypeScript, strict mode, targeting evergreen browsers (ES2022+)

**Primary Dependencies**: None beyond native browser APIs — `fetch`, `Blob`/`File`, `createImageBitmap`, `OffscreenCanvas`/`CanvasRenderingContext2D` for decode and pixel readback. No third-party image-decoding library is needed since target browsers natively decode PNG/JPEG/WebP.

**Storage**: N/A (no persistence; buffers are returned to the caller)

**Testing**: `vitest` exclusively, run in Vitest Browser Mode (Playwright-backed provider) so Canvas/`createImageBitmap` decoding behaves exactly as in production; no DOM-mocking or non-vitest test runner is introduced.

**Target Platform**: Browser (client-side), framework-agnostic core module consumable by the SvelteKit UI layer

**Project Type**: Single project — core engine library module

**Performance Goals**: Decode + grayscale-convert a 1920×1080 image in under 1 second end-to-end (per SC-001); single-pass grayscale conversion over the decoded pixel buffer with no redundant intermediate copies

**Constraints**: Output buffer MUST be a flat, pre-sized `Uint8ClampedArray` (no per-pixel allocations during the conversion pass); no OOP state — the module exposes pure functions over plain data; MUST NOT import Svelte or any UI-layer dependency; cross-origin loads are bound by the browser's existing CORS model (not bypassed)

**Scale/Scope**: One module: URL + Blob input paths, 3 supported formats (PNG/JPEG/WebP), first-frame-only for animated sources

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Output is a flat pre-sized `Uint8ClampedArray`; conversion is a pure procedural function over packed buffers; no entity classes introduced. One-time decode is not a per-frame hot loop, but the grayscale conversion pass itself still avoids per-pixel allocation. |
| II. Architecture & Pipeline Modularity | PASS | Single-purpose module with a strict buffer-contract output (`{ width, height, data }`); runs entirely client-side (browser `fetch` + Canvas decode, no backend compute); defaults to single-channel grayscale output per the constitution's default. |
| III. UI & Interactivity Standards | PASS | Module lives in the core engine layer; exposes plain functions/data only; no Svelte reactivity, stores, or DOM framework bindings are imported. |
| IV. Testing & Benchmarking | PASS | Tests written exclusively in `vitest`; no mocks for the core decode/convert path — tests exercise real image bytes and assert on real `Uint8ClampedArray` output. A benchmark test for the grayscale conversion pass asserts its time budget and zero additional allocations. |
| V. Code, Git & Governance | PASS | Implementation will use strict TypeScript, no semicolons, and Conventional Commits, applied during `/speckit-implement`. |
| VI. Halt and Catch Fire | N/A | No architectural roadblock identified; flag during implementation if one emerges. |

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-image-loader/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── image-loader/
│       ├── index.ts            # Public exports (loadImage, types)
│       ├── load-image.ts       # URL/Blob -> decoded ImageBitmap/ImageData orchestration
│       ├── to-grayscale.ts     # Pure RGBA buffer -> single-channel Uint8ClampedArray conversion
│       ├── errors.ts           # ImageLoadError and failure reasons
│       └── types.ts            # ImageSource, GrayscaleImage
└── (future core modules alongside image-loader, e.g. convolution/, raycasting/)

tests/
├── setup/
│   └── cross-origin-server.ts  # Real local server for cross-origin load tests
└── unit/
    └── image-loader/
        ├── load-image.test.ts
        ├── to-grayscale.test.ts
        ├── to-grayscale.bench.ts
        └── fixtures.ts          # Hardcoded base64 PNG data URIs
```

**Structure Decision**: This is the first feature in the repository, so it establishes the initial `src/core/` layout for engine modules. The Image Loader lives at `src/core/image-loader/` as a self-contained, dependency-free module (buffer-in/buffer-out), matching Option 1 (single project). Tests live under `tests/unit/image-loader/` using real fixture image files, consistent with the no-mocks testing principle. The SvelteKit UI layer (not yet scaffolded) will later import from `src/core/image-loader` without this module ever importing back from a UI directory.

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
