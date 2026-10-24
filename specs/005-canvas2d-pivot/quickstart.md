# Quickstart: Validating the Canvas 2D Pivot

See [headless-renderer-api.md](./contracts/headless-renderer-api.md), [image-loader-api.md](./contracts/image-loader-api.md), and [data-model.md](./data-model.md).

## Prerequisites

- `fnm` Node environment per the constitution; Playwright Chromium installed.
- `vitest.config.ts` has no WebGPU launch flags; `@webgpu/types` is removed from `package.json` and `tsconfig.json`.

## Run

```fish
fnm env --shell fish | source; and fnm use 24; and npm test
fnm env --shell fish | source; and fnm use 24; and npm run typecheck
fnm env --shell fish | source; and fnm use 24; and npm run lint
```

## Scenarios

1. **No WebGPU remnants**: `grep -ri "webgpu\|GPU" src tests vitest.config.ts tsconfig.json package.json` returns nothing.
2. **Renderer parity**: existing renderer tests pass with the same calls. A viewport-sized image reads back byte-exact; a mismatched aspect image matches the reference within the measured tolerance; letterbox pixels equal `16`.
3. **Target presentation**: `bindTarget` an `OffscreenCanvas`; its pixels equal `readSurface` after `updateBuffer` and `resize`.
4. **Loader downscale**: with defaults, a 4000x3000 fixture yields 128x96; a 64x32 fixture is unchanged; a 300x100 fixture yields 128x42; `{ maxWidth: 50, maxHeight: 50 }` on 200x100 yields 50x25.
5. **Loader validation**: `{ maxWidth: 0 }` and `{ maxHeight: 1.5 }` reject with `'invalid-options'` without fetching.
6. **Benchmark**: repeated constant-size `updateBuffer` shows no heap growth; 1920x1080 update + render is under 50 ms.
