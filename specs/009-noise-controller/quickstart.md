# Quickstart: Validating Noise Controller

See [contracts/noise-controller-api.md](./contracts/noise-controller-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/noise-controller
fnm env --shell fish | source; and fnm use 24; and npx vitest run
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Identity (US1)**: with defaults, a frame containing every byte value `0` to `255` is returned unchanged.
2. **Window/level values (US1)**: window `100`, level `100` maps `[0, 50, 75, 100, 125, 150, 200]` to `[0, 0, 64, 128, 191, 255, 255]`; `setWindowLevel` changes the mapping on the next frame without any new allocation.
3. **Input untouched (US1)**: after `processFrame` the input image still holds its original bytes, and the returned image is a different object that is the same object on every call.
4. **Validation (US1, US2)**: window `0`, `-1`, `NaN`, `Infinity`; level `NaN`; dose `0`, `-1`, `NaN`; seed `1.5`, `-1`, `4294967296`; dimensions `0`, `-1`, `1.5`; and an image of the wrong size each throw `NoiseError` with the matching reason, and state is unchanged afterwards.
5. **No noise by default (US2)**: with dose `Infinity` the output equals the window/level result and the generator state does not change across frames.
6. **Quantum statistics (US2, SC-002)**: with a fixed seed on a constant 256x256 frame, `128` at dose `1000` has mean within `0.5` of `128` and standard deviation within 5% of `5.72`; dose `4000` gives half that (ratio `0.5` within 5%); `192` is about twice as noisy as `48` at the same dose (ratio `2` within 5%).
7. **Reproducibility (US2)**: the same seed and call sequence gives identical frames; different seeds differ; successive frames differ; `reseed` restores the first frame; two controllers share nothing.
8. **Order and clamping (US2)**: with a narrow window the noise is visibly amplified in the output, and with dose below `1` every output byte stays within `0` to `255`.
9. **End to end (US2, SC-004)**: `compose` then `processFrame` then the renderer's `updateBuffer` followed by `readSurface` returns the processed bytes; the compositor output buffer and every registered layer are byte-identical before and after.
10. **Zero allocation (SC-003)**: the benchmark processes 512x512 frames with noise on; heap growth stays under 100 KB while an allocating control exceeds it, and time per frame stays within the calibrated budget.
11. **Regression and gates**: all existing tests pass unchanged; typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in the module.
