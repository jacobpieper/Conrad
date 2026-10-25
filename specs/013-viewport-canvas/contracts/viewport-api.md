# Contract: Viewport Canvas API

Public surface of `src/lib/viewport/` (`index.ts`). The only consumers are SvelteKit pages and components. See [data-model.md](../data-model.md) for field rules.

## Exports

```ts
export { default as Viewport } from './Viewport.svelte'
export { ViewportError, buttonPrimary, buttonSecondary, buttonMiddle } from './types'
export type { ViewportGrid, PointerPayload, WindowPayload, ViewportErrorReason, GrayscaleImage } from './types'
```

`toGrid`, `fitScale`, and `expandGrayscale` are module-internal pure helpers (exported from their own files for tests, not from `index.ts`).

## Component

```svelte
<Viewport
  width={512}
  height={512}
  onpointer={(p) => ...}
  onwindow={(w) => ...}
  bind:this={viewport}
/>
```

### Props

| Prop | Type | Required | Notes |
|---|---|---|---|
| `width` | `number` | yes | engine native grid width; positive integer |
| `height` | `number` | yes | engine native grid height; positive integer |
| `onpointer` | `(payload: PointerPayload) => void` | no | primary pointer route (kinematic) |
| `onwindow` | `(payload: WindowPayload) => void` | no | middle-drag route (windowing) |

Props are read once at mount; the grid does not change for the component's lifetime.

### Exported method

```ts
render(frame: GrayscaleImage): void
```

- Requires `frame.width === width`, `frame.height === height`, `frame.data.length === width * height`; otherwise throws `ViewportError('invalid-frame')` before touching the canvas.
- Expands into the preallocated `ImageData` and draws with one `putImageData(image, 0, 0)`.
- Allocates nothing; may be called every animation frame. The consumer owns the loop.

### Errors

| Reason | Thrown by | Cause |
|---|---|---|
| `invalid-grid` | mount | `width` or `height` not a positive integer |
| `canvas-unavailable` | mount | `getContext('2d')` returned `null` |
| `invalid-frame` | `render` | frame dimensions or length do not match the grid |

## Payloads

```ts
type PointerPayload = { x: number; y: number; buttons: number }
type WindowPayload  = { x: number; y: number; dx: number; dy: number }
```

- Coordinates are grid-space, continuous, origin top-left, y down, clamped to `[0, width]` and `[0, height]`.
- `buttons` is the live bitmask (`1` primary, `2` secondary, `4` middle).
- Payloads are fresh plain objects; consumers may retain them.

### Routing rules

| Input | Result |
|---|---|
| primary pointer down/move/up, no middle drag | `onpointer({ x, y, buttons })` |
| middle `pointerdown` over canvas | capture pointer, `preventDefault()`, windowing starts (no call yet) |
| move during windowing | `onwindow({ x, y, dx, dy })`; `onpointer` is not called |
| first move after a middle press | deltas are relative to the press position (the press is the initial sample) |
| middle `pointerup` / `pointercancel` | capture released, windowing ends |
| non-primary pointer | ignored |
| container size 0 in either axis | canvas not displayed; no payloads |

## Layout and rendering guarantees

- Canvas `width`/`height` attributes equal the grid and are never reassigned.
- Canvas CSS size is `width * s` by `height * s`, `s = min(containerWidth / width, containerHeight / height)`, centered in the container.
- Computed style `image-rendering: pixelated`; context `imageSmoothingEnabled === false`; `touch-action: none`.
- The component emits no DOM or event objects, owns no loop or timer, and holds no engine reference.

## Typical consumer (illustrative, not part of this feature)

```ts
let viewport: Viewport
function frame(t: number) {
  viewport.render(tick(engine, t))
  requestAnimationFrame(frame)
}
```

## Boundary invariants (enforced by tests)

1. No file under `src/core/**` imports `svelte`, `$lib`, or `src/lib`.
2. `types.ts` and `index.ts` contain no `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement` identifiers.
3. The component's styles are vanilla CSS in its own `<style>` block.
