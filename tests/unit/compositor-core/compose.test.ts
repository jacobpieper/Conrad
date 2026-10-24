import { describe, expect, it } from 'vitest'
import {
  compose,
  createCompositor,
  registerLayer,
  setLayerActive,
  setLayerWeight,
  unregisterLayer
} from '../../../src/core/compositor-core'

describe('compose', () => {
  it('sums weighted layers and clamps to 255', () => {
    const state = createCompositor(2, 1, 2)
    registerLayer(state, new Uint8Array([100, 200]), 0.5)
    registerLayer(state, new Uint8ClampedArray([50, 200]), 2)

    expect(Array.from(compose(state).data)).toEqual([150, 255])
  })

  it('rounds fractional sums to nearest, ties to even', () => {
    const state = createCompositor(3, 1, 1)
    registerLayer(state, new Uint8Array([1, 3, 5]), 0.5)

    expect(Array.from(compose(state).data)).toEqual([0, 2, 2])
  })

  it('outputs zeros when no layer is active', () => {
    const state = createCompositor(2, 2, 2)
    expect(Array.from(compose(state).data)).toEqual([0, 0, 0, 0])

    const id = registerLayer(state, new Uint8Array([9, 9, 9, 9]), 1)
    setLayerActive(state, id, false)
    expect(Array.from(compose(state).data)).toEqual([0, 0, 0, 0])
  })

  it('removes and restores a contribution with setLayerActive', () => {
    const state = createCompositor(2, 1, 2)
    registerLayer(state, new Uint8Array([10, 20]), 1)
    const second = registerLayer(state, new Uint8Array([1, 2]), 1)

    expect(Array.from(compose(state).data)).toEqual([11, 22])
    setLayerActive(state, second, false)
    expect(Array.from(compose(state).data)).toEqual([10, 20])
    setLayerActive(state, second, true)
    expect(Array.from(compose(state).data)).toEqual([11, 22])
  })

  it('ignores unregistered layers and applies updated weights', () => {
    const state = createCompositor(2, 1, 2)
    const first = registerLayer(state, new Uint8Array([10, 20]), 1)
    registerLayer(state, new Uint8Array([100, 100]), 1)

    unregisterLayer(state, 1)
    expect(Array.from(compose(state).data)).toEqual([10, 20])

    setLayerWeight(state, first, 3)
    expect(Array.from(compose(state).data)).toEqual([30, 60])
  })

  it('does not depend on layer order', () => {
    const a = new Uint8Array([10, 80, 200])
    const b = new Uint8Array([40, 90, 30])
    const forward = createCompositor(3, 1, 2)
    registerLayer(forward, a, 0.7)
    registerLayer(forward, b, 1.3)
    const reverse = createCompositor(3, 1, 2)
    registerLayer(reverse, b, 1.3)
    registerLayer(reverse, a, 0.7)

    expect(Array.from(compose(forward).data)).toEqual(Array.from(compose(reverse).data))
  })

  it('reflects in-place changes to a registered layer on the next call', () => {
    const state = createCompositor(2, 1, 1)
    const pixels = new Uint8Array([5, 6])
    registerLayer(state, pixels, 1)
    expect(Array.from(compose(state).data)).toEqual([5, 6])

    pixels[0] = 50
    expect(Array.from(compose(state).data)).toEqual([50, 6])
  })

  it('returns the same reusable image object on every call', () => {
    const state = createCompositor(4, 3, 1)
    registerLayer(state, new Uint8Array(12).fill(7), 1)

    const first = compose(state)
    const second = compose(state)

    expect(second).toBe(first)
    expect(second.data).toBe(first.data)
    expect(first.width).toBe(4)
    expect(first.height).toBe(3)
    expect(first.data.length).toBe(12)
    expect(first.data).toBeInstanceOf(Uint8ClampedArray)
  })

  it('keeps independent compositors isolated', () => {
    const first = createCompositor(1, 1, 1)
    const second = createCompositor(1, 1, 1)
    registerLayer(first, new Uint8Array([200]), 1)
    registerLayer(second, new Uint8Array([20]), 1)

    expect(compose(first).data[0]).toBe(200)
    expect(compose(second).data[0]).toBe(20)
  })
})
