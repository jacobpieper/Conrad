# Implementation Plan: Viewport Canvas

**Branch**: `013-viewport-canvas` (working on `master`) | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-viewport-canvas/spec.md`

## Summary

Add a UI-layer module `src/lib/viewport/` that is the only boundary between the DOM and the engine. `Viewport.svelte` mounts one `<canvas>` inside a container. The canvas backing store is fixed at the engine's native `width x height`; CSS (never the backing store) scales it. A `ResizeObserver` on the container records the observed size, from which the component derives a uniform fit scale `s = min(cw / W, ch / H)` and sizes the canvas in CSS pixels. Pointer events are captured on the canvas; the canvas-local offset is projected to grid space by a pure per-axis function `toGrid(offset, cssExtent, gridExtent)` and dispatched as plain-number payloads: `onpointer({ x, y, buttons })` for the primary pointer (kinematic route) and `onwindow({ x, y, dx, dy })` while the middle button drags (windowing route). `render(frame)` validates a `GrayscaleImage`, expands it into a reusable `ImageData` through its `Uint32Array` view with a pure function `expandGrayscale`, and calls `putImageData`. Crispness comes from scoped `image-rendering: pixelated` plus `imageSmoothingEnabled = false`.

The repo has no SvelteKit project yet, so the feature first scaffolds a barebones one beside `src/core`: dev dependencies, `vite.config.ts` (`sveltekit({ adapter })` with `adapter-static`, SPA fallback; SvelteKit 3 rejects `svelte.config.js`), `src/app.html`, `src/app.d.ts`, and `src/routes/` (`+layout.ts` with `ssr = false`, `+layout.svelte`, `+page.svelte`). The existing `vitest.config.ts` stays separate and gains `svelte()` so tests compile the component.

Everything DOM-shaped (`HTMLCanvasElement`, `ResizeObserver`, `PointerEvent`) stays inside the `.svelte` file; the projection, expansion, and payload types are plain TypeScript with no DOM or Svelte imports. `src/core` is not modified and never imports from `src/lib`.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022; Svelte 5 (runes) for the single component

**Primary Dependencies**: New dev dependencies `@sveltejs/kit` (3.1.x), `@sveltejs/adapter-static` (4.x), `@sveltejs/vite-plugin-svelte` (7.3.x), `svelte` (5.57.x), `svelte-check` (4.x). All are already in `node_modules` (left from earlier demo work) but absent from `package.json`; this feature declares them. That combination was verified compatible with Vite 8 and TypeScript 6 in the 011-demos planning notes. Install with `--legacy-peer-deps` alongside the eslint tooling.

**Storage**: N/A (one reusable `ImageData` of `W * H * 4` bytes owned by the component)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing), with `svelte()` added to `vitest.config.ts` plugins so `.svelte` files compile. Real DOM, real canvas, real component; no mocks. Real mouse input (needed for pointer capture) through a small Playwright-backed Vitest browser command. Pure functions tested with real typed arrays; one benchmark for `expandGrayscale`.

**Target Platform**: Browser, client-side (Chrome 120+, Firefox 125+, Safari 18+)

**Project Type**: Single project that becomes a SvelteKit app beside `src/core`; adds the skeleton, `src/lib/viewport/`, and no `src/core` changes

**Performance Goals**: `expandGrayscale` on 512x512 under 1 ms per call on the test machine (the existing renderer loop does the same job in the same shape); `putImageData` of the native-size buffer is a single call per frame. Verified by measurement.

**Constraints**: Zero JS allocation per `render` call and per expansion; one `ImageData` and one `Uint32Array` view created at mount; canvas `width`/`height` assigned exactly once; no `MouseEvent`/`HTMLElement` in any exported type; vanilla CSS in the component's `<style>` only; no semicolons, `any`, or `@ts-ignore`; no polyfills or feature checks.

**Scale/Scope**: One component, three small TS files plus `types`, one error class. A pointer payload object is created per event (UI layer, not a pixel hot loop); see open flag 4.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | Frame expansion is a pure procedural function over flat typed arrays, with a single pre-allocated `ImageData`/`Uint32Array`. No classes hold pixel data. Per-event payload objects are UI plumbing outside the pixel loops. |
| II. Pipeline Modularity | PASS | Separate files: projection, expansion, types, component. Declared contracts: `GrayscaleImage` in, `ImageData` out; CSS-offset numbers in, grid-number payloads out. Client-side only. Origin top-left, row-major indexing preserved. |
| III. UI Standards | PASS | Svelte component with scoped vanilla CSS; no CSS frameworks. The core imports nothing from the UI and the UI exposes no DOM types. Svelte reactivity is used only inside the component, never in `src/core`. |
| IV. Testing & Benchmarking | PASS | Vitest only; real typed arrays and a real canvas; `expandGrayscale` has a benchmark asserting a time budget and zero heap growth. |
| V. Code, Git & Governance | PASS | Strict TS, no semicolons, Conventional Commits, Fish, one command at a time with the `fnm` prefix. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | No render loop, no zoom/pan, no integer scaling, no DPR handling, no event bus. SvelteKit skeleton is minimal: one adapter, one placeholder route, no stores, hooks, or server code. Callback props, not a dispatcher framework. No `contentBoxSize` or capture feature checks. |

Post-design re-check (after Phase 1): unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/013-viewport-canvas/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── viewport-api.md
```

