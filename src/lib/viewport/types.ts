import type { GrayscaleImage } from '../../core/image-loader'

export type ViewportGrid = {
  width: number
  height: number
}

export type PointerPayload = {
  // Continuous grid coordinates, clamped to the grid; buttons is the live bitmask.
  x: number
  y: number
  buttons: number
}

export type WindowPayload = {
  // Grid-space deltas from the prior sample; the press position is the initial sample.
  x: number
  y: number
  dx: number
  dy: number
}

export const buttonPrimary = 1
export const buttonSecondary = 2
export const buttonMiddle = 4

export type ViewportErrorReason = 'invalid-grid' | 'invalid-frame' | 'canvas-unavailable'

export class ViewportError extends Error {
  readonly reason: ViewportErrorReason

  constructor(reason: ViewportErrorReason, message: string) {
    super(message)
    this.name = 'ViewportError'
    this.reason = reason
  }
}

export type { GrayscaleImage }
