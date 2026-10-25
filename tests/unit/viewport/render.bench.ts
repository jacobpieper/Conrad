import { afterEach, describe, expect, it } from 'vitest'
import { mountViewport } from './helpers'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

const width = 512
const height = 512
const pixelCount = width * height
const data = Uint8ClampedArray.from({ length: pixelCount }, (_, index) => index & 255)
const frame = { width, height, data }
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

describe('Viewport render benchmark', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('renders a 512x512 frame within a 16.7ms frame budget', () => {
    const mounted = mountViewport({
      width,
      height,
      containerWidth: width,
      containerHeight: height
    })
    cleanup = mounted.unmount

    for (let iteration = 0; iteration < 20; iteration++) mounted.viewport.render(frame)

    const iterations = 100
    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) mounted.viewport.render(frame)
    const meanTime = (performance.now() - start) / iterations

    expect(meanTime).toBeLessThan(16.7)
  })

  it('keeps render heap growth bounded compared with allocating a pixel buffer per call', () => {
    const mounted = mountViewport({
      width,
      height,
      containerWidth: width,
      containerHeight: height
    })
    cleanup = mounted.unmount
    mounted.viewport.render(frame)

    const allocatingControl = maxHeapGrowth(() => {
      new Uint8ClampedArray(pixelCount * 4)
    })
    const renderGrowth = maxHeapGrowth(() => mounted.viewport.render(frame))

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(renderGrowth).toBeLessThan(100_000)
  })
})
