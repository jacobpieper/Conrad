import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerLayer } from '../../../src/core/compositor-core'
import { addMotionTrack } from '../../../src/core/kinematic-controller'
import { addTrack } from '../../../src/core/temporal-controller'
import { createEngine, destroyEngine, tick } from '../../../src/core/simulation-orchestrator'
import type { EngineState } from '../../../src/core/simulation-orchestrator'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

function usedHeap(): number {
  return (performance as MemoryPerformance).memory.usedJSHeapSize
}

function maxHeapGrowth(run: () => void, rounds = 3, iterations = 100): number {
  let growth = 0
  for (let round = 0; round < rounds; round++) {
    const before = usedHeap()
    for (let iteration = 0; iteration < iterations; iteration++) run()
    growth = Math.max(growth, usedHeap() - before)
  }
  return growth
}

describe('simulation orchestrator tick benchmark', () => {
  let engine: EngineState

  beforeAll(async () => {
    engine = await createEngine({
      width: 512,
      height: 512,
      maxLayers: 4,
      noise: { dose: 1000, window: 200, level: 128, seed: 1 }
    })
    const multipliers = [3, 5, 7, 11]
    for (let layer = 0; layer < 4; layer++) {
      const pixels = new Uint8Array(512 * 512)
      const multiplier = multipliers[layer] ?? 1
      for (let index = 0; index < pixels.length; index++) pixels[index] = (index * multiplier) & 255
      const layerId = registerLayer(engine.compositor, pixels, 1)
      addTrack(engine.temporal, layerId, [0, 1000], [0, 1])
      addMotionTrack(engine.kinematic, layerId, {
        mode: 'linear',
        times: [0, 1000],
        x: [0, 3],
        y: [0, -2]
      })
    }
    tick(engine, 0)
  })

  afterAll(() => {
    destroyEngine(engine)
  })

  it('copies a 512x512 frame with set in under 0.1ms', () => {
    const source = new Uint8ClampedArray(512 * 512)
    const destination = new Uint8ClampedArray(512 * 512)
    for (let iteration = 0; iteration < 100; iteration++) destination.set(source)

    const iterations = 1000
    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) destination.set(source)
    const perCopy = (performance.now() - start) / iterations

    expect(destination.length).toBe(source.length)
    expect(perCopy).toBeLessThan(0.1)
    console.info(`512x512 Uint8ClampedArray.set: ${perCopy.toFixed(4)}ms per copy`)
  })

  it('ticks a noisy 512x512 frame within the time budget', () => {
    for (let iteration = 0; iteration < 50; iteration++) tick(engine, (iteration * 50) % 1001)
    const iterations = 100
    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) {
      tick(engine, (iteration * 50) % 1001)
    }
    const perTick = (performance.now() - start) / iterations
    let mismatches = 0
    for (let index = 0; index < engine.previousFrame.length; index++) {
      if (engine.previousFrame[index] !== engine.noise.output.data[index]) mismatches++
    }

    expect(mismatches).toBe(0)
    // Isolated warmed ticks measured 3.37ms; 5ms leaves headroom for slower CI machines.
    expect(perTick).toBeLessThan(5)
  })

  it('keeps heap growth bounded across repeated ticks', () => {
    for (let iteration = 0; iteration < 50; iteration++) tick(engine, iteration * 10)

    const allocatingControl = maxHeapGrowth(() => {
      tick(engine, 500)
      new Array(1000).fill(0)
    })
    const tickGrowth = maxHeapGrowth(() => tick(engine, 500))

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(tickGrowth).toBeLessThan(100_000)
  })

  it('returns stable image and engine state references', () => {
    const output = tick(engine, 250)
    const data = output.data
    const compositor = engine.compositor
    const temporal = engine.temporal
    const kinematic = engine.kinematic
    const noise = engine.noise
    const renderer = engine.renderer
    const previousFrame = engine.previousFrame

    for (let iteration = 0; iteration < 20; iteration++) {
      expect(tick(engine, iteration * 25)).toBe(output)
      expect(output.data).toBe(data)
      expect(engine.compositor).toBe(compositor)
      expect(engine.temporal).toBe(temporal)
      expect(engine.kinematic).toBe(kinematic)
      expect(engine.noise).toBe(noise)
      expect(engine.renderer).toBe(renderer)
      expect(engine.previousFrame).toBe(previousFrame)
    }
  })
})
