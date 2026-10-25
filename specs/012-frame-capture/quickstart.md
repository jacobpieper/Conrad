# Quickstart: Validating Frame Capture

See [contracts/frame-capture-api.md](./contracts/frame-capture-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/frame-capture
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator
fnm env --shell fish | source; and fnm use 24; and npx vitest run
fnm env --shell fish | source; and fnm use 24; and npm run test:tick-bench
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **No targets (US1/1, US5/1)**: an engine created without `captureTargets` has `captureTargets` equal to `[]`, and its frames match an engine built before this feature byte for byte.
2. **Allocation (US1/2-4)**: a 3x2 engine with `{ id: 'a', maxCapacity: 4, mode: 'stop' }` has a `Uint8ClampedArray` of length 24, all zeros, `isRecording` true, `headIndex` 0, `totalFramesRecorded` 0; several targets own independent buffers.
3. **Validation (US1/5-6)**: empty or non-string `id`, duplicate `id`, `maxCapacity` of `0`, `-1`, `1.5`, `NaN`, and an unknown `mode` each throw `CaptureError` with the matching reason; `createEngine` leaves no renderer allocated. An absurdly large capacity surfaces the native `RangeError`.
4. **Stop mode (US2)**: capacity 3, five ticks; frames land in slots 0, 1, 2 equal to the returned bytes, recording halts after the third with `headIndex` 3 and `totalFramesRecorded` 3, and ticks 4 and 5 change nothing. Capacity 1 stores only the first frame.
5. **Loop mode (US3)**: capacity 3, five ticks; slots hold frames `4, 5, 3`, `headIndex` 2, `totalFramesRecorded` 5, `isRecording` true. Repeat for more than two full wraps and check the oldest/newest formulas. Capacity 1 overwrites slot 0 every tick with `headIndex` staying 0.
6. **Worked example (contract)**: reproduce the contract's two-target table exactly, including the `NaN` row.
7. **Final frame (SC-002)**: with a narrow window/level and a finite dose, the newest slot equals the returned (noisy, windowed) bytes and `previousFrame`.
8. **Pipeline untouched (US5/1)**: two engines with identical options except targets return identical frames each tick; the returned image and `data` instances are stable.
9. **Invalid time (US5/2, SC-005)**: `NaN`, `Infinity`, `-Infinity` throw `SimulationError('invalid-time')` and leave every target's buffer and fields unchanged.
10. **Pause and resume (US5/3)**: set `isRecording = false`, tick, and confirm buffer and counters are unchanged; set it back and confirm writing resumes at the same `headIndex`.
11. **Stable identity (US4/3)**: `engine.captureTargets`, each target, and each buffer are the same instances with the same length after many ticks.
12. **Zero allocation and budget (SC-004)**: the 512x512 benchmark (four layers, both track kinds, noise on, one loop and one stop target, enough ticks to wrap the loop target and halt the stop target) shows heap growth under 100 KB against an allocating control exceeding it, and mean tick under 5 ms; a capture-only micro-benchmark stays under its ceiling.
13. **Regression and gates**: all existing tests pass unchanged; typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in changed files.
