import { afterEach, describe, expect, it } from 'vitest'
import type { GrayscaleImage } from '../../../src/core/image-loader'
import { createRenderer, destroyRenderer, updateBuffer } from '../../../src/core/headless-renderer'
import type { RendererState } from '../../../src/core/headless-renderer'

type MemoryPerformance = Performance & { memory: { usedJSHeapSize: number } }

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

// Canvas 2D work is deferred; a 1x1 readback forces it to complete.
function flush(state: RendererState): void {
  state.surfaceContext.getImageData(0, 0, 1, 1)
}

describe('updateBuffer benchmark', () => {
  let renderer: RendererState | undefined

  afterEach(() => {
    if (renderer !== undefined) destroyRenderer(renderer)
    renderer = undefined
  })

  async function setup(): Promise<{ state: RendererState; image: GrayscaleImage }> {
    renderer = await createRenderer(1920, 1080)
    const image: GrayscaleImage = {
      width: 1920,
      height: 1080,
      data: new Uint8ClampedArray(1920 * 1080).fill(128)
    }
    updateBuffer(renderer, image)
    flush(renderer)
    return { state: renderer, image }
  }

  it('uploads and renders a 1920x1080 image within 50ms', async () => {
    const { state, image } = await setup()

    const start = performance.now()
    updateBuffer(state, image)
    flush(state)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
  })

  it('has bounded JS heap growth when reusing same-size image and output storage', async () => {
    const { state, image } = await setup()

    const allocatingControl = maxHeapGrowth(() => {
      updateBuffer(state, image)
      new Array(1000).fill(0)
    })
    const updateGrowth = maxHeapGrowth(() => updateBuffer(state, image))
    flush(state)

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(updateGrowth).toBeLessThan(100_000)
  })
})