### Source Code (repository root)

```text
vite.config.ts          # sveltekit({ adapter: adapter-static SPA fallback }); no svelte.config.js in Kit 3
src/app.html            # document shell
src/app.d.ts            # empty App namespace
src/routes/
├── +layout.ts          # ssr = false
├── +layout.svelte      # renders children
└── +page.svelte        # placeholder; later a manual-check harness for Viewport

src/lib/viewport/
├── types.ts         # ViewportGrid, PointerPayload, WindowPayload, button constants, ViewportError
├── projection.ts    # toGrid(offset, cssExtent, gridExtent), fitScale(cw, ch, w, h)
├── expand.ts        # expandGrayscale(source, target32)
├── Viewport.svelte  # canvas + ResizeObserver + pointer routing + render()
└── index.ts         # public exports (component, types, error)

tests/unit/viewport/
├── projection.test.ts   # fit scale, clamping, corners and centre
├── expand.test.ts       # byte-exact expansion, length mismatch behaviour
├── expand.bench.ts      # time budget and zero heap growth at 512x512
├── viewport.test.ts     # mount, render read-back, CSS and context, errors
├── layout.test.ts       # ResizeObserver fit, zero-size container, backing store untouched
├── pointer.test.ts      # primary routing, scale changes, capture clamping, secondary pointers
├── windowing.test.ts    # middle drag deltas, silence of onpointer, release/cancel
└── boundary.test.ts     # core imports nothing from the UI; no DOM types in public files

tests/setup/
└── mouse-command.ts     # Vitest browser command: real Playwright mouse down/move/up

vitest.config.ts         # + svelte() plugin, + mouse command registration
package.json             # + kit, adapter-static, vite-plugin-svelte, svelte, svelte-check; dev/build/preview/check/prepare scripts
tsconfig.json            # extends $app/tsconfig (Kit 3), types + $app/types, keeps the strict flags and include
.gitignore               # + .svelte-kit/
eslint.config.js         # unchanged (typed lint scope stays src/**/*.ts; .svelte is checked by svelte-check)
```

**Structure Decision**: `src/lib/` is the SvelteKit `$lib` home and keeps the UI strictly outside `src/core`, so the dependency arrow only points from UI to engine. Logic that can be pure (`toGrid`, `fitScale`, `expandGrayscale`) is split out of the component so it is tested with plain typed arrays and numbers, leaving the `.svelte` file as thin DOM glue. The component imports only the `GrayscaleImage` type from the engine, never engine state.

## Complexity Tracking

No constitution violations. Nothing to justify.

## Open Flags for Human Review

1. **SvelteKit scaffold is in scope (decision update)**: per direction, this feature scaffolds a barebones SvelteKit app first (static adapter, SPA via `ssr = false` because the engine uses `OffscreenCanvas`) before the component. Two config files coexist: `vite.config.ts` for the app and the existing `vitest.config.ts` for tests (Vitest prefers its own file), so tests do not load the Kit plugin and import with relative paths rather than `$lib`. Making `tsconfig.json` extend the Kit-generated one needs `svelte-kit sync` (the `prepare` script); the strict flags must stay, so any Kit default that conflicts with them (e.g. `verbatimModuleSyntax`) is fixed in the source, not by loosening flags.
2. **Primary pointer interpretation**: "primary pointer coordinates" is implemented as the primary pointer (`isPrimary`) streaming position on every move, down, and up, with the `buttons` bitmask, so a consumer can choose hover or press semantics. If only left-button-held coordinates are wanted, the consumer filters `buttons & 1`.
3. **Middle drag is exclusive**: while the middle button is held, `onpointer` is silent and `onwindow` receives the movement. A left press during a middle drag is ignored.
4. **Per-event payload allocation**: each dispatched payload is a fresh object so consumers may keep it. Reusing one mutable payload would avoid garbage at the cost of aliasing bugs; pointer rates are far below the pixel loops, so the safe choice was made.
5. **Clamped, fractional coordinates**: payload coordinates are continuous and clamped to `[0, W] x [0, H]` (closed). A consumer that needs a pixel index uses `min(floor(x), W - 1)`.
6. **Uniform fractional fit**: scaling is fractional `min(cw / W, ch / H)`; with `pixelated`, pixel edges are hard but a non-integer scale gives slightly uneven pixel widths. Integer-only scaling is out of scope but easy to add in `fitScale`.
7. **Real-mouse test command**: pointer capture rejects synthetic `PointerEvent`s with unknown pointer ids, so interaction tests drive Playwright's mouse through a custom Vitest browser command. If the Vitest 5 command API proves awkward, fall back to the built-in `userEvent` for the primary pointer and keep only the middle-button test on the command.
8. **Middle-click default suppression**: relies on `preventDefault` on `pointerdown` (which cancels the compatibility `mousedown`). Autoscroll and Linux primary-selection paste cannot be asserted in headless Chromium; verify manually in the quickstart.
9. **Engine independence**: the component does not call `bindTarget`; the engine's own bound-target path stays available for headless use. The consumer calls `tick` then `render` (see quickstart).
