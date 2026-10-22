import { describe, expect, it } from 'vitest'
import { addLayers, alphaMask, subtractLayers } from '../../../src/core/grayscale-blending'
import type { GrayscaleImage } from '../../../src/core/grayscale-blending'

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

describe('grayscale blending benchmark', () => {
  it('adds two 4096x4096 layers into a supplied output under 50ms', () => {
    const width = 4096
    const height = 4096
    const pixelCount = width * height
    const first: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(128) }
    const second: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(64) }
    const out = new Uint8ClampedArray(pixelCount)

    addLayers([first, second], out)
    const start = performance.now()
    const result = addLayers([first, second], out)
    const elapsed = performance.now() - start

    expect(result).toBe(out)
    expect(out[0]).toBe(192)
    expect(elapsed).toBeLessThan(50)
  })

  it('subtracts two 4096x4096 layers into a supplied output under 50ms', () => {
    const width = 4096
    const height = 4096
    const pixelCount = width * height
    const first: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(192) }
    const second: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(64) }
    const layers = [first, second]
    const out = new Uint8ClampedArray(pixelCount)

    subtractLayers(layers, out)
    const start = performance.now()
    const result = subtractLayers(layers, out)
    const elapsed = performance.now() - start

    expect(result).toBe(out)
    expect(out[0]).toBe(128)
    expect(elapsed).toBeLessThan(50)
  })

  it('alpha-composites two 4096x4096 layers into a supplied output under 50ms', () => {
    const width = 4096
    const height = 4096
    const pixelCount = width * height
    const base: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(32) }
    const overlay: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(224) }
    const mask: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(128) }
    const out = new Uint8ClampedArray(pixelCount)

    const start = performance.now()
    const result = alphaMask(base, overlay, mask, out)
    const elapsed = performance.now() - start

    expect(result).toBe(out)
    expect(out[0]).toBe(128)
    expect(elapsed).toBeLessThan(50)
  })

  it('keeps repeated supplied-output calls below the heap growth control', () => {
    const width = 256
    const height = 256
    const pixelCount = width * height
    const first: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(80) }
    const second: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(40) }
    const third: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(20) }
    const mask: GrayscaleImage = { width, height, data: new Uint8ClampedArray(pixelCount).fill(128) }
    const out = new Uint8ClampedArray(pixelCount)
    const twoLayers = [first, second]
    const threeLayers = [first, second, third]

    // Long enough for every operation to finish JIT tiering, so one-time compilation is not measured.
    for (let iteration = 0; iteration < 3000; iteration++) {
      addLayers(twoLayers, out)
      subtractLayers(twoLayers, out)
      addLayers(threeLayers, out)
      alphaMask(first, second, mask, out)
    }

    const allocating = maxHeapGrowth(() => {
      addLayers(twoLayers, out)
      new Array(1000).fill(0)
    })
    // Enough calls that any per-call allocation (even a typed-array view) far exceeds ambient heap noise.
    const addGrowth = maxHeapGrowth(() => addLayers(twoLayers, out), 5, 2000)
    const subtractGrowth = maxHeapGrowth(() => subtractLayers(twoLayers, out), 5, 2000)
    const multiLayerAddGrowth = maxHeapGrowth(() => addLayers(threeLayers, out), 5, 2000)
    const alphaGrowth = maxHeapGrowth(() => alphaMask(first, second, mask, out), 5, 2000)

    expect(allocating).toBeGreaterThan(100_000)
    expect(addGrowth).toBeLessThan(10_000)
    expect(subtractGrowth).toBeLessThan(10_000)
    expect(multiLayerAddGrowth).toBeLessThan(10_000)
    expect(alphaGrowth).toBeLessThan(10_000)
    expect(Math.max(addGrowth, subtractGrowth, multiLayerAddGrowth, alphaGrowth)).toBeLessThan(allocating)
  })
})
