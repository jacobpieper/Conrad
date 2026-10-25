# Feature Specification: Viewport Canvas

**Feature Branch**: `013-viewport-canvas` (working on `master`; no branch created)

**Created**: 2026-10-26

**Status**: Draft

**Input**: "Start a new feature for "viewport-canvas". (1) Feature name: Viewport Canvas. (2) Create a Svelte component (`Viewport.svelte`) managing the `<canvas>`; it strictly serves as the boundary between the DOM and the core math engine. (3) Use a `ResizeObserver` on the canvas container to detect layout changes; capture pointer events and translate CSS coordinates down to the engine's fixed native grid resolution dynamically, based on the current observed scale. (4) Dispatch pure numerical payloads (x, y, button states) to consumers; map middle-mouse drag for Windowing and primary pointer coordinates for the Kinematic Compositor. (5) Keep scaled images perfectly crisp: `image-rendering: pixelated;` in scoped vanilla CSS and `ctx.imageSmoothingEnabled = false` on the 2D context. (6) Provide an efficient path to render the engine's flat TypedArray (via `ImageData`) onto the canvas. (7) Strictly adhere to Constitution Principle III: no `MouseEvent` or `HTMLElement` types leak into the core engine; pure vanilla CSS in Svelte `<style>` tags."

Consumes the `GrayscaleImage` frames returned by `tick` (`specs/010-simulation-orchestrator`). Routes input toward `specs/008-kinematic-controller` and `specs/009-noise-controller` but calls neither.

## User Scenarios & Testing

### User Story 1 - Render a Frame Crisply at Any Display Size (Priority: P1)

A page mounts `Viewport` with the engine's native grid size and calls `render(frame)` with the frame returned by `tick`. The frame appears on the canvas, enlarged to fit its container with hard pixel edges and no blur.

**Why this priority**: Showing the engine output is the component's reason to exist; every other story builds on it.

**Independent Test**: Mount a 4x4 grid in a container much larger than 4 CSS pixels, render a known frame, and read back the canvas pixels and computed style.

**Acceptance Scenarios**:

1. **Given** a mounted `Viewport` with grid `W x H`, **Then** the canvas backing store is exactly `W x H` pixels, never the CSS size.
2. **Given** a grayscale frame of `W * H` bytes, **When** `render(frame)` is called, **Then** canvas pixel `(x, y)` is opaque gray with `R = G = B = frame[y * W + x]`.
3. **Given** the canvas is displayed larger than `W x H`, **Then** its computed `image-rendering` is `pixelated` and the 2D context has `imageSmoothingEnabled === false`.
4. **Given** repeated `render` calls, **Then** the same `ImageData` and `Uint32Array` view are reused; nothing is allocated per frame.
5. **Given** a frame whose length is not `W * H`, **Then** `render` throws `ViewportError('invalid-frame')` and the canvas is unchanged.
6. **Given** a grid that is not two positive integers, **Then** mounting throws `ViewportError('invalid-grid')`.

### User Story 2 - Stay Fitted When the Layout Changes (Priority: P1)

The container is resized (window resize, split pane drag, sidebar toggle). The canvas rescales to the largest size that fits while keeping the grid's aspect ratio, and keeps mapping pointer positions correctly.

**Independent Test**: Resize the container several times and compare the canvas CSS size to the expected fit and the projected coordinates to hand-computed values.

**Acceptance Scenarios**:

1. **Given** a container of `cw x ch` CSS pixels, **Then** the canvas CSS size is `W * s x H * s` where `s = min(cw / W, ch / H)`, centered in the container.
2. **Given** the container changes size, **Then** the new size is observed with a `ResizeObserver` and the canvas CSS size updates without remounting or touching the backing store.
3. **Given** a container with zero width or height, **Then** the canvas is not displayed and no pointer payload is produced.
4. **Given** any layout, **Then** the canvas content is never stretched non-uniformly.

### User Story 3 - Primary Pointer Routes to the Kinematic Compositor (Priority: P1)

As the user moves, presses, or releases the primary pointer over the canvas, the consumer receives the position in the engine's native grid coordinates, so it can drive a motion track without knowing about CSS.

**Independent Test**: Place a pointer at known CSS positions in containers of several sizes and compare the payload `x`/`y` with hand-computed grid coordinates.

**Acceptance Scenarios**:

