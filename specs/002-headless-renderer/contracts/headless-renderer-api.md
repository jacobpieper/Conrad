# Contract: Headless Renderer API

Public exports of `src/core/headless-renderer/index.ts`. All functions take the renderer state explicitly (no module-level state). Types are defined in [../data-model.md](../data-model.md).

```ts
import type { GrayscaleImage } from '../image-loader'

type RendererErrorReason =
  | 'webgpu-unavailable' // no adapter / device request failed
  | 'invalid-image'      // bad dimensions or data.length mismatch
  | 'invalid-viewport'   // non-positive / non-integer / over device limit
  | 'invalid-output'     // readSurface `out` has wrong length

class RendererError extends Error {
  readonly reason: RendererErrorReason
  override readonly cause?: unknown
}

type RendererState // opaque to callers; plain record

createRenderer(width: number, height: number): Promise<RendererState>
destroyRenderer(state: RendererState): void

updateBuffer(state: RendererState, image: GrayscaleImage): void
resize(state: RendererState, width: number, height: number): void
bindTarget(state: RendererState, canvas: HTMLCanvasElement | OffscreenCanvas): void
unbindTarget(state: RendererState): void

readSurface(state: RendererState, out: Uint8Array): Promise<void>
```

## Behavior

### `createRenderer(width, height)`
- Requests adapter and device, compiles the WGSL shader, creates the pipeline, uniform buffer, surface, and readback buffer. All internal.
- Renders a blank (background) frame so `readSurface` is valid immediately.
- Throws `RendererError('webgpu-unavailable')` if no adapter/device; `'invalid-viewport'` for bad size.

### `updateBuffer(state, image)`
- Validates, uploads `image.data` with `queue.writeBuffer`, reuses the GPU buffer when the padded byte size is unchanged, otherwise recreates it and its bind group, then renders and presents (if bound).
- Throws `RendererError('invalid-image')` before any mutation on invalid input. Previous image stays active.
- Does not retain or mutate `image.data`; the caller may reuse or transfer it afterwards.

### `resize(state, width, height)`
- Validates; no-op if the size is unchanged. Otherwise recreates the surface and readback buffer, re-renders the current image (or blank), and sets bound canvas `width`/`height`.
- Designed to be called from an external `ResizeObserver` callback with integer physical pixel dimensions (caller handles `devicePixelRatio`).
- Throws `RendererError('invalid-viewport')` and leaves state unchanged on invalid input.

### `bindTarget(state, canvas)`
- Obtains the canvas's `webgpu` context, configures it (`device`, `rgba8unorm`, `alphaMode: 'opaque'`, `COPY_DST | RENDER_ATTACHMENT`), sets canvas size to the viewport, and presents the current frame immediately.
- Binding while already bound unconfigures the previous target first; the old canvas is no longer updated.

### `unbindTarget(state)`
- Unconfigures the context and clears the target. Rendering to the internal surface continues. No-op if unbound.

### `readSurface(state, out)`
- Copies the current surface to `out` as tightly packed RGBA8, row-major, top-left origin; `out.length` must equal `viewport.width * viewport.height * 4`. Mapping is internal. Resolves after the GPU work completes.
- Throws `RendererError('invalid-output')` on length mismatch.

### `destroyRenderer(state)`
- Destroys all GPU resources and the device. State must not be used afterwards.

## Guarantees

- No DOM access other than `canvas.getContext('webgpu')` and setting `canvas.width/height` on a caller-supplied target.
- Every successful mutating call leaves the surface (and bound target) showing the latest state when the call returns (the GPU work is queued; `readSurface` observes it in order).
- Failed calls never partially mutate state (FR-013).
- Multiple `RendererState` instances share nothing (FR-014).

## Explicitly not provided

Zoom, pan, rotate, windowing/leveling, overlays, multi-image compositing, alternative fit modes, device-loss recovery, or any Svelte/UI component code.
