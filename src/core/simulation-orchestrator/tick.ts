import { compose } from '../compositor-core'
import { updateBuffer } from '../headless-renderer'
import { evaluateMotion } from '../kinematic-controller'
import { processFrame } from '../noise-controller'
import { evaluate } from '../temporal-controller'
import { SimulationError } from './types'
import type { EngineState, GrayscaleImage } from './types'

export function tick(engine: EngineState, timeMs: number): GrayscaleImage {
  if (!Number.isFinite(timeMs)) {
    throw new SimulationError('invalid-time', 'timeMs must be a finite number')
  }

  evaluate(engine.temporal, timeMs)
  evaluateMotion(engine.kinematic, timeMs)
  const composed = compose(engine.compositor)
  const processed = processFrame(engine.noise, composed)
  updateBuffer(engine.renderer, processed)
  engine.previousFrame.set(processed.data)
  return processed
}