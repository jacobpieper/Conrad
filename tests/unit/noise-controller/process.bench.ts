import { describe, expect, it } from 'vitest'
import { createNoiseController, processFrame } from '../../../src/core/noise-controller'
import type { GrayscaleImage, NoiseState } from '../../../src/core/noise-controller'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

const usedHeap = () => (performance as MemoryPerformance).memory.usedJSHeapSize

function maxHeapGrowth(run: () => void, rounds = 5, iterations = 200): number {
  let growth = 0
  for (let round = 0; round < rounds; round++) {
    const before = usedHeap()
    for (let iteration = 0; iteration < iterations; iteration++) run()
    growth = Math.max(growth, usedHeap() - before)
  }
  return growth
}

function setup(): { state: NoiseState; image: GrayscaleImage } {
  const state = createNoiseController(512, 512, { dose: 1000, window: 200, level: 128, seed: 1 })
  const image: GrayscaleImage = {
    width: 512,
    height: 512,
    data: Uint8ClampedArray.from({ length: 512 * 512 }, (_, index) => (index * 7) & 255)
  }
  processFrame(state, image)
  return { state, image }
}

describe('processFrame benchmark', () => {
  it('processes a 512x512 frame with noise within the time budget', () => {
    const { state, image } = setup()
    const iterations = 20

    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) processFrame(state, image)
    const perFrame = (performance.now() - start) / iterations
    // Measured ~1.0ms per frame; 5ms leaves headroom for slower CI machines.
    expect(perFrame).toBeLessThan(5)
  })

  it('has bounded JS heap growth across repeated frames', () => {
    const { state, image } = setup()

    // Warm-up lets JIT compilation settle so its allocations are not counted as growth.
    for (let iteration = 0; iteration < 50; iteration++) processFrame(state, image)

    const allocatingControl = maxHeapGrowth(
      () => {
        processFrame(state, image)
        new Array(1000).fill(0)
      },
      3,
      100
    )
    const processGrowth = maxHeapGrowth(() => processFrame(state, image), 3, 100)

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(processGrowth).toBeLessThan(100_000)
  })
})
