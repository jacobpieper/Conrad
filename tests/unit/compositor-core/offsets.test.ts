import { describe, expect, it } from 'vitest'
import {
  CompositorError,
  compose,
  createCompositor,
  registerLayer,
  setLayerActive,
  setLayerOffset,
  unregisterLayer
} from '../../../src/core/compositor-core'
import type { CompositorErrorReason, CompositorState } from '../../../src/core/compositor-core'

function composed(
  width: number,
  height: number,
  pixels: number[],
  offsetX: number,
  offsetY: number,
  weight = 1
): number[] {
  const state = createCompositor(width, height, 1)
  const id = registerLayer(state, Uint8Array.from(pixels), weight)
  setLayerOffset(state, id, offsetX, offsetY)
  return Array.from(compose(state).data)
}

function snapshot(state: CompositorState) {
  return {
    offsetsX: Array.from(state.offsetsX),
    offsetsY: Array.from(state.offsetsY),
    weights: Array.from(state.weights),
    active: Array.from(state.active)
  }
}

function expectReason(run: () => unknown, reason: CompositorErrorReason): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(CompositorError)
  expect(caught).toMatchObject({ reason })
}

describe('layer offsets in compose', () => {
  it('shifts a row horizontally and drops what leaves the image', () => {
    expect(composed(3, 1, [10, 20, 30], 1, 0)).toEqual([0, 10, 20])
    expect(composed(3, 1, [10, 20, 30], -1, 0)).toEqual([20, 30, 0])
  })

  it('shifts in both axes on a square image', () => {
    const pixels = [1, 2, 3, 4]
    expect(composed(2, 2, pixels, 1, 1)).toEqual([0, 0, 0, 1])
    expect(composed(2, 2, pixels, 0, 1)).toEqual([0, 0, 1, 2])
  })

  it('shifts a rectangular image in both axes', () => {
    const pixels = [1, 2, 3, 4, 5, 6]
    expect(composed(3, 2, pixels, 1, 1)).toEqual([0, 0, 0, 0, 1, 2])
    expect(composed(3, 2, pixels, -1, -1)).toEqual([5, 6, 0, 0, 0, 0])
    expect(composed(3, 2, pixels, -2, 0)).toEqual([3, 0, 0, 6, 0, 0])
  })

  it('contributes nothing when the offset reaches or passes the image size', () => {
    const pixels = [1, 2, 3, 4]
    const zeros = [0, 0, 0, 0]
    expect(composed(2, 2, pixels, 2, 0)).toEqual(zeros)
    expect(composed(2, 2, pixels, 0, -2)).toEqual(zeros)
    expect(composed(2, 2, pixels, 2147483647, 0)).toEqual(zeros)
    expect(composed(2, 2, pixels, 0, -2147483648)).toEqual(zeros)
    expect(composed(2, 2, pixels, -2147483648, 2147483647)).toEqual(zeros)
  })

  it('composes a zero offset exactly like an unshifted layer', () => {
    const state = createCompositor(2, 2, 1)
    const id = registerLayer(state, new Uint8Array([5, 6, 7, 8]), 0.5)
    const before = Array.from(compose(state).data)

    setLayerOffset(state, id, 0, 0)

    expect(before).toEqual([2, 3, 4, 4])
    expect(Array.from(compose(state).data)).toEqual(before)
  })

  it('weights, sums, and clamps layers with different offsets', () => {
    const state = createCompositor(3, 1, 3)
    const first = registerLayer(state, new Uint8Array([10, 20, 30]), 1)
    registerLayer(state, new Uint8Array([100, 100, 100]), 2)
    setLayerOffset(state, first, 1, 0)

    expect(Array.from(compose(state).data)).toEqual([200, 210, 220])

    const third = registerLayer(state, new Uint8Array([200, 200, 200]), 1)
    setLayerOffset(state, third, -1, 0)

    expect(Array.from(compose(state).data)).toEqual([255, 255, 220])
  })

  it('ignores the offset of an inactive layer', () => {
    const state = createCompositor(2, 1, 1)
    const id = registerLayer(state, new Uint8Array([9, 9]), 1)
    setLayerOffset(state, id, 1, 0)
    setLayerActive(state, id, false)

    expect(Array.from(compose(state).data)).toEqual([0, 0])
  })

  it('never mutates or replaces the registered layer buffers', () => {
    const state = createCompositor(3, 2, 2)
    const first = Uint8Array.from([1, 2, 3, 4, 5, 6])
    const second = Uint8ClampedArray.from([9, 8, 7, 6, 5, 4])
    const firstCopy = Uint8Array.from(first)
    const secondCopy = Uint8ClampedArray.from(second)
    const firstId = registerLayer(state, first, 1)
    const secondId = registerLayer(state, second, 1)
    setLayerOffset(state, firstId, 1, -1)
    setLayerOffset(state, secondId, -2, 1)

    compose(state)
    compose(state)

    expect(state.layers[firstId]).toBe(first)
    expect(state.layers[secondId]).toBe(second)
    expect(Array.from(first)).toEqual(Array.from(firstCopy))
    expect(Array.from(second)).toEqual(Array.from(secondCopy))
  })

  it('keeps returning the same reusable image', () => {
    const state = createCompositor(2, 1, 1)
    const id = registerLayer(state, new Uint8Array([1, 2]), 1)
    setLayerOffset(state, id, 1, 0)

    expect(compose(state)).toBe(compose(state))
    expect(compose(state).data).toBe(state.output.data)
  })
})