1. **Given** grid `W x H` displayed at scale `s`, **When** the pointer is at canvas-local CSS offset `(ox, oy)`, **Then** `onpointer` receives `x = ox / s` and `y = oy / s` (origin top-left, y down, fractional).
2. **Given** the container is resized between two events at the same screen position, **Then** the payloads reflect the new scale.
3. **Given** a drag that leaves the canvas while a button is held, **Then** events keep arriving (pointer capture) and `x` and `y` are clamped to `[0, W]` and `[0, H]`.
4. **Given** any dispatch, **Then** the payload is a plain object of numbers `{ x, y, buttons }` where `buttons` is the standard bitmask (`1` primary, `2` secondary, `4` middle); no event or element reference is included.
5. **Given** a non-primary pointer (second touch), **Then** it produces no payload.

### User Story 4 - Middle-Mouse Drag Routes to Windowing (Priority: P1)

Holding the middle button and dragging produces grid-space deltas for a consumer to turn into window/level changes. These drags never move the kinematic target.

**Independent Test**: Press the middle button, move through known positions, release, and compare the `onwindow` payloads with hand-computed deltas; confirm `onpointer` is silent during the drag.

**Acceptance Scenarios**:

1. **Given** the middle button goes down over the canvas, **Then** the pointer is captured and the browser's default middle-click action (autoscroll or primary-selection paste) is suppressed.
2. **Given** a middle drag with pointer moves, **Then** each move calls `onwindow` with `{ x, y, dx, dy }` where `dx` and `dy` are the grid-space change since the previous sample (the press position is the initial sample, so a move that does not change position yields zero).
3. **Given** a middle drag is in progress, **Then** `onpointer` is not called.
4. **Given** the container is resized mid-drag, **Then** the next delta uses the new scale; no stale scale is applied.
5. **Given** the middle button is released or the pointer is cancelled, **Then** capture is released and `onwindow` stops.

### User Story 5 - The Engine Never Sees the DOM (Priority: P1)

The component is the only place that touches `HTMLCanvasElement`, `ResizeObserver`, and `PointerEvent`. The core stays DOM-agnostic and Svelte-agnostic.

**Independent Test**: Search `src/core` for imports from `src/lib` or `svelte`, and inspect the component's public types.

**Acceptance Scenarios**:

1. **Given** `src/core/**`, **Then** nothing imports from `src/lib/viewport`, `svelte`, or `$lib`.
2. **Given** the component's public props and payload types, **Then** none mention `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement`.
3. **Given** the component's styles, **Then** all CSS lives in its scoped `<style>` block as vanilla CSS.

### Edge Cases

- The canvas backing store is created once at the native grid size; resize never changes `canvas.width` or `canvas.height` (assigning them would clear and reset the context).
- `ctx.imageSmoothingEnabled = false` is set once after the backing store is sized, because sizing resets context state.
- The frame is single-channel; it is expanded to opaque RGBA in the component's reusable `Uint32Array` view over `ImageData`, not allocated per frame.
- Pointer coordinates use the canvas-local offset, so page scrolling and CSS transforms do not skew them.
- `buttons` reports the live bitmask; a release event reports the buttons still held after it.
- Touch scrolling and pinch-zoom over the canvas are disabled for pointer handling (`touch-action: none`).
- Rendering is pull-driven: the component owns no animation loop, timer, or engine reference.
- The grid is fixed for the component's lifetime (engines cannot be resized); changing it requires remounting.
- Windowing sensitivity, the mapping from `dx`/`dy` to window and level, and the use of primary coordinates to build tracks are consumer concerns, not this feature's.

## Requirements

