# Research: Grayscale Blending

No `NEEDS CLARIFICATION` items remained after the spec and planning directives. The decisions below record the technical choices.

## 1. Compute location

- **Decision**: Synchronous CPU-side TypeScript over flat typed arrays; no WebGPU, WebGL, or Canvas.
- **Rationale**: Planning directive. Keeps the module a pure, testable, worker-transferable data pipeline with no device or context dependencies (SC-006).
- **Alternatives considered**: GPU compute/blend pipeline (rejected: directive, plus adds async, device, and readback complexity); WebAssembly SIMD (rejected: speculative, extra toolchain, not needed for the 90% case).

## 2. Clamping strategy

- **Decision**: Write directly to a `Uint8ClampedArray` output and let the native store saturate to 0-255.
- **Rationale**: `Uint8ClampedArray` stores clamp out-of-range numbers (including negatives) and round non-integers to nearest (ties to even), so no `Math.min/max` or manual rounding branches are needed in the loop. Intermediate results are plain doubles and are stored once.
- **Equivalence**: Add is monotonically increasing and subtract monotonically decreasing, so a single final saturation equals stepwise saturation. Alpha blend `base + (overlay - base) * mask / 255` is exact at mask 0 (returns base) and 255 (the product divides exactly, returns overlay).
- **Rounding note**: The native rule is round-half-to-even. Tests should use hand-computed expectations that either avoid exact `.5` cases or expect half-to-even; the spec's "rounded to the nearest whole intensity" is satisfied.
- **Alternatives considered**: Manual `Math.min(255, Math.max(0, x))` (rejected: directive; branchy hot loop); bit tricks for saturation (rejected: obscure, slower to maintain).

## 3. Loop shape and aliasing

- **Decision**: One pixel-major loop per operation. For each index `i`, read all inputs at `i`, compute, write `out[i]`.
- **Rationale**: Layer-major accumulation (`out = out + layer`) corrupts results when `out` aliases a later layer. Pixel-major reads every input at `i` before the only write to `i`, so same-reference aliasing is safe (FR-009) with no scratch buffer.
- **Limitation**: Partially overlapping, offset views of the same memory are unsupported (documented in the contract).
- **Performance note**: The inner layer loop for add/subtract indexes `layers[k].data[i]`. If the 4096x4096 two-layer benchmark misses 50 ms, add a two-layer fast path inside `accumulate` (same file) rather than new files; do not preemptively add it.
- **Alternatives considered**: Scratch/temporary buffer (rejected: allocation); copy-on-alias detection (rejected: branchy, unnecessary).

## 4. Allocation-free clamped output

- **Decision**: Require caller-supplied blend outputs to be `Uint8ClampedArray`; allocate that type only when the caller omits `out`. Store directly into the output array.
- **Rationale**: Native clamping is provided by the output array itself, eliminating per-call heap allocation and preserving pixel-major alias safety when output aliases a clamped input. `GrayscaleImage.data` is `Uint8ClampedArray` only, so the loader, renderer, and blending module share one grayscale buffer type.
- **Alternatives considered**: Create a clamped view around `Uint8Array` output (rejected: per-call heap allocation violates Constitution I); manual clamp arithmetic (rejected: fails native-clamping directive).

## 5. Public API shape

- **Decision**: `addLayers(layers, out?)`, `subtractLayers(layers, out?)`, `alphaMask(base, overlay, mask, out?)`. Layers are passed as an array (not rest args) to avoid a per-call array allocation. Functions return the flat `Uint8ClampedArray` result (the supplied `out` reference if given).
- **Rationale**: Mirrors `toGrayscale(..., out?)` in the image loader (returns the flat buffer). Three named functions match the three operations without a mode enum or strategy objects.
- **Alternatives considered**: Single `blend(mode, ...)` dispatcher (rejected: needs a mode union and a switch for no benefit; directive forbids per-mode strategies); returning a new `GrayscaleImage` record (rejected: spec says return the flat buffer, dimensions are already known to the caller).

## 6. Validation and errors

- **Decision**: Validate synchronously at the top of each exported function before any write: at least one layer; every layer has positive integer `width`/`height` equal to the first layer's; `data.length === width * height`; mask likewise; `out`, if supplied, has length `width * height`. Throw a single `BlendError` (message names the failure) on the first problem.
- **Rationale**: Constitution VII (fail fast, no classification, no retries) and the directive; satisfies FR-010/FR-011 because nothing is written before validation passes.
- **Alternatives considered**: Reason-coded error union like `ImageLoadError` (rejected: directive says one generic error); returning result objects (rejected: fail fast by throwing).

## 7. File footprint

- **Decision**: 3 source files (`index.ts`, `types.ts`, `blend.ts`) and 2 test files (`blend.test.ts`, `blend.bench.ts`).
- **Rationale**: Anti-bloat directive (3 to 5 files, all operations in one file).

## 8. Testing and benchmarking

- **Decision**: Vitest Browser Mode (existing config). Tests use small hand-written fixtures with hand-computed expected values: overflow, underflow, N-layer add, ordered subtract, mask 0 / 255 / partial, single-layer identity, aliasing (`out` is each input position), input immutability, each validation failure with `out` unchanged. The benchmark follows the existing `to-grayscale.bench.ts` pattern: a 4096x4096 two-layer add under 50 ms (and the same for alpha mask), plus a heap-growth check that growth stays far below the pixel buffer size across repeated calls with a supplied `out` (a control allocation proves the probe works).
- **Alternatives considered**: Property-based tests (rejected: extra dependency, not needed for MVP).
