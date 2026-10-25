import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompositorError } from '../../../src/core/compositor-core'
import { CaptureError } from '../../../src/core/frame-capture'
import { RendererError } from '../../../src/core/headless-renderer'
import { NoiseError } from '../../../src/core/noise-controller'
import { TemporalError } from '../../../src/core/temporal-controller'
import type { EngineState } from '../../../src/core/simulation-orchestrator'
import { createEngine, destroyEngine } from '../../../src/core/simulation-orchestrator'

const engines: EngineState[] = []
const OriginalOffscreenCanvas = OffscreenCanvas
let canvasConstructions = 0

async function makeEngine(options: Parameters<typeof createEngine>[0]): Promise<EngineState> {
  const engine = await createEngine(options)
  engines.push(engine)
  return engine
}

describe('simulation orchestrator engine', () => {
  afterEach(() => {
    for (let index = 0; index < engines.length; index++) {
      const engine = engines[index]
      if (engine !== undefined) destroyEngine(engine)
    }
    engines.length = 0
    vi.unstubAllGlobals()
    canvasConstructions = 0
  })

  it('creates independently wired engine state with defaults', async () => {
    const engine = await makeEngine({ width: 4, height: 2, maxLayers: 3 })

    expect(engine.compositor.maxLayers).toBe(3)
    expect(engine.temporal.compositor).toBe(engine.compositor)
    expect(engine.kinematic.compositor).toBe(engine.compositor)
    expect(engine.temporal.maxTracks).toBe(3)
    expect(engine.kinematic.maxTracks).toBe(3)
    expect(engine.temporal.maxKeyframes).toBe(16)
    expect(engine.kinematic.maxKeyframes).toBe(16)
    expect(engine.noise.width).toBe(4)
    expect(engine.noise.height).toBe(2)
    expect(engine.noise.pixelCount).toBe(8)
    expect(engine.previousFrame).toBeInstanceOf(Uint8ClampedArray)
    expect(engine.previousFrame.length).toBe(engine.noise.pixelCount)
    expect(Array.from(engine.previousFrame)).toEqual(new Array(8).fill(0))
    expect(engine.previousFrame).not.toBe(engine.noise.output.data)
    expect(engine.captureTargets).toEqual([])
    expect(engine.renderer.viewport).toEqual({ width: 4, height: 2 })
  })

  it('pre-allocates independent capture targets at image resolution', async () => {
    const engine = await makeEngine({
      width: 3,
      height: 2,
      maxLayers: 2,
      viewportWidth: 8,
      viewportHeight: 6,
      captureTargets: [
        { id: 'first', maxCapacity: 4, mode: 'stop' },
        { id: 'second', maxCapacity: 2, mode: 'loop' }
      ]
    })

    expect(engine.captureTargets.map(target => target.id)).toEqual(['first', 'second'])
    expect(engine.captureTargets[0]?.buffer).toBeInstanceOf(Uint8ClampedArray)
    expect(engine.captureTargets[0]?.buffer.length).toBe(24)
    expect(engine.captureTargets[1]?.buffer.length).toBe(12)
    expect(engine.captureTargets[0]?.buffer).not.toBe(engine.captureTargets[1]?.buffer)
    expect(engine.captureTargets[0]?.buffer).not.toBe(engine.noise.output.data)
    expect(engine.captureTargets[0]?.buffer).not.toBe(engine.previousFrame)
    expect(engine.captureTargets[0]).toMatchObject({
      isRecording: true,
      headIndex: 0,
      totalFramesRecorded: 0
    })
    expect(engine.renderer.viewport).toEqual({ width: 8, height: 6 })
  })

  it('uses supplied capacities, viewport, and noise options', async () => {
    const engine = await makeEngine({
      width: 4,
      height: 2,
      maxLayers: 3,
      maxTracks: 2,
      maxKeyframes: 5,
      viewportWidth: 8,
      viewportHeight: 6,
      noise: { window: 100, level: 90, dose: 500, seed: 7 }
    })

    expect(engine.temporal.maxTracks).toBe(2)
    expect(engine.kinematic.maxTracks).toBe(2)
    expect(engine.temporal.maxKeyframes).toBe(5)
    expect(engine.kinematic.maxKeyframes).toBe(5)
    expect(engine.renderer.viewport).toEqual({ width: 8, height: 6 })
    expect(engine.previousFrame.length).toBe(8)
    expect(engine.noise.window).toBe(100)
    expect(engine.noise.level).toBe(90)
    expect(engine.noise.dose).toBe(500)
    expect(engine.noise.rng[0]).toBe(7)
  })

  it('does not share state between engines', async () => {
    const first = await makeEngine({ width: 2, height: 1, maxLayers: 1 })
    const second = await makeEngine({ width: 2, height: 1, maxLayers: 1 })

    expect(first.compositor).not.toBe(second.compositor)
    expect(first.temporal).not.toBe(second.temporal)
    expect(first.kinematic).not.toBe(second.kinematic)
    expect(first.noise).not.toBe(second.noise)
    expect(first.renderer).not.toBe(second.renderer)
    expect(first.previousFrame).not.toBe(second.previousFrame)
  })

  it('creates only the renderer surface and destroys its resources', async () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class extends OriginalOffscreenCanvas {
        constructor(width: number, height: number) {
          super(width, height)
          canvasConstructions++
        }
      }
    )

    const engine = await createEngine({ width: 4, height: 2, maxLayers: 1 })
    expect(canvasConstructions).toBe(1)

    destroyEngine(engine)
    expect(engine.renderer.surface.width).toBe(0)
    expect(engine.renderer.image).toBeNull()
  })

  it('validates all synchronous options before creating a canvas', async () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class extends OriginalOffscreenCanvas {
        constructor(width: number, height: number) {
          super(width, height)
          canvasConstructions++
        }
      }
    )

    const base = { width: 4, height: 2, maxLayers: 2 }

    await expect(createEngine({ ...base, width: 0 })).rejects.toBeInstanceOf(CompositorError)
    await expect(createEngine({ ...base, width: 0 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, width: -1 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, width: 1.5 })).rejects.toBeInstanceOf(CompositorError)
    await expect(createEngine({ ...base, width: 1.5 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, height: 0 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, height: -1 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, height: 1.5 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, maxLayers: 0 })).rejects.toBeInstanceOf(CompositorError)
    await expect(createEngine({ ...base, maxLayers: 0 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, maxTracks: 0 })).rejects.toBeInstanceOf(TemporalError)
    await expect(createEngine({ ...base, maxTracks: 0 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, maxKeyframes: 0 })).rejects.toBeInstanceOf(TemporalError)
    await expect(createEngine({ ...base, maxKeyframes: 0 })).rejects.toMatchObject({ reason: 'invalid-dimensions' })
    await expect(createEngine({ ...base, noise: { dose: -1 } })).rejects.toBeInstanceOf(NoiseError)
    await expect(createEngine({ ...base, noise: { dose: -1 } })).rejects.toMatchObject({ reason: 'invalid-dose' })
    await expect(createEngine({ ...base, viewportWidth: 0 })).rejects.toBeInstanceOf(RendererError)
    await expect(createEngine({ ...base, viewportWidth: 0 })).rejects.toMatchObject({ reason: 'invalid-viewport' })
    await expect(createEngine({ ...base, captureTargets: [
      { id: '', maxCapacity: 1, mode: 'stop' }
    ] })).rejects.toBeInstanceOf(CaptureError)
    await expect(createEngine({ ...base, captureTargets: [
      { id: 'oversized', maxCapacity: Number.MAX_SAFE_INTEGER, mode: 'stop' }
    ] })).rejects.toBeInstanceOf(RangeError)

    expect(canvasConstructions).toBe(0)
  })
})
