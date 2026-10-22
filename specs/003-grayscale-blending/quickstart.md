# Quickstart: Grayscale Blending

Validation guide for the module described in [spec.md](./spec.md) and [contracts/grayscale-blending-api.md](./contracts/grayscale-blending-api.md).

## Prerequisites

- Dependencies installed (`npm install`) and Playwright Chromium available, as for the other modules.
- Fish shell terminal; Node must be initialised first:

```fish
fnm env --shell fish | source; and fnm use 24; and npm test
```

## Scenarios

1. **Add / subtract (User Story 1)**: blend small hand-written layers; expect saturation at 255 on overflow, 0 on underflow, ordered N-layer subtraction, and a single layer returned as an exact copy.
2. **Alpha mask (User Story 2)**: composite with masks of 0, 255, and intermediate values; expect base, overlay, and proportional blends respectively.
3. **Output reuse (User Story 3)**: pass `out`; expect the same reference back, correct values, and correct results when `out` is each input in turn.
4. **Validation**: empty list, mismatched dimensions, wrong `data.length`, zero/negative/non-integer dimensions, wrong-size `out`; expect `BlendError`, with `out` and inputs unchanged.
5. **Benchmark (SC-004, SC-005)**: two 4096x4096 layers blend in under 50 ms; repeated calls with a supplied `out` show heap growth far below the pixel buffer size.

## Commands

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/grayscale-blending
fnm env --shell fish | source; and fnm use 24; and npx tsc --noEmit
fnm env --shell fish | source; and fnm use 24; and npx eslint src tests
```

## Expected outcome

All tests and benchmarks pass, with no type or lint errors.
