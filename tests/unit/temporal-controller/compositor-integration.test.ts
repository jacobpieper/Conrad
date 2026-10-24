import { describe, expect, it } from 'vitest'
import {
  compose,
  createCompositor,
  registerLayer
} from '../../../src/core/compositor-core'
import { addTrack, createTemporalController, evaluate } from '../../../src/core/temporal-controller'

describe('temporal controller with compositor', () => {
  it('composes a wash-in and wash-out over time', () => {
    const compositor = createCompositor(2, 2, 1)
    registerLayer(compositor, new Uint8Array(4).fill(100), 1)
    const state = createTemporalController(compositor, 1, 3)
    addTrack(state, 0, [0, 1000, 4000], [0, 1, 0.2])

    const expected = [
      { timeMs: 500, byte: 50 },
      { timeMs: 1000, byte: 100 },
      { timeMs: 4000, byte: 20 }
    ]
    for (const { timeMs, byte } of expected) {
      evaluate(state, timeMs)
      expect(Array.from(compose(compositor).data)).toEqual([byte, byte, byte, byte])
    }
  })

  it('sums a rising and a falling layer at different times', () => {
    const compositor = createCompositor(2, 2, 2)
    registerLayer(compositor, new Uint8Array(4).fill(100), 1)
    registerLayer(compositor, new Uint8Array(4).fill(200), 1)
    const state = createTemporalController(compositor, 2, 2)
    addTrack(state, 0, [0, 1000], [0, 1])
    addTrack(state, 1, [0, 1000], [1, 0])

    evaluate(state, 250)
    expect(Array.from(compose(compositor).data)).toEqual([175, 175, 175, 175])

    evaluate(state, 750)
    expect(Array.from(compose(compositor).data)).toEqual([125, 125, 125, 125])
  })
})
