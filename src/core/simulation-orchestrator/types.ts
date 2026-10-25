import type { CompositorState } from '../compositor-core'
import type { CaptureTarget, CaptureTargetConfig } from '../frame-capture'
import type { RendererState } from '../headless-renderer'
import type { GrayscaleImage } from '../image-loader'
import type { KinematicState } from '../kinematic-controller'
import type { NoiseOptions, NoiseState } from '../noise-controller'
import type { TemporalState } from '../temporal-controller'

export type EngineOptions = {
  width: number
  height: number
  maxLayers: number
  maxTracks?: number // Defaults to maxLayers
  maxKeyframes?: number // Defaults to 16
  viewportWidth?: number // Defaults to width
  viewportHeight?: number // Defaults to height
  noise?: NoiseOptions
  captureTargets?: CaptureTargetConfig[] // Defaults to none
}

export type EngineState = {
  compositor: CompositorState
  temporal: TemporalState
  kinematic: KinematicState
  noise: NoiseState
  renderer: RendererState
  // width * height bytes; holds the previous tick's final frame
  previousFrame: Uint8ClampedArray
  // Same order as the options; assigned once and never replaced
  captureTargets: CaptureTarget[]
}

export type SimulationErrorReason = 'invalid-time'

export class SimulationError extends Error {
  readonly reason: SimulationErrorReason

  constructor(reason: SimulationErrorReason, message: string) {
    super(message)
    this.name = 'SimulationError'
    this.reason = reason
  }
}

export type { GrayscaleImage }