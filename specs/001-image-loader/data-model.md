# Data Model: Image Loader

Derived from the Key Entities in [spec.md](./spec.md) and the decisions in [research.md](./research.md). These are plain data shapes (no classes/methods), consistent with the constitution's Data-Oriented Memory principle.

## ImageSource

The input to a load operation.

| Field | Type | Notes |
|---|---|---|
| `kind` | `'url' \| 'blob'` | Discriminates which loader path to use |
| `value` | `string` (when `kind === 'url'`) or `Blob`/`File` (when `kind === 'blob'`) | The URL string or the in-memory Blob/File |

**Validation rules**:
- `kind: 'url'` → `value` MUST be a non-empty string; relative, absolute, and `data:` URLs are accepted; resolution/fetch failures surface as a `LoadFailure`.
- `kind: 'blob'` → `value` MUST be a `Blob`/`File` with `size > 0`; a zero-byte blob surfaces as a `LoadFailure` with reason `empty-input`.
- Format (PNG/JPEG/WebP) is not declared up front — it is determined by successful decode (see research.md: format detection via decode success).

## GrayscaleImage

The output of a successful load (FR-005, FR-006).

| Field | Type | Notes |
|---|---|---|
| `width` | `number` | Source image width in pixels, integer > 0 |
| `height` | `number` | Source image height in pixels, integer > 0 |
| `data` | `Uint8ClampedArray` | Flat, row-major, single-channel grayscale buffer; `data.length === width * height`; one byte per pixel, origin top-left |

**Validation rules**:
- `data.length` MUST always exactly equal `width * height` (SC-002).
- `data` values are in the range `0–255` (8-bit precision per Assumptions).
- No alpha channel is present in the output (FR-007 — flattened to opaque before conversion).

## LoadFailure (ImageLoadError)

The result of an unsuccessful load (FR-008).

| Field | Type | Notes |
|---|---|---|
| `reason` | `'network' \| 'empty-input' \| 'decode-failed'` | Machine-readable failure category; a CORS-blocked fetch is reported as `network` |
| `message` | `string` | Human-readable, descriptive explanation suitable for developer-facing logs/errors |
| `cause` | `unknown` (optional) | Underlying error/exception, if any, for debugging |

**Validation rules**:
- Every unsuccessful load MUST produce exactly one `LoadFailure` (never a partial/empty `GrayscaleImage` and never a silent no-op) — FR-008, SC-003.
- `reason` MUST be one of the enumerated categories so callers can branch on failure type without string-matching `message`.

## Relationships

```text
ImageSource  --(load + decode + grayscale-convert)-->  GrayscaleImage
                                                   \--> LoadFailure  (on any failure)
```

Each load operation is independent and stateless — no shared mutable state links one `ImageSource` → `GrayscaleImage`/`LoadFailure` resolution to another (FR-010).
