# Quickstart: Validating Kinematic Controller

See [contracts/compositor-offsets-api.md](./contracts/compositor-offsets-api.md), [contracts/kinematic-controller-api.md](./contracts/kinematic-controller-api.md), and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

Run each command on its own, without piping its output, and use `vitest run` so it exits instead of watching:

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/compositor-core
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/kinematic-controller
fnm env --shell fish | source; and fnm use 24; and npx vitest run
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Compositor offsets (US1)**: the worked examples in the offsets contract compose to the stated bytes; a layer with `(0, 0)` composes exactly as before; offsets at or beyond the image size give all zeros; several layers with different offsets and weights sum correctly.
2. **Buffers untouched (US1, SC-004)**: after `compose` with offsets, each registered layer is the same object, still holds its original bytes, and no copy was made.
3. **Offset lifecycle and validation (US1)**: a new layer, and a slot reused after `unregisterLayer`, starts at `(0, 0)`; non-integer, `NaN`, `Infinity`, and beyond-int32 offsets throw `'invalid-offset'`; unknown ids throw `'unknown-layer'`; state is unchanged after each failure.
4. **Track registration (US2)**: add one track of each mode on three layers; ids are `0`, `1`, `2`. Remove `0`, add again, and the new track reuses slot `0`; the removed id throws `'unknown-track'` until reused.
5. **Track rejection (US2)**: each of these throws `KinematicError` with the matching reason and changes nothing: unknown mode, mismatched array lengths, empty or too many keyframes, equal or decreasing times, `NaN`, `Infinity`, or oversized values, `periodMs <= 0`, a non-integer or zero `exponent`, an oversized `|center| + |amplitude|` (all `'invalid-motion'`), an unregistered layer (`'unknown-layer'`), a second track on the same layer (`'layer-already-driven'`), and a track beyond `maxTracks` (`'capacity-exceeded'`).
6. **Interpolation modes (US3)**: the worked examples in the controller contract hold for linear, cubic, and parametric (exponent 1 and 2); clamping holds outside the keyframe range for linear and cubic; parametric is periodic and works for negative times; a single keyframe is constant; two cubic keyframes equal linear.
7. **Statelessness and time validation (US3)**: evaluating `500`, `1500`, `500` gives the same result for the first and third calls; non-finite times throw `'invalid-time'` and write nothing; unregistering a tracked layer makes `evaluateMotion` throw `CompositorError('unknown-layer')`.
8. **End to end (US3)**: a 4x1 layer `[10, 20, 30, 40]` with a linear X track from `0` at `0` to `2` at `1000` composes to `[0, 10, 20, 30]` after `evaluateMotion(500)` and `[0, 0, 10, 20]` after `evaluateMotion(1000)`; with the temporal controller also driving that layer's weight, both effects apply together.
9. **Zero allocation (SC-002, SC-003)**: both benchmarks keep heap growth under 100 KB while an allocating control exceeds it, and stay within their time budgets.
10. **Regression**: all existing compositor, temporal, renderer, and loader tests pass unchanged.
11. **Gates**: typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in either module.
