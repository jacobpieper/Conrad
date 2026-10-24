import { describe, expect, it } from 'vitest'
import {
  CompositorError,
  createCompositor,
  registerLayer,
  unregisterLayer
} from '../../../src/core/compositor-core'
import {
  KinematicError,
  addMotionTrack,
  createKinematicController,
  evaluateMotion,
  removeMotionTrack
} from '../../../src/core/kinematic-controller'
import type { MotionTrack, ParametricMotion } from '../../../src/core/kinematic-controller'

const hillTimes = [0, 1000, 2000]
const hillX = [0, 10, 0]

function offsetsAfter(motion: MotionTrack, timeMs: number): [number, number] {
  const compositor = createCompositor(2, 2, 1)
  registerLayer(compositor, new Uint8Array(4), 1)
  const state = createKinematicController(compositor, 1, 8)
  addMotionTrack(state, 0, motion)
  evaluateMotion(state, timeMs)
  return [compositor.offsetsX[0] ?? NaN, compositor.offsetsY[0] ?? NaN]
}

function offsetX(motion: MotionTrack, timeMs: number): number {
  return offsetsAfter(motion, timeMs)[0]
}

function hill(mode: 'linear' | 'cubic'): MotionTrack {
  return { mode, times: hillTimes, x: hillX, y: [0, 0, 0] }
}

function wave(overrides: Partial<ParametricMotion> = {}): ParametricMotion {
  return {
    mode: 'parametric',
    centerX: 0,
    centerY: 0,
    amplitudeX: 10,
    amplitudeY: 0,
    periodMs: 4000,
    phaseMs: 0,
    exponent: 1,
    ...overrides
  }
}

describe('evaluateMotion linear', () => {
  it.each([
    { timeMs: 500, expected: 5 },
    { timeMs: 1000, expected: 10 },
    { timeMs: 1500, expected: 5 },
    { timeMs: -100, expected: 0 },
    { timeMs: 5000, expected: 0 }
  ])('gives $expected at $timeMs', ({ timeMs, expected }) => {
    expect(offsetX(hill('linear'), timeMs)).toBe(expected)
  })
})

describe('evaluateMotion cubic', () => {
  it.each([
    { timeMs: 500, expected: 6 },
    { timeMs: 1000, expected: 10 },
    { timeMs: 1500, expected: 6 },
    { timeMs: -100, expected: 0 },
    { timeMs: 5000, expected: 0 }
  ])('gives $expected at $timeMs', ({ timeMs, expected }) => {
    expect(offsetX(hill('cubic'), timeMs)).toBe(expected)
  })

  it('matches linear when there are only two keyframes', () => {
    for (const timeMs of [0, 300, 500, 1000]) {
      const keyframes = { times: [0, 1000], x: [0, 10], y: [0, 0] }
      expect(offsetX({ mode: 'cubic', ...keyframes }, timeMs)).toBe(
        offsetX({ mode: 'linear', ...keyframes }, timeMs)
      )
    }
  })

  it('stays within the keyframe values at the segment ends', () => {
    const motion: MotionTrack = {
      mode: 'cubic',
      times: [0, 100, 300, 400],
      x: [0, 20, 20, 0],
      y: [0, 0, 0, 0]
    }
    expect(offsetX(motion, 0)).toBe(0)
    expect(offsetX(motion, 100)).toBe(20)
    expect(offsetX(motion, 300)).toBe(20)
    expect(offsetX(motion, 400)).toBe(0)
  })
})

describe('evaluateMotion keyframe details', () => {
  it('holds a single keyframe constant in both modes', () => {
    for (const mode of ['linear', 'cubic'] as const) {
      const motion: MotionTrack = { mode, times: [100], x: [7], y: [-3] }
      for (const timeMs of [-50, 100, 5000]) {
        expect(offsetsAfter(motion, timeMs)).toEqual([7, -3])
      }
    }
  })

  it('evaluates Y independently of X', () => {
    const motion: MotionTrack = { mode: 'linear', times: [0, 1000], x: [0, 10], y: [20, 0] }
    expect(offsetsAfter(motion, 500)).toEqual([5, 10])
    expect(offsetsAfter(motion, 1000)).toEqual([10, 0])
  })

  it('rounds to the nearest integer with ties toward positive infinity', () => {
    expect(offsetX({ mode: 'linear', times: [0, 1000], x: [0, 1], y: [0, 0] }, 500)).toBe(1)
    expect(offsetX({ mode: 'linear', times: [0, 1000], x: [0, -1], y: [0, 0] }, 500)).toBe(0)
    expect(offsetX({ mode: 'linear', times: [0, 1000], x: [0, -3], y: [0, 0] }, 500)).toBe(-1)
  })
})

