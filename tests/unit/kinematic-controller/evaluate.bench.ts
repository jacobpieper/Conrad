import { describe, expect, it } from 'vitest'
import { createCompositor, registerLayer } from '../../../src/core/compositor-core'
import {
  addMotionTrack,
  createKinematicController,
  evaluateMotion
} from '../../../src/core/kinematic-controller'
import type { KinematicState } from '../../../src/core/kinematic-controller'

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

function setup(): KinematicState {
  const compositor = createCompositor(2, 2, 8)
  const state = createKinematicController(compositor, 8, 16)
  for (let layer = 0; layer < 8; layer++) {
    registerLayer(compositor, new Uint8Array(4), 1)
    if (layer < 6) {
      const times = Array.from({ length: 16 }, (_, index) => index * 100)
      const x = Array.from({ length: 16 }, (_, index) => ((index + layer) % 4) * 3)
      const y = Array.from({ length: 16 }, (_, index) => ((index * 2 + layer) % 5) * -2)
      addMotionTrack(state, layer, { mode: layer < 3 ? 'linear' : 'cubic', times, x, y })
    } else {
      addMotionTrack(state, layer, {
        mode: 'parametric',
        centerX: 0,
        centerY: 1,
        amplitudeX: 10,
        amplitudeY: 5,
        periodMs: 1600,
        phaseMs: layer * 100,
        exponent: layer - 5
      })
    }
  }
  evaluateMotion(state, 0)
  return state
}

describe('evaluateMotion benchmark', () => {
  it('evaluates 8 mixed-mode tracks within the time budget', () => {
    const state = setup()
    const iterations = 1000

    const start = performance.now()
    for (let iteration = 0; iteration < iterations; iteration++) evaluateMotion(state, iteration % 1600)
    const perCall = (performance.now() - start) / iterations
    // Measured ~0.0012ms per call; 0.05ms leaves wide headroom for slower CI machines.
    expect(perCall).toBeLessThan(0.05)
  })

  it('has bounded JS heap growth across repeated evaluations', () => {
    const state = setup()
    let time = 0

    // Warm-up lets JIT compilation settle so its allocations are not counted as growth.
    for (let iteration = 0; iteration < 5000; iteration++) {
      evaluateMotion(state, time)
      time = (time + 37) % 1600
    }

    const allocatingControl = maxHeapGrowth(() => {
      evaluateMotion(state, time)
      time = (time + 37) % 1600
      new Array(1000).fill(0)
    })
    const evaluateGrowth = maxHeapGrowth(() => {
      evaluateMotion(state, time)
      time = (time + 37) % 1600
    })

    expect(allocatingControl).toBeGreaterThan(100_000)
    expect(evaluateGrowth).toBeLessThan(100_000)
  })
})
