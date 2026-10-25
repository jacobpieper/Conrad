# Quickstart: Viewport Canvas

Validation guide for `src/lib/viewport/`. Contract: [contracts/viewport-api.md](./contracts/viewport-api.md). Entities and rules: [data-model.md](./data-model.md).

## Prerequisites

- Node 24 via `fnm`, Playwright Chromium installed (existing setup).
- Dev dependencies `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check` declared in `package.json` and installed (use `--legacy-peer-deps` alongside the eslint tooling, per repo notes).
- `vitest.config.ts` includes the `svelte()` plugin and the real-mouse browser command.

All commands run one at a time in Fish with the prefix `fnm env --shell fish | source; and fnm use 24; and`.

## 1. Typecheck, lint, tests

```text
npm run typecheck
npm run lint
npm test
```

Expected: all pass. The viewport suites are `tests/unit/viewport/*`.

## 2. Scenario: crisp, byte-exact rendering (User Story 1)

1. Mount `Viewport` with `width=4`, `height=4` in a `200 x 200` container.
2. Call `render` with a frame whose bytes are `0, 17, 34, ...`.
3. Read the canvas with `getImageData(0, 0, 4, 4)`.

Expected: every pixel is `255` alpha with `R = G = B =` the input byte; `canvas.width === 4`; computed `image-rendering` is `pixelated`; the canvas CSS size is `200 x 200`.

## 3. Scenario: resize and fit (User Story 2)

1. Mount a `4 x 2` grid in a `100 x 100` container: canvas CSS is `100 x 50`.
2. Change the container to `40 x 100`: canvas CSS becomes `40 x 20`.
3. Change the container to `0 x 100`: no payloads can be produced.

Expected: `canvas.width`/`height` unchanged at `4`/`2` throughout.

## 4. Scenario: primary pointer projection (User Story 3)

1. Grid `100 x 50`, container `200 x 100` (scale `2`). Move the real mouse to canvas-local CSS `(100, 50)`.
2. Resize the container to `400 x 200` (scale `4`) and move to canvas-local `(100, 50)` again.

Expected: first payload `{ x: 50, y: 25, buttons: 0 }`; second `{ x: 25, y: 12.5, buttons: 0 }`. Press the left button, drag far outside the canvas, release: payloads continue and stay inside `[0, 100] x [0, 50]`; `buttons` is `1` during the drag.

## 5. Scenario: middle-drag windowing (User Story 4)

1. Grid `100 x 50` at scale `2`. Press the middle button at canvas-local `(20, 20)`, move to `(40, 30)`, then `(40, 50)`, release.

Expected: `onwindow` payloads `{ x: 20, y: 15, dx: 10, dy: 5 }` then `{ x: 20, y: 25, dx: 0, dy: 10 }`; `onpointer` is never called during the drag; after release, hover moves reach `onpointer` again.

Manual check (cannot run headless): in a real browser, middle-click and drag over the canvas does not start autoscroll and does not paste the X11 primary selection.

## 6. Scenario: engine boundary (User Story 5)

Run the boundary test: no `svelte`, `$lib`, or `src/lib` import under `src/core`, and no `Event`/`HTMLElement` identifiers in `types.ts` or `index.ts`.

## 7. Scenario: errors

- `width = 0`, `1.5`, or `NaN` at mount throws `ViewportError` with reason `invalid-grid`.
- `render` with a frame of the wrong size throws `invalid-frame` and leaves the canvas pixels unchanged.

## 8. Scenario: expansion benchmark

Run `expand.bench.ts` (part of `npm test`).

Expected: `expandGrayscale` on 512x512 stays under the 1 ms budget and shows no heap growth over many iterations against an allocating control (same technique as the existing benchmarks).

## 9. Optional integration check

In any SvelteKit page that has an engine: mount `<Viewport width={w} height={h} bind:this={viewport} />`, then in a `requestAnimationFrame` callback call `viewport.render(tick(engine, t))`. The image appears enlarged with hard pixel edges, resizing the window keeps it centered and uniformly fit, and moving or middle-dragging over it produces payloads in engine pixel units.
