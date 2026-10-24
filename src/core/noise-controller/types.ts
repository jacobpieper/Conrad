import type { GrayscaleImage } from '../image-loader'

export type NoiseOptions = {
  window?: number
  level?: number
  dose?: number
  seed?: number
}

export type NoiseState = {
  width: number
  height: number
  pixelCount: number
  window: number
  level: number
  dose: number
  windowTable: Uint8ClampedArray
  sigmaTable: Float32Array
  rng: Uint32Array
  output: GrayscaleImage
}

export type NoiseErrorReason =
  | 'invalid-dimensions'
  | 'invalid-window-level'
  | 'invalid-dose'
  | 'invalid-seed'
  | 'invalid-image'

export class NoiseError extends Error {
  readonly reason: NoiseErrorReason

  constructor(reason: NoiseErrorReason, message: string) {
    super(message)
    this.name = 'NoiseError'
    this.reason = reason
  }
}

export type { GrayscaleImage }
