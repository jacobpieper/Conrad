export { createEngine, destroyEngine } from './engine'
export { CaptureError } from '../frame-capture'
export type {
  CaptureErrorReason,
  CaptureMode,
  CaptureTarget,
  CaptureTargetConfig
} from '../frame-capture'
export { tick } from './tick'
export { SimulationError } from './types'
export type {
  EngineOptions,
  EngineState,
  GrayscaleImage,
  SimulationErrorReason
} from './types'