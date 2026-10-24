import { describe, expect, it } from 'vitest'
import { createCompositor, registerLayer } from '../../../src/core/compositor-core'
import type { CompositorState } from '../../../src/core/compositor-core'
import {
  KinematicError,
  addMotionTrack,
  createKinematicController,
  removeMotionTrack
} from '../../../src/core/kinematic-controller'
import type {
  KeyframeMotion,
  KinematicErrorReason,
  KinematicState,
  MotionTrack,
  ParametricMotion
} from '../../../src/core/kinematic-controller'

function compositorWithLayers(count: number, maxLayers = count): CompositorState {
  const compositor = createCompositor(2, 2, maxLayers)
  for (let layer = 0; layer < count; layer++) registerLayer(compositor, new Uint8Array(4), 1)
  return compositor
}

function linear(): KeyframeMotion {
  return { mode: 'linear', times: [0, 100, 200], x: [0, 10, 20], y: [0, -10, -20] }
}

function cubic(): KeyframeMotion {
  return { mode: 'cubic', times: [0, 50], x: [1, 2], y: [3, 4] }
}

function parametric(): ParametricMotion {
  return {
    mode: 'parametric',
    centerX: 1,
    centerY: 2,
    amplitudeX: 3,
    amplitudeY: 4,
    periodMs: 5,
    phaseMs: 6,
    exponent: 7
  }
}

function snapshot(state: KinematicState) {
  return {
    trackLayer: Array.from(state.trackLayer),
    trackMode: Array.from(state.trackMode),
    trackLength: Array.from(state.trackLength),
    times: Array.from(state.times),
    xs: Array.from(state.xs),
    ys: Array.from(state.ys),
    params: Array.from(state.params)
  }
}

function expectReason(run: () => unknown, reason: KinematicErrorReason): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(KinematicError)
  expect(caught).toMatchObject({ reason })
}

