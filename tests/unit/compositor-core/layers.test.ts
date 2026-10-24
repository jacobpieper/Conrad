import { describe, expect, it } from 'vitest'
import {
  CompositorError,
  createCompositor,
  registerLayer,
  setLayerActive,
  setLayerWeight,
  unregisterLayer
} from '../../../src/core/compositor-core'
import type { CompositorErrorReason, CompositorState } from '../../../src/core/compositor-core'

function snapshot(state: CompositorState) {
  return {
    layers: [...state.layers],
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

describe('layer controller', () => {
  it('registers layers into the lowest free slots with weights and active flags', () => {
    const state = createCompositor(2, 2, 3)
    const first = new Uint8Array(4)
    const second = new Uint8ClampedArray(4)

    expect(registerLayer(state, first, 0.5)).toBe(0)
    expect(registerLayer(state, second, 2)).toBe(1)

    expect(Array.from(state.weights)).toEqual([0.5, 2, 0])
    expect(Array.from(state.active)).toEqual([1, 1, 0])
    expect(state.layers[0]).toBe(first)
    expect(state.layers[1]).toBe(second)
    expect(state.layers[2]).toBeNull()
  })

  it('accepts weight 0 and weights above 1', () => {
    const state = createCompositor(1, 1, 2)
    registerLayer(state, new Uint8Array(1), 0)
    registerLayer(state, new Uint8Array(1), 3)
    expect(Array.from(state.weights)).toEqual([0, 3])
  })

  it('changes only the target slot when updating weight or active state', () => {
    const state = createCompositor(1, 1, 2)
    registerLayer(state, new Uint8Array(1), 1)
    registerLayer(state, new Uint8Array(1), 1)

    setLayerWeight(state, 1, 0.25)
    setLayerActive(state, 0, false)

    expect(Array.from(state.weights)).toEqual([1, 0.25])
    expect(Array.from(state.active)).toEqual([0, 1])

    setLayerActive(state, 0, true)
    expect(Array.from(state.active)).toEqual([1, 1])
  })

  it('frees slots on unregister and reuses the lowest free slot', () => {
    const state = createCompositor(1, 1, 3)
    registerLayer(state, new Uint8Array(1), 1)
    registerLayer(state, new Uint8Array(1), 1)
    registerLayer(state, new Uint8Array(1), 1)

    unregisterLayer(state, 1)

    expect(state.layers[1]).toBeNull()
    expect(state.weights[1]).toBe(0)
    expect(state.active[1]).toBe(0)
    expectReason(() => setLayerWeight(state, 1, 1), 'unknown-layer')
    expect(registerLayer(state, new Uint8Array(1), 1)).toBe(1)
  })

  it('rejects invalid compositor dimensions', () => {
    const invalid = [0, -1, 1.5]
    for (const value of invalid) {
      expectReason(() => createCompositor(value, 2, 2), 'invalid-dimensions')
      expectReason(() => createCompositor(2, value, 2), 'invalid-dimensions')
      expectReason(() => createCompositor(2, 2, value), 'invalid-dimensions')
    }
  })

  it('rejects wrong-length layers, bad weights, and a full table without changing state', () => {
    const state = createCompositor(2, 2, 1)
    const before = snapshot(state)

    expectReason(() => registerLayer(state, new Uint8Array(3), 1), 'invalid-layer')
    for (const weight of [-1, NaN, Infinity, -Infinity]) {
      expectReason(() => registerLayer(state, new Uint8Array(4), weight), 'invalid-weight')
    }
    expect(snapshot(state)).toEqual(before)

    registerLayer(state, new Uint8Array(4), 1)
    const full = snapshot(state)
    expectReason(() => registerLayer(state, new Uint8Array(4), 1), 'capacity-exceeded')
    expect(snapshot(state)).toEqual(full)
  })

  it('rejects invalid weights on update and unknown ids on every operation', () => {
    const state = createCompositor(1, 1, 2)
    registerLayer(state, new Uint8Array(1), 1)
    const before = snapshot(state)

    for (const weight of [-1, NaN, Infinity, -Infinity]) {
      expectReason(() => setLayerWeight(state, 0, weight), 'invalid-weight')
    }
    for (const id of [-1, 1.5, 2, 1]) {
      expectReason(() => unregisterLayer(state, id), 'unknown-layer')
      expectReason(() => setLayerWeight(state, id, 1), 'unknown-layer')
      expectReason(() => setLayerActive(state, id, false), 'unknown-layer')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('keeps independent compositors isolated', () => {
    const first = createCompositor(1, 1, 1)
    const second = createCompositor(1, 1, 1)
    registerLayer(first, new Uint8Array(1), 1)
    expect(second.layers[0]).toBeNull()
  })
})
