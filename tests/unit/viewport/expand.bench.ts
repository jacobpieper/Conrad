import { afterEach, describe, expect, it } from 'vitest'
import { expandGrayscale } from '../../../src/lib/viewport/expand'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

const pixelCount = 512 * 512
const source = Uint8Array.from({ length: pixelCount }, (_, index) => index & 255)
const output = new Uint32Array(pixelCount)
const usedHeap = () => (performance as MemoryPerformance).memory.usedJSHeapSize

function maxHeapGrowth(run: () => void, rounds = 3, iterations = 100): number {
  let growth = 0
  for (let round = 0; round < rounds; round++) {
    const before = usedHeap()
    for (let iteration = 0; iteration < iterations; iteration++) run()
    growth = Math.max(growth, usedHeap() - before)
  }
  return growth
}

describe('expandGrayscale benchmark', () => {
  afterEach(() => {
    output.fill(0)
  })

  it('expands a 512x512 frame in under 1ms per call', () => {
    for (let iteration = 0; iteration < 20; iteration++) expandGrayscale(source, output)

    const iterations = 100
    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) {
      expandGrayscale(source, output)
    }
    const meanTime = (performance.now() - start) / iterations

    expect(meanTime).toBeLessThan(1)
  })

  it('keeps heap growth bounded compared with allocating a new output per call', () => {
    const allocatingControl = maxHeapGrowth(() => {
      const allocated = new Uint32Array(pixelCount)
      expandGrayscale(source, allocated)
    })
    const expansionGrowth = maxHeapGrowth(() => expandGrayscale(source, output))

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(expansionGrowth).toBeLessThan(100_000)
  })
})
