import type { GrayscaleImage } from '../image-loader'

export type LayerPixels = Uint8Array | Uint8ClampedArray

export type LayerId = number

export type CompositorState = {
  width: number
  height: number
  pixelCount: number
  maxLayers: number
  layers: (LayerPixels | null)[]
  weights: Float32Array
  active: Uint8Array
  accumulator: Float32Array
  output: GrayscaleImage
}

export type CompositorErrorReason =
  | 'invalid-dimensions'
  | 'invalid-layer'
  | 'invalid-weight'
  | 'capacity-exceeded'
  | 'unknown-layer'

export class CompositorError extends Error {
  readonly reason: CompositorErrorReason

  constructor(reason: CompositorErrorReason, message: string) {
    super(message)
    this.name = 'CompositorError'
    this.reason = reason
  }
}

export type { GrayscaleImage }