describe('motion track table', () => {
  it('adds one track of each mode and stores them in flat arrays', () => {
    const state = createKinematicController(compositorWithLayers(3), 3, 4)

    expect(addMotionTrack(state, 0, linear())).toBe(0)
    expect(addMotionTrack(state, 1, cubic())).toBe(1)
    expect(addMotionTrack(state, 2, parametric())).toBe(2)

    expect(Array.from(state.trackLayer)).toEqual([0, 1, 2])
    expect(Array.from(state.trackMode)).toEqual([0, 1, 2])
    expect(Array.from(state.trackLength)).toEqual([3, 2, 0])
    expect(Array.from(state.times.subarray(0, 3))).toEqual([0, 100, 200])
    expect(Array.from(state.xs.subarray(0, 3))).toEqual([0, 10, 20])
    expect(Array.from(state.ys.subarray(0, 3))).toEqual([0, -10, -20])
    expect(Array.from(state.times.subarray(4, 6))).toEqual([0, 50])
    expect(Array.from(state.xs.subarray(4, 6))).toEqual([1, 2])
    expect(Array.from(state.ys.subarray(4, 6))).toEqual([3, 4])
    expect(Array.from(state.params.subarray(14, 21))).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('accepts typed array inputs and a single keyframe in both keyframe modes', () => {
    const state = createKinematicController(compositorWithLayers(2), 2, 2)
    const single = (mode: 'linear' | 'cubic'): KeyframeMotion => ({
      mode,
      times: new Float64Array([5]),
      x: new Float64Array([7]),
      y: new Float64Array([-7])
    })

    expect(addMotionTrack(state, 0, single('linear'))).toBe(0)
    expect(addMotionTrack(state, 1, single('cubic'))).toBe(1)
    expect(Array.from(state.trackLength)).toEqual([1, 1])
  })

  it('does not retain the input arrays or objects', () => {
    const state = createKinematicController(compositorWithLayers(2), 2, 2)
    const keyframes: KeyframeMotion = { mode: 'linear', times: [0, 10], x: [1, 2], y: [3, 4] }
    const waveform = parametric()
    addMotionTrack(state, 0, keyframes)
    addMotionTrack(state, 1, waveform)

    if (Array.isArray(keyframes.times)) keyframes.times[0] = 99
    if (Array.isArray(keyframes.x)) keyframes.x[1] = 99
    waveform.centerX = 99

    expect(Array.from(state.times.subarray(0, 2))).toEqual([0, 10])
    expect(Array.from(state.xs.subarray(0, 2))).toEqual([1, 2])
    expect(state.params[7]).toBe(1)
  })

  it('frees slots on remove and reuses the lowest free slot', () => {
    const state = createKinematicController(compositorWithLayers(3), 3, 4)
    addMotionTrack(state, 0, linear())
    addMotionTrack(state, 1, cubic())
    addMotionTrack(state, 2, parametric())

    removeMotionTrack(state, 1)

    expect(state.trackLayer[1]).toBe(-1)
    expect(state.trackLength[1]).toBe(0)
    expectReason(() => removeMotionTrack(state, 1), 'unknown-track')
    expect(addMotionTrack(state, 1, linear())).toBe(1)
  })

  it('accepts values exactly at the magnitude limits', () => {
    const state = createKinematicController(compositorWithLayers(2), 2, 2)

    addMotionTrack(state, 0, {
      mode: 'linear',
      times: [0, 1],
      x: [16_777_216, -16_777_216],
      y: [-16_777_216, 16_777_216]
    })
    addMotionTrack(state, 1, {
      ...parametric(),
      centerX: 16_000_000,
      amplitudeX: 777_216,
      centerY: -16_777_216,
      amplitudeY: 0
    })

    expect(Array.from(state.trackLayer)).toEqual([0, 1])
  })

  it('rejects invalid controller dimensions', () => {
    const compositor = compositorWithLayers(1)
    for (const value of [0, -1, 1.5]) {
      expectReason(() => createKinematicController(compositor, value, 2), 'invalid-dimensions')
      expectReason(() => createKinematicController(compositor, 2, value), 'invalid-dimensions')
    }
  })

  it('rejects invalid motions without changing state', () => {
    const state = createKinematicController(compositorWithLayers(2), 2, 3)
    addMotionTrack(state, 0, linear())
    const before = snapshot(state)

    const unknownMode: MotionTrack = JSON.parse('{"mode":"spline"}')
    const invalid: MotionTrack[] = [
      unknownMode,
      { ...linear(), y: [0, 1] },
      { ...linear(), x: [0, 1] },
      { mode: 'linear', times: [], x: [], y: [] },
      { mode: 'cubic', times: [0, 1, 2, 3], x: [0, 1, 2, 3], y: [0, 1, 2, 3] },
      { ...linear(), times: [0, 0, 1] },
      { ...linear(), times: [2, 1, 0] },
      { ...linear(), times: [0, NaN, 2] },
      { ...linear(), times: [0, 1, Infinity] },
      { ...linear(), x: [0, NaN, 0] },
      { ...linear(), x: [0, Infinity, 0] },
      { ...linear(), y: [0, -Infinity, 0] },
      { ...linear(), x: [0, 16_777_217, 0] },
      { ...linear(), y: [0, -16_777_217, 0] },
      { ...parametric(), periodMs: 0 },
      { ...parametric(), periodMs: -1 },
      { ...parametric(), centerX: NaN },
      { ...parametric(), centerY: Infinity },
      { ...parametric(), amplitudeX: NaN },
      { ...parametric(), amplitudeY: -Infinity },
      { ...parametric(), phaseMs: NaN },
      { ...parametric(), exponent: NaN },
      { ...parametric(), exponent: 0 },
      { ...parametric(), exponent: -1 },
      { ...parametric(), exponent: 1.5 },
      { ...parametric(), centerX: 16_777_216, amplitudeX: 1 },
      { ...parametric(), centerY: -16_777_216, amplitudeY: -1 }
    ]
    for (const motion of invalid) {
      expectReason(() => addMotionTrack(state, 1, motion), 'invalid-motion')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('rejects unknown layers, driven layers, and a full table without changing state', () => {
    const state = createKinematicController(compositorWithLayers(2, 3), 1, 3)
    const empty = snapshot(state)

    for (const layerId of [2, -1, 1.5, 3]) {
      expectReason(() => addMotionTrack(state, layerId, linear()), 'unknown-layer')
    }
    expect(snapshot(state)).toEqual(empty)

    addMotionTrack(state, 0, linear())
    const full = snapshot(state)
    expectReason(() => addMotionTrack(state, 0, cubic()), 'layer-already-driven')
    expectReason(() => addMotionTrack(state, 1, cubic()), 'capacity-exceeded')
    expect(snapshot(state)).toEqual(full)
  })

  it('rejects unknown track ids on remove', () => {
    const state = createKinematicController(compositorWithLayers(1), 2, 3)
    addMotionTrack(state, 0, linear())
    const before = snapshot(state)

    for (const trackId of [-1, 1.5, 2, 1]) {
      expectReason(() => removeMotionTrack(state, trackId), 'unknown-track')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('keeps independent controllers isolated', () => {
    const first = createKinematicController(compositorWithLayers(1), 1, 3)
    const second = createKinematicController(compositorWithLayers(1), 1, 3)

    addMotionTrack(first, 0, linear())

    expect(second.trackLayer[0]).toBe(-1)
    expect(addMotionTrack(second, 0, parametric())).toBe(0)
  })
})