describe('evaluateMotion parametric', () => {
  it('is an exact sinusoid with exponent 1, periodic and valid for negative times', () => {
    expect(offsetX(wave(), 0)).toBe(10)
    expect(offsetX(wave(), 1000)).toBe(0)
    expect(offsetX(wave(), 2000)).toBe(-10)
    expect(offsetX(wave(), 4000)).toBe(10)
    expect(offsetX(wave(), 8000)).toBe(10)
    expect(offsetX(wave(), -1000)).toBe(0)
    expect(offsetX(wave(), -2000)).toBe(-10)
  })

  it('gives the respiratory shape with a larger exponent', () => {
    expect(offsetX(wave({ exponent: 2 }), 0)).toBe(10)
    expect(offsetX(wave({ exponent: 2 }), 1000)).toBe(-5)
    expect(offsetX(wave({ exponent: 2 }), 2000)).toBe(-10)
  })

  it('applies phase, center, and amplitude sign', () => {
    expect(offsetX(wave({ phaseMs: 1000 }), 1000)).toBe(10)
    expect(offsetX(wave({ centerX: 5 }), 0)).toBe(15)
    expect(offsetX(wave({ amplitudeX: -10 }), 0)).toBe(-10)
  })

  it('evaluates both axes with their own center and amplitude', () => {
    const motion = wave({ centerX: 1, amplitudeX: 4, centerY: -2, amplitudeY: 6 })
    expect(offsetsAfter(motion, 0)).toEqual([5, 4])
    expect(offsetsAfter(motion, 2000)).toEqual([-3, -8])
  })
})

describe('evaluateMotion on a controller', () => {
  it('updates every track in one call and leaves untracked layers alone', () => {
    const compositor = createCompositor(2, 2, 4)
    const pixels = Uint8Array.from([1, 2, 3, 4])
    const pixelsCopy = Uint8Array.from(pixels)
    for (let layer = 0; layer < 3; layer++) registerLayer(compositor, new Uint8Array(4), 0.3)
    registerLayer(compositor, pixels, 0.3)
    const state = createKinematicController(compositor, 3, 3)
    addMotionTrack(state, 0, hill('linear'))
    addMotionTrack(state, 1, hill('cubic'))
    addMotionTrack(state, 2, wave())

    evaluateMotion(state, 500)

    expect([compositor.offsetsX[0], compositor.offsetsX[1], compositor.offsetsX[2]]).toEqual([5, 6, 7])
    expect(compositor.offsetsX[3]).toBe(0)
    expect(compositor.offsetsY[3]).toBe(0)
    expect(compositor.weights[3]).toBeCloseTo(0.3, 6)
    expect(compositor.active[3]).toBe(1)
    expect(compositor.layers[3]).toBe(pixels)
    expect(Array.from(pixels)).toEqual(Array.from(pixelsCopy))
  })

  it('never mutates the layer buffers over many evaluations', () => {
    const compositor = createCompositor(2, 2, 2)
    const first = Uint8Array.from([9, 8, 7, 6])
    const second = Uint8ClampedArray.from([1, 2, 3, 4])
    registerLayer(compositor, first, 1)
    registerLayer(compositor, second, 1)
    const state = createKinematicController(compositor, 2, 3)
    addMotionTrack(state, 0, hill('cubic'))
    addMotionTrack(state, 1, wave())

    for (let timeMs = -500; timeMs < 3000; timeMs += 37) evaluateMotion(state, timeMs)

    expect(compositor.layers[0]).toBe(first)
    expect(compositor.layers[1]).toBe(second)
    expect(Array.from(first)).toEqual([9, 8, 7, 6])
    expect(Array.from(second)).toEqual([1, 2, 3, 4])
  })

  it('depends only on the time given', () => {
    const compositor = createCompositor(2, 2, 1)
    registerLayer(compositor, new Uint8Array(4), 1)
    const state = createKinematicController(compositor, 1, 3)
    addMotionTrack(state, 0, hill('cubic'))

    const seen: number[] = []
    for (const timeMs of [500, 1500, 500]) {
      evaluateMotion(state, timeMs)
      seen.push(compositor.offsetsX[0] ?? NaN)
    }

    expect(seen).toEqual([6, 6, 6])
    evaluateMotion(state, 100)
    const early = compositor.offsetsX[0]
    evaluateMotion(state, 1900)
    evaluateMotion(state, 100)
    expect(compositor.offsetsX[0]).toBe(early)
  })

  it('keeps the last offset after a track is removed', () => {
    const compositor = createCompositor(2, 2, 1)
    registerLayer(compositor, new Uint8Array(4), 1)
    const state = createKinematicController(compositor, 1, 3)
    const track = addMotionTrack(state, 0, hill('linear'))
    evaluateMotion(state, 500)

    removeMotionTrack(state, track)
    evaluateMotion(state, 1000)

    expect(compositor.offsetsX[0]).toBe(5)
  })

  it('rejects non-finite times without writing anything', () => {
    const compositor = createCompositor(2, 2, 1)
    registerLayer(compositor, new Uint8Array(4), 1)
    const state = createKinematicController(compositor, 1, 3)
    addMotionTrack(state, 0, hill('linear'))
    evaluateMotion(state, 500)

    for (const timeMs of [NaN, Infinity, -Infinity]) {
      let caught: unknown
      try {
        evaluateMotion(state, timeMs)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(KinematicError)
      expect(caught).toMatchObject({ reason: 'invalid-time' })
    }
    expect(compositor.offsetsX[0]).toBe(5)
  })

  it('surfaces the compositor error when a tracked layer was unregistered', () => {
    const compositor = createCompositor(2, 2, 1)
    registerLayer(compositor, new Uint8Array(4), 1)
    const state = createKinematicController(compositor, 1, 3)
    addMotionTrack(state, 0, hill('linear'))
    unregisterLayer(compositor, 0)

    let caught: unknown
    try {
      evaluateMotion(state, 500)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CompositorError)
    expect(caught).toMatchObject({ reason: 'unknown-layer' })
  })
})
