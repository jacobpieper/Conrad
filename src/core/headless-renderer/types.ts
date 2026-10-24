import type { GrayscaleImage } from '../image-loader'

export type Viewport = {
  width: number
  height: number
}

export type ImageState = {
  width: number
  height: number
  staging: OffscreenCanvas
  stagingContext: OffscreenCanvasRenderingContext2D
  pixels: ImageData
  pixels32: Uint32Array
}

export type TargetState = {
  canvas: HTMLCanvasElement | OffscreenCanvas
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}

export type RendererState = {
  viewport: Viewport
  surface: OffscreenCanvas
  surfaceContext: OffscreenCanvasRenderingContext2D
  image: ImageState | null
  target: TargetState | null
}

export type RendererErrorReason =
  | 'canvas-unavailable'
  | 'invalid-image'
  | 'invalid-viewport'
  | 'invalid-output'

export class RendererError extends Error {
  readonly reason: RendererErrorReason
  override readonly cause?: unknown

  constructor(reason: RendererErrorReason, message: string, cause?: unknown) {
    super(message)
    this.name = 'RendererError'
    this.reason = reason
    if (cause !== undefined) this.cause = cause
  }
}

export type { GrayscaleImage }
