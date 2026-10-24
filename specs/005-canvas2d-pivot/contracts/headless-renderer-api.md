# Contract: Headless Renderer API (Canvas 2D)

Supersedes the mechanism in [002 contract](../../002-headless-renderer/contracts/headless-renderer-api.md). Signatures are identical:

```ts
createRenderer(width: number, height: number): Promise<RendererState>
destroyRenderer(state: RendererState): void
updateBuffer(state: RendererState, image: GrayscaleImage): void
resize(state: RendererState, width: number, height: number): void
bindTarget(state: RendererState, canvas: HTMLCanvasElement | OffscreenCanvas): void
unbindTarget(state: RendererState): void
readSurface(state: RendererState, out: Uint8Array): Promise<void>
```

`createRenderer` and `readSurface` remain `Promise`-returning for contract stability even though the work is synchronous.

## Changed behavior

- `RendererError` reason `'webgpu-unavailable'` is now `'canvas-unavailable'` (thrown when a 2D context cannot be obtained, including a bound canvas already holding a different context type).
- `createRenderer`: creates the surface canvas and context, renders the blank frame.
- `updateBuffer`: validates, expands pixels into the pre-allocated RGBA `ImageData` (reallocated only on size change), `putImageData` to staging, contain-fit `drawImage` to the surface, present if bound. `image.data` is not retained or mutated.
- `resize`: no-op if unchanged; otherwise resizes the surface and any bound canvas and re-renders.
- `bindTarget`: sets canvas size to the viewport, obtains a `2d` context, presents immediately. Rebinding replaces the previous target.
- `unbindTarget`: drops the target; the surface keeps rendering.
- `readSurface`: `getImageData` on the surface into `out` (RGBA8, row-major, top-left); `invalid-output` on length mismatch.
- `destroyRenderer`: releases canvases and references; state is unusable afterwards.

## Guarantees

- Equal image and viewport sizes produce a byte-exact copy; other sizes are browser-bilinear contain-fit with background `16` letterboxing.
- Failed calls never partially mutate state; renderers share nothing.
- No DOM access other than `getContext('2d')` and setting `width`/`height` on a caller-supplied target.
