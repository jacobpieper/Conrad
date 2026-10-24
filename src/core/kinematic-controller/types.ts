import type { CompositorState, LayerId } from '../compositor-core'

export type TrackId = number

export type InterpolationMode = 'linear' | 'cubic' | 'parametric'

export type KeyframeMotion = {
  mode: 'linear' | 'cubic'
  times: ArrayLike<number>
  x: ArrayLike<number>
  y: ArrayLike<number>
}

export type ParametricMotion = {
  mode: 'parametric'
  centerX: number
  centerY: number
  amplitudeX: number
  amplitudeY: number
  periodMs: number
  phaseMs: number
  exponent: number
}

export type MotionTrack = KeyframeMotion | ParametricMotion

export type KinematicState = {
  compositor: CompositorState
  maxTracks: number
  maxKeyframes: number
  trackLayer: Int32Array
  trackMode: Uint8Array
  trackLength: Int32Array
  times: Float64Array
  xs: Float64Array
  ys: Float64Array
  params: Float64Array
}

export const maxOffsetMagnitude = 16_777_216
export const modeLinear = 0
export const modeCubic = 1
export const modeParametric = 2
export const paramStride = 7

export type KinematicErrorReason =
  | 'invalid-dimensions'
  | 'invalid-motion'
  | 'unknown-layer'
  | 'layer-already-driven'
  | 'capacity-exceeded'
  | 'unknown-track'
  | 'invalid-time'

export class KinematicError extends Error {
  readonly reason: KinematicErrorReason

  constructor(reason: KinematicErrorReason, message: string) {
    super(message)
    this.name = 'KinematicError'
    this.reason = reason
  }
}

export type { CompositorState, LayerId }
