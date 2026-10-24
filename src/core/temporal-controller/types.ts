import type { CompositorState, LayerId } from '../compositor-core'

export type TrackId = number

export type TemporalState = {
  compositor: CompositorState
  maxTracks: number
  maxKeyframes: number
  trackLayer: Int32Array
  trackLength: Int32Array
  times: Float64Array
  values: Float64Array
}

export type TemporalErrorReason =
  | 'invalid-dimensions'
  | 'invalid-keyframes'
  | 'unknown-layer'
  | 'layer-already-driven'
  | 'capacity-exceeded'
  | 'unknown-track'
  | 'invalid-time'

export class TemporalError extends Error {
  readonly reason: TemporalErrorReason

  constructor(reason: TemporalErrorReason, message: string) {
    super(message)
    this.name = 'TemporalError'
    this.reason = reason
  }
}

export type { CompositorState, LayerId }
