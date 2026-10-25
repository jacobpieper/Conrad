# Quickstart: Validating Previous Frame State

See [contracts/previous-frame-api.md](./contracts/previous-frame-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator
fnm env --shell fish | source; and fnm use 24; and npx vitest run
fnm env --shell fish | source; and fnm use 24; and npm run test:tick-bench
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Creation (US1/1, US2/1)**: a created engine has `previousFrame` as a `Uint8ClampedArray` with length `width * height` (equal to `noise.output.data.length`), all zeros, and it is not the same instance as `noise.output.data`.
2. **Copy after tick (US1/2)**: after `tick`, `previousFrame` equals the returned image's `data` byte for byte; the contract's worked example gives `[0,50,100,125]` then `[0,100,200,250]`.
3. **Previous frame visible during the next tick (US1/3, US2/3)**: after tick 1 and before tick 2, `previousFrame` holds tick 1's frame; after tick 2 it holds tick 2's frame. A test stage placed between two real ticks confirms the value is not the current frame.
4. **Final frame, not composed (US1/4)**: with a narrow window/level and a finite dose, `previousFrame` equals the returned (noisy, windowed) bytes and the renderer's `readSurface` gray values.
5. **Invalid time (US1/5, SC-004)**: `NaN`, `Infinity`, and `-Infinity` throw `SimulationError('invalid-time')` and leave `previousFrame` byte-for-byte unchanged.
6. **Call order, not time order (US1/6)**: tick at `1000` then `0`; `previousFrame` equals the `0` frame afterward.
7. **Stable identity (US2/2)**: `engine.previousFrame` is the same instance across many ticks, and the returned image and its `data` are also stable.
8. **Zero allocation and budget (SC-003)**: the 512x512 benchmark (four layers, both track kinds, noise on) shows heap growth under 100 KB against an allocating control exceeding it, and mean tick time under 5 ms with the copy included.
9. **Regression and gates**: all existing tests pass unchanged; typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in changed files.
