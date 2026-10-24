import { createCompositor } from '../compositor-core'
import { createRenderer, destroyRenderer } from '../headless-renderer'
import { createNoiseController } from '../noise-controller'
import { createTemporalController } from '../temporal-controller'
import { createKinematicController } from '../kinematic-controller'
import type { EngineOptions, EngineState } from './types'

const defaultMaxKeyframes = 16

export async function createEngine(options: EngineOptions): Promise<EngineState> {
  const compositor = createCompositor(options.width, options.height, options.maxLayers)
  const maxTracks = options.maxTracks ?? options.maxLayers
  const maxKeyframes = options.maxKeyframes ?? defaultMaxKeyframes
  const temporal = createTemporalController(compositor, maxTracks, maxKeyframes)
  const kinematic = createKinematicController(compositor, maxTracks, maxKeyframes)
  const noise = createNoiseController(options.width, options.height, options.noise)
  const renderer = await createRenderer(
    options.viewportWidth ?? options.width,
    options.viewportHeight ?? options.height
  )

  return { compositor, temporal, kinematic, noise, renderer }
}

export function destroyEngine(engine: EngineState): void {
  destroyRenderer(engine.renderer)
}