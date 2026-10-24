import { describe, expect, it } from 'vitest'
import { compose, createCompositor, registerLayer, setLayerOffset } from '../../../src/core/compositor-core'
import type { CompositorState } from '../../../src/core/compositor-core'

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

function setup(): CompositorState {
  const state = createCompositor(512, 512, 8)
  for (let layer = 0; layer < 8; layer++) {
    registerLayer(state, new Uint8Array(512 * 512).fill(20 + layer * 10), 0.5)
  }
  compose(state)
  return state
}

function setupWithOffsets(): CompositorState {
  const state = setup()
  for (let layer = 0; layer < 8; layer++) setLayerOffset(state, layer, layer * 7 - 20, layer * 5 - 15)
  compose(state)
  return state
}

describe('compose benchmark', () => {
  it('composes 8 layers at 512x512 within the time budget', () => {
    const state = setup()

    const start = performance.now()
    compose(state)
    const elapsed = performance.now() - start
    // Measured ~1.6ms locally; budget leaves headroom for slower CI machines.
    expect(elapsed).toBeLessThan(10)
  })

  it('has bounded JS heap growth across repeated compositions', () => {
    const state = setup()

    const allocatingControl = maxHeapGrowth(() => {
      compose(state)
      new Array(1000).fill(0)
    })
    const composeGrowth = maxHeapGrowth(() => compose(state))

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(composeGrowth).toBeLessThan(100_000)
  })

  it('composes 8 offset layers at 512x512 within the time budget', () => {
    const state = setupWithOffsets()

    const start = performance.now()
    compose(state)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(10)
  })

  it('has bounded JS heap growth across repeated compositions with offsets', () => {
    const state = setupWithOffsets()

    // Warm-up lets JIT compilation settle so its allocations are not counted as growth.
    for (let iteration = 0; iteration < 200; iteration++) compose(state)

    const allocatingControl = maxHeapGrowth(() => {
      compose(state)
      new Array(1000).fill(0)
    }, 3, 100)
    const composeGrowth = maxHeapGrowth(() => compose(state), 3, 100)

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(composeGrowth).toBeLessThan(100_000)
  })
})