- **FR-001**: `src/lib/viewport/Viewport.svelte` MUST accept props `width` and `height` (the engine's native grid, positive integers), `onpointer`, and `onwindow`, and MUST render one `<canvas>` inside one container element.
- **FR-002**: The canvas backing store MUST be exactly `width x height`, set once at mount; the canvas CSS size MUST be derived from the observed container size by uniform fit, `s = min(containerWidth / width, containerHeight / height)`.
- **FR-003**: A single `ResizeObserver` on the container MUST be the only source of layout size; it MUST be disconnected when the component is destroyed.
- **FR-004**: Pointer coordinates MUST be computed with a pure function of the canvas-local CSS offset, the observed CSS extent, and the grid extent: `grid = clamp(offset * gridExtent / cssExtent, 0, gridExtent)` per axis, using the most recently observed extent at the time of each event.
- **FR-005**: `onpointer` MUST be called with `{ x, y, buttons }` for `pointerdown`, `pointermove`, and `pointerup` of the primary pointer when no middle drag is active; the payload MUST contain only numbers.
- **FR-006**: A middle-button `pointerdown` MUST start a windowing drag: capture the pointer, suppress the browser's default action, and call `onwindow` with `{ x, y, dx, dy }` for each `pointermove` until `pointerup` or `pointercancel`; `dx` and `dy` are grid-space deltas from the previous sample.
- **FR-007**: While a windowing drag is active the component MUST NOT call `onpointer`.
- **FR-008**: The scoped CSS MUST set `image-rendering: pixelated` on the canvas and `touch-action: none`; the 2D context MUST have `imageSmoothingEnabled = false`.
- **FR-009**: `render(frame: GrayscaleImage)` MUST be exposed by the component and MUST validate `frame.width === width`, `frame.height === height`, and `frame.data.length === width * height`, else throw `ViewportError('invalid-frame')`.
- **FR-010**: `render` MUST expand `frame.data` into one reusable `ImageData` through a `Uint32Array` view (`0xff000000 | v * 0x010101`) and draw it with `putImageData(image, 0, 0)`; it MUST allocate nothing per call.
- **FR-011**: The frame-expansion step MUST live in a pure function over typed arrays (`expandGrayscale(source, target32)`) that imports no DOM or Svelte types and is covered by a benchmark proving zero allocation and a time budget.
- **FR-012**: Invalid grid dimensions MUST throw `ViewportError('invalid-grid')` at mount; failure to obtain the 2D context MUST throw `ViewportError('canvas-unavailable')`. Errors are thrown at the failing call; there are no retries or fallbacks.
- **FR-013**: Nothing under `src/core/**` MAY import from `src/lib/**` or `svelte`; no public type of the component MAY reference `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement`; the component MUST use only vanilla CSS in its `<style>` block.
- **FR-014**: The component MUST own no animation loop, timer, engine reference, or global state; the consumer decides when to call `render`.
- **FR-015**: The repo MUST be a barebones SvelteKit project: `package.json` declares `@sveltejs/kit`, `@sveltejs/adapter-static`, `@sveltejs/vite-plugin-svelte`, `svelte`, and `svelte-check`; `vite.config.ts` carries the SvelteKit config (SvelteKit 3 does not support `svelte.config.js`); `src/app.html`, `src/app.d.ts`, and `src/routes/+layout.ts` (`ssr = false`), `+layout.svelte`, `+page.svelte` exist; `npm run build` produces a static client-only site; the existing `npm test`, `npm run typecheck`, and `npm run lint` keep passing.

## Success Criteria

- **SC-001**: A rendered frame read back from the canvas equals the input frame byte for byte (as gray RGB) at several grid sizes.
- **SC-002**: At every tested container size, projecting a pointer at the canvas corners yields `(0, 0)` and `(W, H)` and the center yields `(W / 2, H / 2)`.
- **SC-003**: Expanding a 512x512 frame meets the benchmark time budget (target under 1 ms) with no measurable JS heap growth over many iterations.
- **SC-004**: A scripted middle drag of known path produces exactly the expected `onwindow` deltas and zero `onpointer` calls.
- **SC-005**: `npm run typecheck`, `npm run lint`, `npm run check` (svelte-check), `npm test`, and `npm run build` pass.

## Assumptions

- This feature scaffolds a barebones SvelteKit app (static adapter, SPA mode with `ssr = false`, one placeholder route) beside `src/core`, because the repo has none and Constitution III makes SvelteKit the sole UI framework. `src/lib/viewport/` is SvelteKit's `$lib`.
- Chrome 120+, Firefox 125+, Safari 18+ (Constitution VII): `ResizeObserver` `contentBoxSize`, Pointer Events, and pointer capture are used without checks.
- The frame comes from `tick`'s returned `GrayscaleImage`, not from the headless renderer's bound target; the engine's renderer and this component are independent draw paths.

## Out of Scope

- Anything in the SvelteKit app beyond the barebones skeleton (placeholder route, layout, a manual-check page): no real demo, navigation, or engine wiring.
- Owning or scheduling the render loop (`requestAnimationFrame`).
- Converting `dx`/`dy` to window/level, or primary coordinates to kinematic tracks.
- Integer-only scaling, zoom, pan, high-DPI backing stores, color, or keyboard input.
- Wheel, right-button, multi-touch, and gesture handling.
