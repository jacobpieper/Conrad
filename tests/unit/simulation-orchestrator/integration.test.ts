import { afterEach, describe, expect, it } from 'vitest'
import { compose, createCompositor, registerLayer } from '../../../src/core/compositor-core'
import { destroyEngine, createEngine, tick } from '../../../src/core/simulation-orchestrator'
import { createKinematicController, addMotionTrack, evaluateMotion } from '../../../src/core/kinematic-controller'
import { createNoiseController, processFrame } from '../../../src/core/noise-controller'
import { addTrack, createTemporalController, evaluate } from '../../../src/core/temporal-controller'
import { readSurface } from '../../../src/core/headless-renderer'
import type { EngineState } from '../../../src/core/simulation-orchestrator'

const engines: EngineState[] = []

async function makeEngine(): Promise<EngineState> {
  const engine = await createEngine({
    width: 16,
    height: 16,
    maxLayers: 4,
    noise: { window: 200, level: 128, dose: 1000, seed: 1 }
  })
  engines.push(engine)
  return engine
}

function configureLayers(compositor: ReturnType<typeof createCompositor>, temporal: ReturnType<typeof createTemporalController>, kinematic: ReturnType<typeof createKinematicController>): Uint8Array[] {
  const patterns: Uint8Array[] = []
  const multipliers = [3, 5, 7, 11]
  for (let layer = 0; layer < 4; layer++) {
    const pixels = new Uint8Array(16 * 16)
    const multiplier = multipliers[layer] ?? 1
    for (let index = 0; index < pixels.length; index++) pixels[index] = (index * multiplier) & 255
    const layerId = registerLayer(compositor, pixels, 1)
    addTrack(temporal, layerId, [0, 1000], [0, 1])
    addMotionTrack(kinematic, layerId, {
      mode: 'linear',
      times: [0, 1000],
      x: [0, 3],
      y: [0, -2]
    })
    patterns.push(pixels)
  }
  return patterns
}

describe('simulation orchestrator integration', () => {
  afterEach(() => {
    for (let index = 0; index < engines.length; index++) {
      const engine = engines[index]
      if (engine !== undefined) destroyEngine(engine)
    }
    engines.length = 0
  })

  it('matches independently sequenced real pipeline stages across frames', async () => {
    const engine = await makeEngine()
    const engineLayers = configureLayers(engine.compositor, engine.temporal, engine.kinematic)
    const engineLayerCopies = engineLayers.map((pixels) => Uint8Array.from(pixels))

    const compositor = createCompositor(16, 16, 4)
    const temporal = createTemporalController(compositor, 4, 16)
    const kinematic = createKinematicController(compositor, 4, 16)
    const noise = createNoiseController(16, 16, {
      window: 200,
      level: 128,
      dose: 1000,
      seed: 1
    })
    const referenceLayers = configureLayers(compositor, temporal, kinematic)
    const referenceLayerCopies = referenceLayers.map((pixels) => Uint8Array.from(pixels))

    for (const timeMs of [250, 500, 750]) {
      evaluate(temporal, timeMs)
      evaluateMotion(kinematic, timeMs)
      const composed = compose(compositor)
      const expected = processFrame(noise, composed)
      const actual = tick(engine, timeMs)
      expect(actual.data).toEqual(expected.data)

      const surface = new Uint8Array(16 * 16 * 4)
      await readSurface(engine.renderer, surface)
      for (let index = 0; index < actual.data.length; index++) {
        const offset = index * 4
        expect(surface[offset]).toBe(actual.data[index])
        expect(surface[offset + 1]).toBe(actual.data[index])
        expect(surface[offset + 2]).toBe(actual.data[index])
        expect(surface[offset + 3]).toBe(255)
      }
    }

    for (let index = 0; index < engineLayers.length; index++) {
      expect(engineLayers[index]).toBe(engine.compositor.layers[index])
      expect(engineLayers[index]).toEqual(engineLayerCopies[index])
      expect(referenceLayers[index]).toEqual(referenceLayerCopies[index])
    }
  })
})
