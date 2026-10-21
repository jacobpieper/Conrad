# Phase 0 Research: Image Loader

All Technical Context items were resolvable from the constitution and standard web platform practice — no `NEEDS CLARIFICATION` markers remain. This document records the key decisions and their rationale.

## Decision: Decode via `createImageBitmap` + `OffscreenCanvas` (fallback `HTMLImageElement` + `<canvas>`)

- **Decision**: Use `fetch` (for URL sources) or direct `Blob` (for Blob sources) to obtain bytes, pass the `Blob` to `createImageBitmap()` to decode, then draw the bitmap onto an `OffscreenCanvas` (or `<canvas>` if `OffscreenCanvas` is unavailable) to read back RGBA pixel data via `getImageData()`.
- **Rationale**: `createImageBitmap` natively supports PNG, JPEG, and WebP in all evergreen browsers, decodes off the main thread in many implementations, and accepts both `Blob` and (via `fetch().blob()`) URL-sourced data through one code path. Drawing to a canvas is the standard, dependency-free way to get raw pixel bytes in the browser.
- **Alternatives considered**:
  - `HTMLImageElement.src` + `<canvas>`: works everywhere but requires DOM attachment/`decode()` handling and is the fallback for environments without `createImageBitmap`/`OffscreenCanvas`.
  - Third-party WASM decoders (e.g., `libwebp`/`png.js` ports): rejected — adds dependency weight and binary size for formats the browser already decodes natively; reserved only if a future format needs support the browser lacks.

## Decision: Single-pass RGBA → grayscale conversion using ITU-R BT.601 luma weights

- **Decision**: `gray = round(0.299*R + 0.587*G + 0.114*B)`, alpha discarded, written directly into a pre-sized `Uint8Array` of length `width * height` in one forward loop over the source `Uint8ClampedArray` from `ImageData`.
- **Rationale**: BT.601 weights are the long-standing default for general-purpose RGB→luma conversion and match common web/image-tool defaults (matches SC-004's "independently computed reference" expectation). A single forward loop with a pre-allocated destination buffer satisfies the zero-allocation-in-hot-loop principle.
- **Alternatives considered**: BT.709 (HDTV) weights — close numerically, acceptable alternative but BT.601 is the more conventional default for generic image/graphics work and was chosen for the reference implementation; simple averaging `(R+G+B)/3` — rejected as it doesn't match perceptual luminance and would fail SC-004 against any standard reference.

## Decision: Format/validity detection via decode success, not file extension or manual byte sniffing

- **Decision**: Wrap `createImageBitmap` in a single try/catch; if it rejects for any reason, surface one generic `ImageLoadError(reason: 'decode-failed', message: 'Image decoding failed')`. Do not pre-validate or classify by inspecting magic bytes, file extensions, or MIME type strings, and do not attempt to distinguish "unsupported format" from "corrupted data" — the browser decoder is authoritative and a single generic reason is sufficient.
- **Rationale**: Avoids duplicating format-sniffing/classification logic the browser already performs correctly and keeps the module minimal; aligns with FR-008's requirement for a descriptive failure without over-engineering validation or error taxonomy.
- **Alternatives considered**: Manual magic-byte sniffing (PNG `\x89PNG`, JPEG `\xFF\xD8`, WebP `RIFF....WEBP`) prior to decode, or classifying failures into separate `unsupported-format`/`decode-failed` reasons — rejected as redundant extra code paths that must be kept in sync with decoder behavior for no added correctness.

## Decision: Testing strategy — Vitest Browser Mode with real fixture images

- **Decision**: Use Vitest's Browser Mode (Playwright-backed provider, configured as a `vitest` project/workspace) so `createImageBitmap`/`OffscreenCanvas`/`getImageData` run with real browser semantics. Test fixtures are small real PNG/JPEG/WebP files committed under `tests/unit/image-loader/fixtures/`, served as `Blob`s directly or via a local dev-server URL.
- **Rationale**: The constitution forbids mocks for core buffer tests and forbids non-`vitest` test frameworks. Vitest Browser Mode satisfies both: it is still `vitest` (same test API, same runner), while executing against a real browser engine so pixel decode output is faithful — a plain Node/jsdom environment cannot decode real image bytes via Canvas.
- **Alternatives considered**: `jsdom`/`happy-dom` with a mocked canvas — rejected, violates the no-mocks-for-core-math-tests rule and wouldn't exercise real decode behavior; Node-only image libraries (e.g., `sharp`, `node-canvas`) purely for the test environment — rejected as an additional non-browser dependency whose decode output isn't guaranteed to match the production browser decoder exactly.

## Decision: First-frame-only handling for animated sources

- **Decision**: Rely on `createImageBitmap`'s default behavior of decoding the first/default frame of an animated image; no explicit animation-frame iteration is implemented.
- **Rationale**: Matches FR-009/Assumptions (first-frame-only is in scope; full animation decoding is explicitly out of scope) and requires no extra code.
- **Alternatives considered**: Full multi-frame decode (e.g., via `ImageDecoder` API) — rejected as out of scope per the spec's assumptions.

**Output**: All `NEEDS CLARIFICATION` items resolved (none remained). Ready for Phase 1 design.
