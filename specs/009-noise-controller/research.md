# Research: Noise Controller

## R1: Where the step reads and writes

- **Decision**: `processFrame(state, image)` reads `image.data` (the compositor output) and writes into the controller's own pre-allocated `output` `GrayscaleImage`, which it returns.
- **Rationale**: The compositor's output buffer is rewritten on every `compose`, but nothing stops a caller from processing it twice; an in-place step would then apply window/level twice and re-noise already noisy pixels. A separate output keeps the operation idempotent with respect to the input, leaves the compositor output pristine for other consumers, and still needs no allocation per frame. A pointwise mapping also works if a caller deliberately passes the output back in.
- **Alternatives**: In-place on the compositor buffer (compounds on reprocessing, surprising side effect); caller-supplied `out` array (extra parameter and length checks with no benefit since the state already owns the other buffers).

## R2: Window/level as a lookup table

- **Decision**: A 256-entry `Uint8ClampedArray`; `table[v] = (v - lo) / window * 255` with `lo = level - window / 2`, stored through the clamped array so rounding (to nearest, ties to even) and clamping to `0` to `255` are native. Rebuilt in place by `setWindowLevel` (256 iterations, no allocation).
- **Rationale**: One table lookup per pixel regardless of settings; the identity (window `255`, level `127.5`) maps every byte to itself exactly. Hand check, window `100` and level `100` (`lo = 50`): `75 -> 63.75 -> 64`, `100 -> 127.5 -> 128` (tie to even), `125 -> 191.25 -> 191`, `150 -> 255`, `200 -> 255`, `0` and `50` -> `0`.
- **Alternatives**: Computing the linear map per pixel (more arithmetic in the loop, no benefit); a 16-bit table (the pipeline is 8-bit).

## R3: Dose model

- **Decision**: `dose` is the number of photons a full-scale pixel (255) represents. A pixel of value `v` represents `n = dose * v / 255` photons; Poisson noise has standard deviation `sqrt(n)` photons, which is `sqrt(255 * v / dose)` in byte units. The per-byte sigma is tabulated in a `Float32Array(256)` when dose changes. `Infinity` gives sigma `0` and turns the noise path off.
- **Rationale**: One physically meaningful parameter; noise grows with the square root of the signal and falls with the square root of dose, which is the defining behavior of quantum mottle. Tabulating removes the `sqrt` from the hot loop. Hand check: `v = 128`, `dose = 1000` gives `sigma = sqrt(32.64) = 5.71`, with output rounding adding variance `1/12` for an observed standard deviation of about `5.72`; quadrupling dose halves sigma; `v = 192` against `v = 48` gives a ratio of `sqrt(192 / 48) = 2.0` (values near `0` or `255` are avoided in statistical tests because clipping distorts the measured spread).
- **Alternatives**: A free "noise strength" parameter (not tied to dose, so not dose-dependent); an exposure unit in mAs (needs detector calibration); a noise map scaled by a global factor (ignores the signal dependence).

## R4: Generator

- **Decision**: `mulberry32` over a 32-bit state held in a `Uint32Array(1)`: `a = (a + 0x6D2B79F5) | 0; t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; result = (t ^ (t >>> 14)) >>> 0`. The state lives in a local variable during the loop and is written back once at the end.
- **Rationale**: Pure 32-bit integer operations with no allocation, good statistical quality for visual noise, and every seed from `0` to `4294967295` is valid (no zero-state trap). One draw yields 32 random bits, enough for a four-byte sample.
- **Alternatives**: xorshift32 (a state of zero is forbidden and low bits are weaker, but it is a few operations cheaper); `Math.random` (not reproducible, not seedable, slower); a pre-allocated noise map (see R6).

## R5: Turning one draw into a Gaussian-like sample

- **Decision**: Sum the four bytes of the 32-bit draw (each uniform over `0` to `255`) and normalize: `z = (sum - 510) / 147.80`, where `147.80 = sqrt(4 * (256^2 - 1) / 12)`. This is the Irwin-Hall distribution with `n = 4`: mean `0`, variance `1`, bounded at about `3.45` sigma.
- **Rationale**: Integer shifts, masks, and one multiply per pixel, with no logarithm, square root, or cosine in the loop (unlike Box-Muller), and a close enough bell shape for mottle at 8-bit precision.
- **Alternatives**: Box-Muller (two draws plus `log`, `sqrt`, `cos`; several times slower); a ziggurat sampler (tables and rejection logic); a single uniform draw (flat-topped noise that looks wrong).

## R6: PRNG versus a pre-allocated noise map

- **Decision**: Use the PRNG directly in the pixel loop; keep no noise map.
- **Rationale**: A map smaller than the image tiles visibly and one the size of the image costs `width * height` extra bytes and a read per pixel; the generator costs a handful of integer operations per pixel and no memory. The generator is seedable, so tests are deterministic.
- **Alternatives**: A pre-computed map read from a random start offset (cheap per pixel, but periodic and correlated between frames); an image-sized map regenerated rarely (frozen pattern, not quantum noise).

## R7: Order of noise and window/level

- **Decision**: Noise first, then the window/level table: `noisy = clamp(round(v + sigma[v] * z))` (computed as `(f + 0.5) | 0` after clamping), then `out = windowTable[noisy]`.
- **Rationale**: Quantum noise arises in the detector signal; window/level is a display transform applied to that signal, as on a real workstation. This also makes the noise visibly amplified by narrow windows.
- **Alternatives**: Window/level first, then noise (noise would be independent of the display setting and of the underlying signal); folding noise into the table (impossible, it is random per pixel).

## R8: Hot loop shape and no-noise fast path

- **Decision**: Choose the loop outside: when dose is finite, run the noisy loop; otherwise run a loop with only the table lookup and leave the generator state untouched. Both are plain indexed `for` loops over `pixelCount` with locals for the tables and the generator state.
- **Rationale**: Avoids a per-pixel branch and an unnecessary draw; makes the "no noise leaves the generator untouched" rule testable and keeps the common baseline step as cheap as possible.
- **Alternatives**: A single loop with a per-pixel `if` (slower, advances the generator needlessly).

## R9: Validation and errors

- **Decision**: `NoiseError` reasons: `'invalid-dimensions'` (width or height not a positive integer), `'invalid-window-level'` (window not finite and `> 0`, or level not finite), `'invalid-dose'` (not a number `> 0` or `Infinity`), `'invalid-seed'` (not an integer in `[0, 4294967295]`), `'invalid-image'` (width, height, or data length does not match). Thrown synchronously before mutation.
- **Rationale**: Same fail-fast style as the other modules (Principle VII); the error class carries no pixel state, so Principle I's no-classes rule does not apply.
- **Alternatives**: Clamping out-of-range values silently (hides mistakes).

## R10: Testing and budgets

- **Decision**: Window/level tests assert exact hand-computed bytes. Noise tests use a fixed seed and large constant images and assert the empirical mean and standard deviation against the formula within 5% (`v = 128` at dose `1000`, dose scaling by 4, brightness ratio between `48` and `192`), reproducibility, reseeding, frame-to-frame difference, the untouched generator when noise is off, and the unchanged input buffer. An integration test runs `compose`, `processFrame`, and the renderer's `updateBuffer`. A benchmark on 512x512 measures a batch to calibrate a per-frame budget (initial 5 ms) and asserts heap growth under 100 KB against an allocating control with a warm-up.
- **Rationale**: Principle IV; fixed seeds make statistical checks deterministic, so they cannot flake.
- **Alternatives**: Unseeded statistical tests (flaky by construction); allocation counting via instrumentation (not available in browser tests).
