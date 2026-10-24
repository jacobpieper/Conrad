# Quickstart: Validating Temporal Controller

See [contracts/temporal-controller-api.md](./contracts/temporal-controller-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/temporal-controller
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Track registration (US1)**: add two tracks on two registered layers; ids are `0` and `1`. Remove `0`, add again, and the new track reuses slot `0`. The removed id is rejected with `'unknown-track'` until reused.
2. **Rejection leaves state intact (US1)**: each of these throws `TemporalError` with the matching reason and changes nothing: an unregistered layer (`'unknown-layer'`), a second track on the same layer (`'layer-already-driven'`), a track beyond `maxTracks` (`'capacity-exceeded'`), empty keyframes, more than `maxKeyframes`, mismatched lengths, equal or decreasing times, `NaN` or `Infinity` times or values, and negative values (all `'invalid-keyframes'`).
3. **Interpolation (US2)**: keyframes `(0, 0), (1000, 1), (4000, 0.2)` give weights `0.5` at `500`, `1` at `1000`, and `0.6` at `2500` (within float32 precision).
4. **Clamping (US2)**: the same track gives `0` at `-100` and `0.2` at `9999`; a single-keyframe track is constant.
5. **Statelessness (US2)**: evaluating `2500`, then `500`, then `2500` again gives `0.6`, `0.5`, `0.6`; non-finite times throw `'invalid-time'` and write nothing.
6. **Multiple tracks (US2)**: two tracks update in one call; a layer without a track keeps its weight.
7. **Compositor integration (US2, SC-003)**: a constant layer of value 100 composes to 50, 100, and 20 after `evaluate` at `500`, `1000`, and `4000`.
8. **Zero allocation (SC-002)**: the benchmark evaluates 8 tracks of 16 keyframes repeatedly; heap growth stays under 100 KB while an allocating control exceeds it, and time stays within the budget.
9. **Gates**: typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in the module.
