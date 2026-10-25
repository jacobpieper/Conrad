# Research: Viewport Canvas

All Technical Context items are resolved; no `NEEDS CLARIFICATION` remains.

## 1. Where the component lives and what Svelte tooling it needs

- **Decision**: Scaffold a barebones SvelteKit app now (direction update), then put the component at `src/lib/viewport/Viewport.svelte`. Dev dependencies: `@sveltejs/kit`, `@sveltejs/adapter-static`, `@sveltejs/vite-plugin-svelte`, `svelte`, `svelte-check`. Files: `vite.config.ts` (`sveltekit({ adapter: adapter({ fallback: 'index.html' }) })`; SvelteKit 3 no longer reads `svelte.config.js` and errors if one exists), `src/app.html`, `src/app.d.ts`, `src/routes/+layout.ts` (`ssr = false`), `+layout.svelte`, `+page.svelte`. Keep `vitest.config.ts` separate and add `svelte()` to it.
- **Rationale**: Constitution III names SvelteKit as the sole UI framework and `$lib` is its component home. `node_modules` already holds `@sveltejs/kit` 3.1.0, `adapter-static` 4.x, `vite-plugin-svelte` 7.3.1, `svelte` 5.57.2, and `svelte-check` 4.7.7 (an earlier demo setup was reverted but the packages remained), verified compatible with Vite 8 and TypeScript 6 in the 011-demos notes. `ssr = false` is required because the engine uses `OffscreenCanvas` and the component touches the DOM; the static adapter keeps the app 100% client-side (Constitution II). Vitest uses `vitest.config.ts` in preference to `vite.config.ts`, so tests need only the plain Svelte plugin, not the Kit plugin, and import via relative paths.
- **Alternatives considered**: (a) Raw Svelte without Kit: contradicts the direction and Principle III. (b) `adapter-auto`/node adapter: implies a server runtime, forbidden by Constitution II. (c) Merging test config into `vite.config.ts`: the Kit plugin and `$lib` alias are unneeded in tests, and the existing tick-bench config pattern already uses separate Vitest configs. (d) Extra scaffold (hooks, stores, multiple routes): speculative (Constitution VII).

## 2. Canvas resolution versus display size

- **Decision**: Set `canvas.width = W` and `canvas.height = H` once at mount (native grid). Scale only with CSS `width`/`height` in pixels. Never touch the attributes on resize.
- **Rationale**: Resizing the backing store clears the bitmap and resets context state (including `imageSmoothingEnabled`), and would make the projection depend on device pixels. A fixed backing store makes `putImageData` a direct native-size blit and makes the projection a single ratio: `cssExtent / gridExtent`.
- **Alternatives considered**: Backing store at CSS size with `drawImage` upscaling: needs smoothing off and extra work every frame, and re-creates context state on each resize. High-DPI backing stores: unnecessary because the content is a nearest-neighbor enlargement of the grid.

## 3. Fitting the canvas to the container

- **Decision**: Observe the **container** with a `ResizeObserver`; read `entry.contentBoxSize[0]` (`inlineSize`, `blockSize`). Compute `s = min(cw / W, ch / H)` and set the canvas CSS size to `W * s` by `H * s` via Svelte `style:` bindings, centered with flex in the container. If either extent is zero, render no canvas size (`display: none` via zero size).
- **Rationale**: Matches the requirement to observe the container. Making the component, not CSS aspect-ratio rules, compute the canvas size means the scale used for projection is exactly the scale used for display, with no layout read per event. `contentBoxSize` is available in all target browsers, so no `contentRect` fallback is needed (Constitution VII).
- **Alternatives considered**: CSS `object-fit`/`aspect-ratio` with `max-width/height`: the browser's size would then have to be re-measured by `getBoundingClientRect` on each event (forced layout) to project correctly. Observing the canvas itself: contradicts the requirement and hides container-driven layout.

## 4. Pointer coordinate source

- **Decision**: Use `event.offsetX` / `event.offsetY` (canvas-local, CSS pixels) with the last observed canvas CSS extent, so `x = clamp(offsetX * W / cssWidth, 0, W)`.
- **Rationale**: `offsetX` is relative to the canvas's padding edge, so it is unaffected by page scroll, container position, or ancestor translation, and needs no `getBoundingClientRect`. The canvas has no border or padding by construction. With pointer capture, `offsetX` stays relative to the capturing canvas and may fall outside `[0, cssWidth]`, which the clamp handles.
- **Alternatives considered**: `clientX - rect.left`: needs a layout read per event and breaks under stale rects while scrolling. Normalizing by the container instead of the canvas: ignores letterboxing.

## 5. Pointer capture, button routing, and default suppression

