# Quickstart: Validating Simulation Orchestrator

See [contracts/simulation-orchestrator-api.md](./contracts/simulation-orchestrator-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/simulation-orchestrator
fnm env --shell fish | source; and fnm use 24; and npx vitest run
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Wiring (US2)**: a created engine has all five states; `temporal.compositor` and `kinematic.compositor` are `compositor`; `noise` and the compositor have the same dimensions; the viewport defaults to the image size.
2. **Creation errors (US2)**: dimensions `0` or `1.5`, `maxTracks` `0`, `maxKeyframes` `0`, a negative noise dose, and a zero viewport each reject with the matching sub-module error and reason; no renderer is left allocated.
3. **Single layer, no tracks (US1)**: tick returns the layer after identity window/level; `readSurface` shows the same bytes.
4. **Temporal (US1)**: the weight track in the contract's worked example gives `[0,0,0,0]`, `[0,50,100,125]`, and `[0,100,200,250]` at `0`, `500`, and `1000` ms.
5. **Kinematic (US1)**: the linear track gives a one-pixel right shift with a zero vacated column at `1000` ms.
6. **Both tracks (US1)**: one layer with both tracks applies weight and offset in the same tick.
7. **Determinism and scrubbing (US1)**: with noise off, equal times give equal frames, a later time followed by an earlier one gives the earlier frame's bytes, and two engines share nothing.
8. **Time validation (US1)**: `NaN`, `Infinity`, and `-Infinity` throw `SimulationError` with reason `'invalid-time'`, and weights, offsets, and the output are unchanged afterward.
9. **Noise and window/level (US1)**: with a narrow window and a finite dose set on `engine.noise`, the returned frame matches a standalone `processFrame` run on the same composed input with the same seed.
10. **Renderer output (US1/US2)**: after a tick, `readSurface` returns the returned image's bytes replicated to RGB with alpha `255` (for a viewport equal to the image size); with a bound canvas the frame is presented there.
11. **Stable identity (US3)**: the returned image and its `data` are the same instances on every tick, and none of the five engine fields change.
12. **Zero allocation (SC-003)**: the benchmark ticks a 512x512 engine with four layers, both track kinds on every layer, and noise on; heap growth stays under 100 KB while an allocating control exceeds it, and time per tick stays within the calibrated budget.
13. **Regression and gates**: all existing tests pass unchanged; typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in the module.
