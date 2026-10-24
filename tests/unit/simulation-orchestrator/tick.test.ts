import { afterEach, describe, expect, it } from 'vitest'
import { compose, registerLayer, setLayerOffset } from '../../../src/core/compositor-core'
import { bindTarget, readSurface } from '../../../src/core/headless-renderer'
import { addMotionTrack } from '../../../src/core/kinematic-controller'
import { createNoiseController, processFrame, reseed, setDose, setWindowLevel } from '../../../src/core/noise-controller'
import { addTrack as addTemporalTrack } from '../../../src/core/temporal-controller'
import { createEngine, destroyEngine, SimulationError, tick } from '../../../src/core/simulation-orchestrator'
import type { EngineState } from '../../../src/core/simulation-orchestrator'

const engines: EngineState[] = []

async function makeEngine(maxLayers = 2): Promise<EngineState> {
  const engine = await createEngine({ width: 4, height: 1, maxLayers })
  engines.push(engine)
  return engine
}

describe('simulation orchestrator tick', () => {
  afterEach(() => {
    for (let index = 0; index < engines.length; index++) {
      const engine = engines[index]
      if (engine !== undefined) destroyEngine(engine)
    }
    engines.length = 0
  })

  it('composes, processes, renders, and returns the reusable output', async () => {
    const engine = await makeEngine(1)
    const pixels = Uint8Array.from([0, 100, 200, 250])
    registerLayer(engine.compositor, pixels, 1)

    const first = tick(engine, 0)
    const data = first.data
    const rendered = new Uint8Array(16)
    await readSurface(engine.renderer, rendered)

    expect(Array.from(first.data)).toEqual([0, 100, 200, 250])
    expect(first).toBe(engine.noise.output)
    expect(rendered).toEqual(Uint8Array.from([
      0, 0, 0, 255,
      100, 100, 100, 255,
      200, 200, 200, 255,
      250, 250, 250, 255
    ]))
    expect(tick(engine, 0)).toBe(first)
    expect(first.data).toBe(data)
  })

  it('evaluates temporal and kinematic tracks at the same global time', async () => {
    const engine = await makeEngine(1)
    const layerId = registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addTemporalTrack(engine.temporal, layerId, [0, 1000], [0, 1])
    addMotionTrack(engine.kinematic, layerId, {
      mode: 'linear',
      times: [0, 1000],
      x: [0, 1],
      y: [0, 0]
    })

    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 0, 0])
    expect(Array.from(tick(engine, 500).data)).toEqual([0, 0, 50, 100])
    expect(Array.from(tick(engine, 1000).data)).toEqual([0, 0, 100, 200])
    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 0, 0])
  })

  it('preserves undriven layer settings and emits zero with no layers', async () => {
    const empty = await makeEngine(1)
    expect(Array.from(tick(empty, 25).data)).toEqual([0, 0, 0, 0])

    const engine = await makeEngine(2)
    const drivenId = registerLayer(engine.compositor, Uint8Array.from([10, 20, 30, 40]), 1)
    const undrivenId = registerLayer(engine.compositor, Uint8Array.from([1, 2, 3, 4]), 0.5)
    setLayerOffset(engine.compositor, undrivenId, 1, 0)
    addTemporalTrack(engine.temporal, drivenId, [0, 100], [0, 1])

    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 1, 2])
    expect(engine.compositor.weights[undrivenId]).toBe(0.5)
    expect(engine.compositor.offsetsX[undrivenId]).toBe(1)
  })

  it('is deterministic when scrubbing with noise disabled', async () => {
    const engine = await makeEngine(1)
    const layerId = registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addTemporalTrack(engine.temporal, layerId, [0, 1000], [0, 1])

    const at500 = Array.from(tick(engine, 500).data)
    expect(Array.from(tick(engine, 1000).data)).toEqual([0, 100, 200, 250])
    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 0, 0])
    expect(Array.from(tick(engine, 500).data)).toEqual(at500)
  })

  it('rejects invalid time before mutating controller or output state', async () => {
    const engine = await makeEngine(1)
    const layerId = registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addTemporalTrack(engine.temporal, layerId, [0, 1000], [0, 1])
    addMotionTrack(engine.kinematic, layerId, {
      mode: 'linear',
      times: [0, 1000],
      x: [0, 2],
      y: [0, 0]
    })
    tick(engine, 500)
    const weights = Array.from(engine.compositor.weights)
    const offsetsX = Array.from(engine.compositor.offsetsX)
    const offsetsY = Array.from(engine.compositor.offsetsY)
    const output = Array.from(engine.noise.output.data)

    for (const timeMs of [NaN, Infinity, -Infinity]) {
      let thrown: unknown
      try {
        tick(engine, timeMs)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(SimulationError)
      expect(thrown).toMatchObject({ reason: 'invalid-time' })
      expect(Array.from(engine.compositor.weights)).toEqual(weights)
      expect(Array.from(engine.compositor.offsetsX)).toEqual(offsetsX)
      expect(Array.from(engine.compositor.offsetsY)).toEqual(offsetsY)
      expect(Array.from(engine.noise.output.data)).toEqual(output)
    }
  })

  it('uses noise settings and presents the frame to a bound target', async () => {
    const engine = await makeEngine(1)
    const pixels = Uint8Array.from([20, 80, 140, 220])
    registerLayer(engine.compositor, pixels, 1)
    setWindowLevel(engine.noise, 100, 100)
    setDose(engine.noise, 500)
    reseed(engine.noise, 2024)
    compose(engine.compositor)
    const expected = Array.from(
      processFrame(
        createNoiseController(4, 1, { window: 100, level: 100, dose: 500, seed: 2024 }),
        engine.compositor.output
      ).data
    )

    const target = new OffscreenCanvas(4, 1)
    bindTarget(engine.renderer, target)
    expect(Array.from(tick(engine, 0).data)).toEqual(expected)
    const context = target.getContext('2d')
    expect(context).not.toBeNull()
    const targetPixels = context?.getImageData(0, 0, 4, 1).data
    expect(targetPixels).toBeDefined()
    for (let index = 0; index < expected.length; index++) {
      const offset = index * 4
      expect(targetPixels?.[offset]).toBe(expected[index])
      expect(targetPixels?.[offset + 1]).toBe(expected[index])
      expect(targetPixels?.[offset + 2]).toBe(expected[index])
      expect(targetPixels?.[offset + 3]).toBe(255)
    }
  })
})
