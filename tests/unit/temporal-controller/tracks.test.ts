import { describe, expect, it } from 'vitest'
import { createCompositor, registerLayer } from '../../../src/core/compositor-core'
import type { CompositorState } from '../../../src/core/compositor-core'
import {
  TemporalError,
  addTrack,
  createTemporalController,
  removeTrack
} from '../../../src/core/temporal-controller'
import type {
  TemporalErrorReason,
  TemporalState
} from '../../../src/core/temporal-controller'

function compositorWithLayers(count: number, maxLayers = count): CompositorState {
  const compositor = createCompositor(2, 2, maxLayers)
  for (let layer = 0; layer < count; layer++) registerLayer(compositor, new Uint8Array(4), 1)
  return compositor
}

function snapshot(state: TemporalState) {
  return {
    trackLayer: Array.from(state.trackLayer),
    trackLength: Array.from(state.trackLength),
    times: Array.from(state.times),
    values: Array.from(state.values)
  }
}

function expectReason(run: () => unknown, reason: TemporalErrorReason): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(TemporalError)
  expect(caught).toMatchObject({ reason })
}

describe('temporal track table', () => {
  it('adds tracks into the lowest free slots and copies the keyframes', () => {
    const state = createTemporalController(compositorWithLayers(2), 3, 4)

    expect(addTrack(state, 1, [0, 100, 200], [0, 1, 0.5])).toBe(0)
    expect(addTrack(state, 0, new Float64Array([10, 20]), new Float64Array([2, 3]))).toBe(1)

    expect(Array.from(state.trackLayer)).toEqual([1, 0, -1])
    expect(Array.from(state.trackLength)).toEqual([3, 2, 0])
    expect(Array.from(state.times.subarray(0, 3))).toEqual([0, 100, 200])
    expect(Array.from(state.values.subarray(0, 3))).toEqual([0, 1, 0.5])
    expect(Array.from(state.times.subarray(4, 6))).toEqual([10, 20])
    expect(Array.from(state.values.subarray(4, 6))).toEqual([2, 3])
  })

  it('does not retain the input arrays', () => {
    const state = createTemporalController(compositorWithLayers(1), 1, 2)
    const times = [0, 10]
    const values = [1, 2]
    addTrack(state, 0, times, values)

    times[0] = 99
    values[1] = 99

    expect(Array.from(state.times.subarray(0, 2))).toEqual([0, 10])
    expect(Array.from(state.values.subarray(0, 2))).toEqual([1, 2])
  })

  it('accepts a single keyframe', () => {
    const state = createTemporalController(compositorWithLayers(1), 1, 1)
    expect(addTrack(state, 0, [5], [0.75])).toBe(0)
    expect(state.trackLength[0]).toBe(1)
  })

  it('frees slots on remove and reuses the lowest free slot', () => {
    const state = createTemporalController(compositorWithLayers(3), 3, 2)
    addTrack(state, 0, [0, 1], [0, 1])
    addTrack(state, 1, [0, 1], [0, 1])
    addTrack(state, 2, [0, 1], [0, 1])

    removeTrack(state, 1)

    expect(state.trackLayer[1]).toBe(-1)
    expect(state.trackLength[1]).toBe(0)
    expectReason(() => removeTrack(state, 1), 'unknown-track')
    expect(addTrack(state, 1, [0, 1], [1, 0])).toBe(1)
  })

  it('rejects invalid controller dimensions', () => {
    const compositor = compositorWithLayers(1)
    for (const value of [0, -1, 1.5]) {
      expectReason(() => createTemporalController(compositor, value, 2), 'invalid-dimensions')
      expectReason(() => createTemporalController(compositor, 2, value), 'invalid-dimensions')
    }
  })

  it('rejects invalid keyframes without changing state', () => {
    const state = createTemporalController(compositorWithLayers(2), 2, 3)
    addTrack(state, 0, [0, 1], [0, 1])
    const before = snapshot(state)

    const invalid: [number[], number[]][] = [
      [[], []],
      [[0, 1, 2, 3], [0, 1, 2, 3]],
      [[0, 1], [0]],
      [[0, 0], [0, 1]],
      [[2, 1], [0, 1]],
      [[NaN, 1], [0, 1]],
      [[0, Infinity], [0, 1]],
      [[0, 1], [NaN, 1]],
      [[0, 1], [0, Infinity]],
      [[0, 1], [0, -0.5]]
    ]
    for (const [times, values] of invalid) {
      expectReason(() => addTrack(state, 1, times, values), 'invalid-keyframes')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('rejects unknown layers, driven layers, and a full table without changing state', () => {
    const state = createTemporalController(compositorWithLayers(2, 3), 1, 2)
    const empty = snapshot(state)

    for (const layerId of [2, -1, 1.5, 3]) {
      expectReason(() => addTrack(state, layerId, [0, 1], [0, 1]), 'unknown-layer')
    }
    expect(snapshot(state)).toEqual(empty)

    addTrack(state, 0, [0, 1], [0, 1])
    const full = snapshot(state)
    expectReason(() => addTrack(state, 0, [0, 1], [1, 0]), 'layer-already-driven')
    expectReason(() => addTrack(state, 1, [0, 1], [1, 0]), 'capacity-exceeded')
    expect(snapshot(state)).toEqual(full)
  })

  it('rejects unknown track ids on remove', () => {
    const state = createTemporalController(compositorWithLayers(1), 2, 2)
    addTrack(state, 0, [0, 1], [0, 1])
    const before = snapshot(state)

    for (const trackId of [-1, 1.5, 2, 1]) {
      expectReason(() => removeTrack(state, trackId), 'unknown-track')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('keeps independent controllers isolated', () => {
    const first = createTemporalController(compositorWithLayers(1), 1, 2)
    const second = createTemporalController(compositorWithLayers(1), 1, 2)

    addTrack(first, 0, [0, 1], [0, 1])

    expect(second.trackLayer[0]).toBe(-1)
    expect(addTrack(second, 0, [0, 1], [1, 0])).toBe(0)
  })
})
