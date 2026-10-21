# API Contract: Image Loader Module

Public TypeScript surface exported from `src/core/image-loader/index.ts`. This is the contract downstream pipeline stages and the SvelteKit UI layer code against.

## Types

```ts
type GrayscaleImage = {
  width: number
  height: number
  data: Uint8Array // row-major, single-channel, length === width * height
}

type ImageLoadErrorReason =
  | 'network'
  | 'empty-input'
  | 'decode-failed'
  | 'cors-blocked'

class ImageLoadError extends Error {
  readonly reason: ImageLoadErrorReason
  readonly cause?: unknown
}
```

> Note: `ImageLoadError` extends the built-in `Error` solely to integrate with standard `throw`/`catch` and stack traces; it carries no behavior/mutable engine state and is not a core pixel-processing entity, so it does not fall under the Data-Oriented Memory "no OOP entity classes" restriction (which targets image/spatial data, not error signaling).

## Functions

### `loadImageFromUrl(url: string): Promise<GrayscaleImage>`

- **Input**: a URL string (absolute, relative, or `data:`).
- **Output**: resolves with a `GrayscaleImage` on success.
- **Errors**: rejects with `ImageLoadError` on network failure, empty response, unsupported/corrupt format, decode failure, or CORS-blocked pixel access.
- **Covers**: FR-001, FR-003–FR-009, User Story 1.

### `loadImageFromBlob(blob: Blob): Promise<GrayscaleImage>`

- **Input**: a `Blob` or `File`.
- **Output**: resolves with a `GrayscaleImage` on success.
- **Errors**: rejects with `ImageLoadError` on empty/zero-byte blob, unsupported/corrupt format, or decode failure.
- **Covers**: FR-002–FR-009, User Story 2.

### `loadImage(source: ImageSource): Promise<GrayscaleImage>`

- **Input**: a discriminated `ImageSource` (`{ kind: 'url', value: string }` or `{ kind: 'blob', value: Blob }`).
- **Output/Errors**: same as the two functions above; dispatches internally to `loadImageFromUrl`/`loadImageFromBlob`.
- **Covers**: unified entry point used by both user stories; convenience for callers that hold a generic source reference.

## Behavioral Guarantees (apply to all three functions)

- Never returns a partial or empty `GrayscaleImage` on failure — always either a fully valid `GrayscaleImage` or an `ImageLoadError` rejection (FR-008, SC-003).
- `data.length` always exactly equals `width * height` on success (SC-002).
- Alpha is always flattened to opaque; animated sources always yield only the first/default frame (FR-007, FR-009).
- Concurrent calls are fully independent — no shared mutable module state (FR-010).
- Pure/stateless: no classes to instantiate, no setup/teardown lifecycle; each call is a standalone operation.