- **Decision**: One `pointerdown`/`pointermove`/`pointerup`/`pointercancel` handler set on the canvas. On `pointerdown` call `setPointerCapture(event.pointerId)`. For `button === 1` also call `preventDefault()` and begin a windowing drag. `touch-action: none` in CSS. Ignore events where `isPrimary` is false.
- **Rationale**: Capture keeps move/up events flowing when a drag leaves the canvas, which makes drags reliable and makes clamping meaningful. Canceling `pointerdown` suppresses the compatibility `mousedown`, which is what triggers Windows/Linux middle-click autoscroll and X11 primary-selection paste. `buttons` is passed through as the standard bitmask so consumers read the live state.
- **Alternatives considered**: `mouse*` events: no capture, no touch/pen. Window-level listeners: leaks DOM wiring beyond the component and needs manual teardown. A `contextmenu` handler: right-button behavior is out of scope.

## 6. Windowing payload shape

- **Decision**: `onwindow({ x, y, dx, dy })` with `dx`, `dy` as grid-space differences from the previous sample of the same drag (the press position is the initial sample). The previous sample is held in two local numbers set on press.
- **Rationale**: Window/level adjustment is a relative gesture; consumers apply their own sensitivity. Deltas in grid space are independent of the current display scale, so a resize mid-drag cannot cause jumps.
- **Alternatives considered**: Raw CSS deltas: couples the consumer to scale. Absolute coordinates only: forces every consumer to track previous values. Separate `start`/`end` callbacks: not required; release simply stops events (speculative otherwise).

## 7. Frame expansion path

- **Decision**: Allocate once at mount: `ImageData` from `ctx.createImageData(W, H)` and `Uint32Array` over its buffer. `expandGrayscale(source, target32)` does `target32[i] = 0xff000000 | source[i] * 0x010101` in an indexed loop; then `ctx.putImageData(image, 0, 0)`.
- **Rationale**: Identical technique to `updateBuffer` in the headless renderer (verified), already measured as fast; one pass over `W * H` bytes, one native blit. Little-endian packing is correct on all supported browsers' platforms (the renderer relies on the same).
- **Alternatives considered**: Four-byte writes into the `Uint8ClampedArray` view: 4x the stores. `OffscreenCanvas` staging plus `drawImage`: needed only for scaling, which CSS now does. Taking the engine's `bindTarget` path: its `render` scales with smoothing enabled, which contradicts the crispness requirement for this component.

## 8. Smoothing and `image-rendering`

- **Decision**: `canvas { image-rendering: pixelated; }` in the scoped `<style>` plus `ctx.imageSmoothingEnabled = false` immediately after obtaining the context.
- **Rationale**: Both were requested. CSS governs the browser's enlargement of the backing store (the relevant one here); the context flag guards any `drawImage` use and satisfies the requirement. `pixelated` is supported in all target browsers, so no `crisp-edges` fallback is added.
- **Alternatives considered**: `image-rendering: crisp-edges` fallback: shim, forbidden.

## 9. Error behavior

- **Decision**: `ViewportError` with reasons `invalid-grid`, `invalid-frame`, `canvas-unavailable`; thrown at the failing call; same shape as `RendererError` and `CaptureError`.
- **Rationale**: Constitution VII fail-fast; consistent with every other module.
- **Alternatives considered**: Silently ignoring a wrong-size frame: hides integration bugs.

## 10. Testing real input

- **Decision**: Tests mount the real component with Svelte's `mount`, read back real canvas pixels with `getImageData`, and drive real mouse input through a Vitest browser command (`tests/setup/mouse-command.ts`, built with `defineBrowserCommand` from `@vitest/browser-playwright`) calling Playwright's `page.mouse.move/down/up`. Container resizing is done by changing the container element's CSS size.
- **Rationale**: `setPointerCapture` throws for pointer ids that are not active, so dispatching synthetic `PointerEvent`s cannot exercise capture; real input does. No mocks are involved (Constitution IV).
- **Alternatives considered**: Synthetic events with a try/catch around capture: hides the behavior under test and adds a shim. `userEvent` alone: cannot press the middle button.

## 11. Boundary enforcement

- **Decision**: A test scans `src/core/**` source text for imports of `svelte`, `$lib`, or `src/lib`, and scans the component's public type file for `Event`, `HTMLElement`, `PointerEvent`, `MouseEvent`.
- **Rationale**: Turns the Principle III clause into an executable check rather than a review item.
- **Alternatives considered**: ESLint `no-restricted-imports`: the lint config deliberately covers `src/**/*.ts`; one config rule for a single boundary is acceptable later but a test is enough for the MVP.