describe('setLayerOffset', () => {
  it('starts every offset at zero and resets it when a layer is unregistered', () => {
    const state = createCompositor(2, 2, 2)
    const first = registerLayer(state, new Uint8Array(4), 1)
    expect(state.offsetsX[first]).toBe(0)
    expect(state.offsetsY[first]).toBe(0)

    setLayerOffset(state, first, 2, -3)
    expect(state.offsetsX[first]).toBe(2)
    expect(state.offsetsY[first]).toBe(-3)

    unregisterLayer(state, first)
    expect(state.offsetsX[first]).toBe(0)
    expect(state.offsetsY[first]).toBe(0)

    const reused = registerLayer(state, new Uint8Array(4), 1)
    expect(reused).toBe(first)
    expect(state.offsetsX[reused]).toBe(0)
    expect(state.offsetsY[reused]).toBe(0)
  })

  it('changes only the target slot', () => {
    const state = createCompositor(2, 2, 2)
    registerLayer(state, new Uint8Array(4), 1)
    registerLayer(state, new Uint8Array(4), 1)

    setLayerOffset(state, 1, 4, 5)

    expect(Array.from(state.offsetsX)).toEqual([0, 4])
    expect(Array.from(state.offsetsY)).toEqual([0, 5])
  })

  it('rejects non-integer and out-of-range offsets without changing state', () => {
    const state = createCompositor(2, 2, 1)
    const id = registerLayer(state, new Uint8Array(4), 1)
    setLayerOffset(state, id, 1, 1)
    const before = snapshot(state)

    const invalid = [1.5, NaN, Infinity, -Infinity, 2147483648, -2147483649]
    for (const value of invalid) {
      expectReason(() => setLayerOffset(state, id, value, 0), 'invalid-offset')
      expectReason(() => setLayerOffset(state, id, 0, value), 'invalid-offset')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('accepts the int32 extremes', () => {
    const state = createCompositor(2, 2, 1)
    const id = registerLayer(state, new Uint8Array(4), 1)

    setLayerOffset(state, id, 2147483647, -2147483648)

    expect(state.offsetsX[id]).toBe(2147483647)
    expect(state.offsetsY[id]).toBe(-2147483648)
  })

  it('rejects unknown layer ids without changing state', () => {
    const state = createCompositor(2, 2, 2)
    registerLayer(state, new Uint8Array(4), 1)
    const before = snapshot(state)

    for (const id of [-1, 1.5, 2, 1]) {
      expectReason(() => setLayerOffset(state, id, 1, 1), 'unknown-layer')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('keeps independent compositors isolated', () => {
    const first = createCompositor(2, 2, 1)
    const second = createCompositor(2, 2, 1)
    const firstId = registerLayer(first, new Uint8Array(4), 1)
    registerLayer(second, new Uint8Array(4), 1)

    setLayerOffset(first, firstId, 1, 1)

    expect(second.offsetsX[0]).toBe(0)
    expect(second.offsetsY[0]).toBe(0)
  })
})
