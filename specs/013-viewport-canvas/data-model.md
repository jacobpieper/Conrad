# Data Model: Viewport Canvas

The module has no persistent state. Everything is either a plain input/output payload or a per-mount value held by the component.

## Public types (`src/lib/viewport/types.ts`)

No type below references `Event`, `MouseEvent`, `PointerEvent`, or `HTMLElement`.

### `ViewportGrid`

The engine's native grid, supplied as component props.

| Field | Type | Rule |
|---|---|---|
| `width` | `number` | positive integer |
| `height` | `number` | positive integer |

Fixed for the component's lifetime. Violations throw `ViewportError('invalid-grid')`.

### `PointerPayload` (kinematic route)

| Field | Type | Meaning |
|---|---|---|
| `x` | `number` | grid x, continuous, clamped to `[0, width]` |
| `y` | `number` | grid y (top-left origin, down), clamped to `[0, height]` |
| `buttons` | `number` | live bitmask: `1` primary, `2` secondary, `4` middle |

### `WindowPayload` (windowing route)

| Field | Type | Meaning |
|---|---|---|
| `x` | `number` | current grid x, clamped |
| `y` | `number` | current grid y, clamped |
| `dx` | `number` | grid x minus previous sample's x in this drag (the press is the initial sample) |
| `dy` | `number` | grid y minus previous sample's y in this drag (the press is the initial sample) |

### Constants

`buttonPrimary = 1`, `buttonSecondary = 2`, `buttonMiddle = 4` (match `PointerEvent.buttons`).

### `ViewportError`

`reason: 'invalid-grid' | 'invalid-frame' | 'canvas-unavailable'`, extends `Error`, same shape as `RendererError` (`name = 'ViewportError'`).

### Re-exported engine type

`GrayscaleImage` (`{ width, height, data }`) is re-exported from `../../core/image-loader` as a type only; the viewport never imports engine state.

## Component-private state (`Viewport.svelte`)

| Name | Type | Lifetime | Notes |
|---|---|---|---|
| `canvas` | element ref | mount | backing store `width x height`, assigned once |
| `ctx` | 2D context | mount | `imageSmoothingEnabled = false`, `alpha: false` |
| `image` | `ImageData` | mount | `W * H * 4` bytes, reused by every `render` |
| `pixels32` | `Uint32Array` | mount | view over `image.data.buffer` |
| `cssWidth`, `cssHeight` | `number` ($state) | updated by `ResizeObserver` | canvas CSS extent from the fit scale; `0` means hidden |
| `scale` | derived `number` | updated with the above | `min(containerWidth / W, containerHeight / H)` |
| `windowing` | `boolean` | per drag | true from middle `pointerdown` to `pointerup`/`pointercancel` |
| `lastX`, `lastY` | `number` | per drag | previous windowing sample in grid space |

## Pure functions

- `fitScale(containerWidth, containerHeight, gridWidth, gridHeight): number` returns `min(cw / gw, ch / gh)`.
- `toGrid(offset, cssExtent, gridExtent): number` returns `clamp(offset * gridExtent / cssExtent, 0, gridExtent)`.
- `expandGrayscale(source: Uint8Array | Uint8ClampedArray, target32: Uint32Array): void` writes `0xff000000 | v * 0x010101` for each index of `target32`.

## Validation rules

| Rule | Where | Failure |
|---|---|---|
| `width`, `height` positive integers | mount | `ViewportError('invalid-grid')` |
| 2D context obtained | mount | `ViewportError('canvas-unavailable')` |
| `frame.width === width`, `frame.height === height`, `frame.data.length === width * height` | `render` | `ViewportError('invalid-frame')` (canvas unchanged) |

## State transitions

```text
Pointer routing (per canvas):

  idle ──pointerdown(button 1)──▶ windowing   [capture, preventDefault, lastX/Y = sample]
  windowing ──pointermove──▶ windowing        [onwindow({x,y,dx,dy}), update lastX/Y]
  windowing ──pointerup / pointercancel──▶ idle   [release capture]

  idle ──pointerdown/move/up (primary, not middle)──▶ idle   [onpointer({x,y,buttons})]
  any non-primary pointer ──▶ ignored
```

```text
Layout:  container size ──ResizeObserver──▶ scale ──▶ canvas CSS size
         (backing store width/height never changes)
```

## Relationships

- Input: `GrayscaleImage` from `tick(engine, t)` (engine → UI, one way).
- Output: `PointerPayload` toward a consumer that builds kinematic tracks; `WindowPayload` toward a consumer that calls `setWindowLevel`.
- The core never imports this module; this module imports only the `GrayscaleImage` type.
