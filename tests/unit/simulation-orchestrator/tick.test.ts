import { afterEach, describe, expect, it } from 'vitest'
import { compose, registerLayer, setLayerOffset } from '../../../src/core/compositor-core'
import { bindTarget, readSurface } from '../../../src/core/headless-renderer'
import { addMotionTrack } from '../../../src/core/kinematic-controller'
import { createNoiseController, processFrame, reseed, setDose, setWindowLevel } from '../../../src/core/noise-controller'
import { addTrack as addTemporalTrack } from '../../../src/core/temporal-controller'
import { createEngine, destroyEngine, SimulationError, tick } from '../../../src/core/simulation-orchestrator'
import type { EngineState } from '../../../src/core/simulation-orchestrator'

const engines: EngineState[] = []

async function makeEngine(
  maxLayers = 2,
  captureTargets?: Parameters<typeof createEngine>[0]['captureTargets']
): Promise<EngineState> {
  const engine = await createEngine({
    width: 4,
    height: 1,
    maxLayers,
    ...(captureTargets === undefined ? {} : { captureTargets })
  })
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
    const previousFrame = engine.previousFrame
    const rendered = new Uint8Array(16)
    await readSurface(engine.renderer, rendered)

    expect(Array.from(first.data)).toEqual([0, 100, 200, 250])
    expect(first).toBe(engine.noise.output)
    expect(engine.previousFrame).toBe(previousFrame)
    expect(Array.from(engine.previousFrame)).toEqual(Array.from(first.data))
    expect(rendered).toEqual(Uint8Array.from([
      0, 0, 0, 255,
      100, 100, 100, 255,
      200, 200, 200, 255,
      250, 250, 250, 255
    ]))
    expect(tick(engine, 0)).toBe(first)
    expect(first.data).toBe(data)
    expect(engine.previousFrame).toBe(previousFrame)
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

  it('evaluates a temporal track without a kinematic track', async () => {
    const engine = await makeEngine(1)
    const layerId = registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addTemporalTrack(engine.temporal, layerId, [0, 1000], [0, 1])
    const previousFrame = engine.previousFrame

    expect(Array.from(previousFrame)).toEqual([0, 0, 0, 0])
    expect(previousFrame).not.toBe(engine.noise.output.data)

    const first = tick(engine, 500)
    expect(Array.from(previousFrame)).toEqual([0, 50, 100, 125])
    expect(Array.from(previousFrame)).toEqual(Array.from(first.data))

    const previousSnapshot = Array.from(previousFrame)
    expect(previousSnapshot).toEqual([0, 50, 100, 125])
    expect(Array.from(tick(engine, 1000).data)).toEqual([0, 100, 200, 250])
    expect(Array.from(previousFrame)).toEqual([0, 100, 200, 250])
    expect(previousFrame).toBe(engine.previousFrame)
    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 0, 0])
    expect(Array.from(previousFrame)).toEqual([0, 0, 0, 0])
  })

  it('captures final frames into stop and loop targets', async () => {
    const engine = await makeEngine(1, [
      { id: 'first', maxCapacity: 2, mode: 'stop' },
      { id: 'last', maxCapacity: 2, mode: 'loop' }
    ])
    const layerId = registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addTemporalTrack(engine.temporal, layerId, [0, 1000], [0, 1])
    const stop = engine.captureTargets[0]
    const loop = engine.captureTargets[1]
    expect(stop).toBeDefined()
    expect(loop).toBeDefined()
    if (stop === undefined || loop === undefined) return

    tick(engine, 0)
    tick(engine, 500)
    tick(engine, 1000)

    expect(Array.from(stop.buffer)).toEqual([0, 0, 0, 0, 0, 50, 100, 125])
    expect(Array.from(stop.buffer.subarray(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(stop.buffer.subarray(4, 8))).toEqual([0, 50, 100, 125])
    expect(stop.headIndex).toBe(2)
    expect(stop.totalFramesRecorded).toBe(2)
    expect(stop.isRecording).toBe(false)

    expect(Array.from(loop.buffer.subarray(0, 4))).toEqual([0, 100, 200, 250])
    expect(Array.from(loop.buffer.subarray(4, 8))).toEqual([0, 50, 100, 125])
    expect(loop.headIndex).toBe(1)
    expect(loop.totalFramesRecorded).toBe(3)
    expect(loop.isRecording).toBe(true)
  })

  it('captures the final noisy and windowed frame', async () => {
    const engine = await makeEngine(1, [
      { id: 'final-output', maxCapacity: 2, mode: 'stop' }
    ])
    registerLayer(engine.compositor, Uint8Array.from([20, 80, 140, 220]), 1)
    setWindowLevel(engine.noise, 100, 100)
    setDose(engine.noise, 500)
    reseed(engine.noise, 2024)

    const result = tick(engine, 0)
    const target = engine.captureTargets[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    expect(Array.from(target.buffer.subarray(0, 4))).toEqual(Array.from(result.data))
    expect(Array.from(target.buffer.subarray(0, 4))).toEqual(Array.from(engine.previousFrame))
  })

  it('preserves outputs and stable capture identities across ticks', async () => {
    const withCapture = await makeEngine(1, [
      { id: 'stable', maxCapacity: 4, mode: 'loop' }
    ])
    const withoutCapture = await makeEngine(1)
    const pixels = Uint8Array.from([20, 80, 140, 220])
    const captureLayer = registerLayer(withCapture.compositor, pixels, 1)
    const plainLayer = registerLayer(withoutCapture.compositor, Uint8Array.from(pixels), 1)
    addTemporalTrack(withCapture.temporal, captureLayer, [0, 1000], [0, 1])
    addTemporalTrack(withoutCapture.temporal, plainLayer, [0, 1000], [0, 1])
    setDose(withCapture.noise, 500)
    setDose(withoutCapture.noise, 500)
    reseed(withCapture.noise, 2024)
    reseed(withoutCapture.noise, 2024)

    const targetList = withCapture.captureTargets
    const target = withCapture.captureTargets[0]
    expect(target).toBeDefined()
    if (target === undefined) return
    const buffer = target.buffer
    const capturedOutput = tick(withCapture, 500)
    const plainOutput = tick(withoutCapture, 500)
    expect(Array.from(capturedOutput.data)).toEqual(Array.from(plainOutput.data))
    expect(capturedOutput).toBe(withCapture.noise.output)
    expect(capturedOutput.data).not.toBe(buffer)

    const output = capturedOutput
    const outputData = capturedOutput.data
    for (const timeMs of [0, 1000, 500, 250]) {
      expect(tick(withCapture, timeMs)).toBe(output)
      expect(tick(withoutCapture, timeMs)).toBe(plainOutput)
      expect(Array.from(capturedOutput.data)).toEqual(Array.from(plainOutput.data))
      expect(capturedOutput.data).toBe(outputData)
      expect(withCapture.captureTargets).toBe(targetList)
      expect(withCapture.captureTargets[0]).toBe(target)
      expect(target.buffer).toBe(buffer)
    }
  })

  it('leaves capture targets unchanged for invalid time values', async () => {
    const engine = await makeEngine(1, [
      { id: 'loop', maxCapacity: 3, mode: 'loop' },
      { id: 'stop', maxCapacity: 4, mode: 'stop' }
    ])
    registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    tick(engine, 0)
    const snapshots = engine.captureTargets.map(target => ({
      bytes: Array.from(target.buffer),
      isRecording: target.isRecording,
      headIndex: target.headIndex,
      totalFramesRecorded: target.totalFramesRecorded
    }))

    for (const timeMs of [NaN, Infinity, -Infinity]) {
      expect(() => tick(engine, timeMs)).toThrowError(
        expect.objectContaining({ name: 'SimulationError', reason: 'invalid-time' })
      )
      for (let index = 0; index < engine.captureTargets.length; index++) {
        const target = engine.captureTargets[index]
        const snapshot = snapshots[index]
        expect(target).toBeDefined()
        expect(snapshot).toBeDefined()
        if (target === undefined || snapshot === undefined) continue
        expect(Array.from(target.buffer)).toEqual(snapshot.bytes)
        expect(target.isRecording).toBe(snapshot.isRecording)
        expect(target.headIndex).toBe(snapshot.headIndex)
        expect(target.totalFramesRecorded).toBe(snapshot.totalFramesRecorded)
      }
    }
  })

  it('pauses and resumes target recording through tick', async () => {
    const engine = await makeEngine(1, [
      { id: 'pausable', maxCapacity: 3, mode: 'stop' }
    ])
    registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    const target = engine.captureTargets[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    tick(engine, 0)
    target.isRecording = false
    tick(engine, 500)
    expect(Array.from(target.buffer)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(target.headIndex).toBe(1)
    expect(target.totalFramesRecorded).toBe(1)

    target.isRecording = true
    tick(engine, 1000)
    expect(Array.from(target.buffer.subarray(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(target.buffer.subarray(4, 8))).toEqual([0, 100, 200, 250])
    expect(target.headIndex).toBe(2)
    expect(target.totalFramesRecorded).toBe(2)
    expect(target.isRecording).toBe(true)
  })

  it('evaluates a kinematic track without a temporal track', async () => {
    const engine = await makeEngine(1)
    registerLayer(engine.compositor, Uint8Array.from([0, 100, 200, 250]), 1)
    addMotionTrack(engine.kinematic, 0, {
      mode: 'linear',
      times: [0, 1000],
      x: [0, 1],
      y: [0, 0]
    })

    expect(Array.from(tick(engine, 0).data)).toEqual([0, 100, 200, 250])
    expect(Array.from(tick(engine, 1000).data)).toEqual([0, 0, 100, 200])
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

  it('matches a fresh engine and separates clean from seeded noisy output', async () => {
    const engine = await makeEngine(1)
    const fresh = await makeEngine(1)
    const pixels = Uint8Array.from([20, 80, 140, 220])
    const engineLayer = registerLayer(engine.compositor, pixels, 1)
    const freshLayer = registerLayer(fresh.compositor, Uint8Array.from(pixels), 1)
    addTemporalTrack(engine.temporal, engineLayer, [0, 1000], [0, 1])
    addTemporalTrack(fresh.temporal, freshLayer, [0, 1000], [0, 1])

    expect(engine.compositor).not.toBe(fresh.compositor)
    expect(engine.temporal).not.toBe(fresh.temporal)
    expect(engine.noise).not.toBe(fresh.noise)
    expect(engine.renderer).not.toBe(fresh.renderer)
    expect(Array.from(tick(engine, 1000).data)).toEqual(Array.from(tick(fresh, 1000).data))
    expect(Array.from(tick(engine, 0).data)).toEqual(Array.from(tick(fresh, 0).data))
    const repeated = Array.from(tick(engine, 500).data)
    expect(Array.from(tick(engine, 500).data)).toEqual(repeated)

    const clean = await makeEngine(1)
    const noisy = await createEngine({ width: 4, height: 1, maxLayers: 1, noise: { dose: 500, seed: 2024 } })
    engines.push(noisy)
    registerLayer(clean.compositor, Uint8Array.from(pixels), 1)
    registerLayer(noisy.compositor, Uint8Array.from(pixels), 1)
    expect(Array.from(tick(noisy, 0).data)).not.toEqual(Array.from(tick(clean, 0).data))
  })

  it('applies window-level mapping independently with noise disabled', async () => {
    const engine = await makeEngine(1)
    registerLayer(engine.compositor, Uint8Array.from([0, 50, 100, 200]), 1)
    setWindowLevel(engine.noise, 100, 100)
    compose(engine.compositor)
    const expected = Array.from(
      processFrame(createNoiseController(4, 1, { window: 100, level: 100 }), engine.compositor.output).data
    )

    expect(Array.from(tick(engine, 0).data)).toEqual(expected)
  })

  it('applies a track registered after ticking without affecting another engine', async () => {
    const engine = await makeEngine(1)
    const other = await makeEngine(1)
    const pixels = Uint8Array.from([0, 100, 200, 250])
    const layerId = registerLayer(engine.compositor, pixels, 1)
    registerLayer(other.compositor, Uint8Array.from(pixels), 1)

    expect(Array.from(tick(engine, 0).data)).toEqual([0, 100, 200, 250])
    expect(Array.from(tick(other, 0).data)).toEqual([0, 100, 200, 250])
    addTemporalTrack(engine.temporal, layerId, [0, 100], [0, 1])

    expect(Array.from(tick(engine, 0).data)).toEqual([0, 0, 0, 0])
    expect(Array.from(tick(other, 0).data)).toEqual([0, 100, 200, 250])
    expect(engine.compositor).not.toBe(other.compositor)
    expect(engine.temporal).not.toBe(other.temporal)
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
    const previousFrame = Array.from(engine.previousFrame)

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
      expect(Array.from(engine.previousFrame)).toEqual(previousFrame)
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
    const processed = tick(engine, 0)
    expect(Array.from(processed.data)).toEqual(expected)
    expect(Array.from(engine.previousFrame)).toEqual(expected)
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
