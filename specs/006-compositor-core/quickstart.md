# Quickstart: Validating Compositor Core

See [contracts/compositor-core-api.md](./contracts/compositor-core-api.md) and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; dependencies installed; Playwright Chromium installed.
- `vitest.config.ts` needs `--enable-precise-memory-info` (already present) for heap measurements.

## Run

```fish
fnm env --shell fish | source; and fnm use 24; and npx vitest run tests/unit/compositor-core
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **Registration (US1)**: register two layers; ids are `0` and `1`; weights and active flags match. Unregister `0`, register again, and the new layer reuses slot `0`. The old id is rejected with `'unknown-layer'` until reused.
2. **Rejection leaves state intact (US1)**: a wrong-length layer, weight `-1`, `NaN`, `Infinity`, an out-of-range id, and a registration beyond `maxLayers` each throw `CompositorError` with the matching reason, and a following `compose` is unchanged.
3. **Weighted sum (US2)**: layers `[100, 200]` (weight `0.5`) and `[50, 200]` (weight `2`) give `[150, 255]` (`100 + 400 = 500` clamps); fractional sums round to nearest.
4. **Active and empty (US2)**: deactivating a layer removes its contribution; with none active the output is all zeros; reactivating restores it.
5. **Renderer hand-off (US2, SC-003)**: pass `compose(state)` to `updateBuffer` on a same-size renderer and `readSurface` returns the composed bytes as RGB.
6. **Zero allocation (SC-002)**: the benchmark composes 8 layers at 512x512 repeatedly; heap growth stays under 100 KB while an allocating control exceeds it, and time stays within the budget.
7. **Type and lint gates**: typecheck and lint report no errors; no semicolons, `any`, or `@ts-ignore` in the module.
