import { describe, expect, it } from 'vitest'
import { createCompositor, registerLayer } from '../../../src/core/compositor-core'
import {
  addTrack,
  createTemporalController,
  evaluate
} from '../../../src/core/temporal-controller'
import type { TemporalState } from '../../../src/core/temporal-controller'

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

function setup(): TemporalState {
  const compositor = createCompositor(2, 2, 8)
  const state = createTemporalController(compositor, 8, 16)
  for (let layer = 0; layer < 8; layer++) {
    registerLayer(compositor, new Uint8Array(4), 1)
    const times = Array.from({ length: 16 }, (_, index) => index * 100)
    const values = Array.from({ length: 16 }, (_, index) => ((index + layer) % 4) * 0.25)
    addTrack(state, layer, times, values)
  }
  evaluate(state, 0)
  return state
}

describe('evaluate benchmark', () => {
  it('evaluates 8 tracks of 16 keyframes within the time budget', () => {
    const state = setup()
    const iterations = 1000

    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) evaluate(state, iteration % 1600)
    const perCall = (performance.now() - start) / iterations
    // Measured ~0.0007ms per call; 0.05ms leaves wide headroom for slower CI machines.
    expect(perCall).toBeLessThan(0.05)
  })

  it('has bounded JS heap growth across repeated evaluations', () => {
    const state = setup()
    let time = 0

    // Warm-up lets JIT compilation settle so its allocations are not counted as growth.
    for (let iteration = 0; iteration < 5000; iteration++) {
      evaluate(state, time)
      time = (time + 37) % 1600
    }

    const allocatingControl = maxHeapGrowth(() => {
      evaluate(state, time)
      time = (time + 37) % 1600
      new Array(1000).fill(0)
    })
    const evaluateGrowth = maxHeapGrowth(() => {
      evaluate(state, time)
      time = (time + 37) % 1600
    })

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(evaluateGrowth).toBeLessThan(100_000)
  })
})
