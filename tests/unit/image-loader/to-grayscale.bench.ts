import { describe, it, expect } from 'vitest'
import { toGrayscale } from '../../../src/core/image-loader/to-grayscale'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

const usedHeap = () => (performance as MemoryPerformance).memory.usedJSHeapSize

// Largest heap growth seen across rounds; GC can only lower it, so this never hides an allocation.
function maxHeapGrowth(run: () => void, rounds = 5, iterations = 200): number {
  let growth = 0
  for (let round = 0; round < rounds; round++) {
    const before = usedHeap()
    for (let i = 0; i < iterations; i++) run()
    growth = Math.max(growth, usedHeap() - before)
  }
  return growth
}

describe('toGrayscale benchmark', () => {
  it('converts a 1920x1080 buffer within a 100ms budget using one pre-sized output buffer', () => {
    const width = 1920
    const height = 1080
    const rgba = new Uint8ClampedArray(width * height * 4).fill(128)
    const out = new Uint8Array(width * height)

    const start = performance.now()
    const result = toGrayscale(rgba, width, height, out)
    const elapsed = performance.now() - start

    expect(result).toBe(out)
    expect(elapsed).toBeLessThan(100)
  })

  it('allocates no JS heap memory across repeated calls with a pre-sized output buffer', () => {
    const width = 256
    const height = 256
    const rgba = new Uint8ClampedArray(width * height * 4)
    const out = new Uint8Array(width * height)
    toGrayscale(rgba, width, height, out)

    const allocating = maxHeapGrowth(() => {
      toGrayscale(rgba, width, height, out)
      new Array(1000).fill(0)
    })
    const conversion = maxHeapGrowth(() => {
      toGrayscale(rgba, width, height, out)
    })

    // The control must register, otherwise a zero reading proves nothing.
    expect(allocating).toBeGreaterThan(100_000)
    expect(conversion).toBeLessThan(10_000)
  })
})
