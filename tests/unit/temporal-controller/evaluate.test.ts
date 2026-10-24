import { describe, expect, it } from 'vitest'
import {
  CompositorError,
  createCompositor,
  registerLayer,
  unregisterLayer
} from '../../../src/core/compositor-core'
import type { CompositorState } from '../../../src/core/compositor-core'
import {
  TemporalError,
  addTrack,
  createTemporalController,
  evaluate,
  removeTrack
} from '../../../src/core/temporal-controller'

const washTimes = [0, 1000, 4000]
const washValues = [0, 1, 0.2]

function compositorWithLayers(count: number): CompositorState {
  const compositor = createCompositor(2, 2, count)
  for (let layer = 0; layer < count; layer++) registerLayer(compositor, new Uint8Array(4), 0.4)
  return compositor
}

function weightAt(timeMs: number): number {
  const compositor = compositorWithLayers(1)
  const state = createTemporalController(compositor, 1, 3)
  addTrack(state, 0, washTimes, washValues)
  evaluate(state, timeMs)
  return compositor.weights[0] ?? NaN
}

describe('evaluate', () => {
  it.each([
    { timeMs: 0, expected: 0 },
    { timeMs: 500, expected: 0.5 },
    { timeMs: 1000, expected: 1 },
    { timeMs: 2500, expected: 0.6 },
    { timeMs: 4000, expected: 0.2 }
  ])('interpolates linearly at $timeMs', ({ timeMs, expected }) => {
    expect(weightAt(timeMs)).toBeCloseTo(expected, 6)
  })

  it('clamps to the first and last keyframe outside the range', () => {
    expect(weightAt(-100)).toBeCloseTo(0, 6)
    expect(weightAt(9999)).toBeCloseTo(0.2, 6)
  })

  it('treats a single keyframe as a constant', () => {
    const compositor = compositorWithLayers(1)
    const state = createTemporalController(compositor, 1, 1)
    addTrack(state, 0, [100], [0.75])

    for (const timeMs of [-50, 100, 5000]) {
      evaluate(state, timeMs)
      expect(compositor.weights[0]).toBeCloseTo(0.75, 6)
    }
  })

  it('depends only on the time given, so scrubbing backwards works', () => {
    const compositor = compositorWithLayers(1)
    const state = createTemporalController(compositor, 1, 3)
    addTrack(state, 0, washTimes, washValues)

    const seen: number[] = []
    for (const timeMs of [2500, 500, 2500, 2500]) {
      evaluate(state, timeMs)
      seen.push(compositor.weights[0] ?? NaN)
    }

    expect(seen[0]).toBeCloseTo(0.6, 6)
    expect(seen[1]).toBeCloseTo(0.5, 6)
    expect(seen[2]).toBeCloseTo(0.6, 6)
    expect(seen[3]).toBe(seen[2])
  })

  it('updates every track in one call and leaves untracked layers alone', () => {
    const compositor = createCompositor(2, 2, 3)
    const pixels = new Uint8Array([1, 2, 3, 4])
    registerLayer(compositor, new Uint8Array(4), 0.3)
    registerLayer(compositor, new Uint8Array(4), 0.3)
    registerLayer(compositor, pixels, 0.3)
    const state = createTemporalController(compositor, 2, 3)
    addTrack(state, 0, washTimes, washValues)
    addTrack(state, 1, [0, 1000], [1, 0])

    evaluate(state, 500)

    expect(compositor.weights[0]).toBeCloseTo(0.5, 6)
    expect(compositor.weights[1]).toBeCloseTo(0.5, 6)
    expect(compositor.weights[2]).toBeCloseTo(0.3, 6)
    expect(compositor.active[2]).toBe(1)
    expect(compositor.layers[2]).toBe(pixels)
    expect(Array.from(pixels)).toEqual([1, 2, 3, 4])
  })

  it('stops changing a layer after its track is removed', () => {
    const compositor = compositorWithLayers(1)
    const state = createTemporalController(compositor, 1, 3)
    const track = addTrack(state, 0, washTimes, washValues)
    evaluate(state, 500)

    removeTrack(state, track)
    evaluate(state, 1000)

    expect(compositor.weights[0]).toBeCloseTo(0.5, 6)
  })

  it('rejects non-finite times without writing anything', () => {
    const compositor = compositorWithLayers(1)
    const state = createTemporalController(compositor, 1, 3)
    addTrack(state, 0, washTimes, washValues)
    const before = Array.from(compositor.weights)

    for (const timeMs of [NaN, Infinity, -Infinity]) {
      let caught: unknown
      try {
        evaluate(state, timeMs)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(TemporalError)
      expect(caught).toMatchObject({ reason: 'invalid-time' })
    }
    expect(Array.from(compositor.weights)).toEqual(before)
  })

  it('surfaces the compositor error when a tracked layer was unregistered', () => {
    const compositor = compositorWithLayers(1)
    const state = createTemporalController(compositor, 1, 3)
    addTrack(state, 0, washTimes, washValues)
    unregisterLayer(compositor, 0)

    let caught: unknown
    try {
      evaluate(state, 500)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CompositorError)
    expect(caught).toMatchObject({ reason: 'unknown-layer' })
  })
})
