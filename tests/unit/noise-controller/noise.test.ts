import { describe, expect, it } from 'vitest'
import {
  NoiseError,
  createNoiseController,
  processFrame,
  reseed,
  setDose,
  setWindowLevel
} from '../../../src/core/noise-controller'
import type { GrayscaleImage, NoiseErrorReason, NoiseOptions, NoiseState } from '../../../src/core/noise-controller'

const side = 256

function constantImage(value: number): GrayscaleImage {
  return { width: side, height: side, data: new Uint8ClampedArray(side * side).fill(value) }
}

function frameOf(state: NoiseState, image: GrayscaleImage): number[] {
  return Array.from(processFrame(state, image).data)
}

function spread(values: number[]): { mean: number; deviation: number } {
  let sum = 0
  for (const value of values) sum += value
  const mean = sum / values.length
  let squares = 0
  for (const value of values) squares += (value - mean) * (value - mean)
  return { mean, deviation: Math.sqrt(squares / values.length) }
}

function noisy(value: number, options: NoiseOptions): { mean: number; deviation: number } {
  const state = createNoiseController(side, side, { seed: 12345, ...options })
  return spread(frameOf(state, constantImage(value)))
}

function snapshot(state: NoiseState) {
  return { dose: state.dose, sigmaTable: Array.from(state.sigmaTable), seed: state.rng[0] }
}

function expectReason(run: () => unknown, reason: NoiseErrorReason): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(NoiseError)
  expect(caught).toMatchObject({ reason })
}

function within(actual: number, expected: number, fraction: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(expected * fraction)
}

describe('noise off', () => {
  it('equals the window/level result and does not advance the generator by default', () => {
    const state = createNoiseController(16, 16, { window: 100, level: 100 })
    const data = Uint8ClampedArray.from({ length: 256 }, (_, index) => index)
    const image: GrayscaleImage = { width: 16, height: 16, data }
    const seed = state.rng[0]

    const first = frameOf(state, image)
    const second = frameOf(state, image)

    const expected = Array.from(data, (value) => state.windowTable[value] ?? 0)
    expect(first).toEqual(expected)
    expect(second).toEqual(expected)
    expect(state.rng[0]).toBe(seed)
  })

  it('has an all-zero sigma table for an infinite dose', () => {
    const state = createNoiseController(2, 2)
    expect(Array.from(state.sigmaTable).every((value) => value === 0)).toBe(true)

    setDose(state, 1000)
    setDose(state, Infinity)

    expect(Array.from(state.sigmaTable).every((value) => value === 0)).toBe(true)
  })
})

describe('quantum mottle statistics', () => {
  it('matches the quantum formula for a mid-gray frame', () => {
    const result = noisy(128, { dose: 1000 })

    expect(Math.abs(result.mean - 128)).toBeLessThan(0.5)
    within(result.deviation, 5.72, 0.05)
  })

  it('halves the deviation when the dose is quadrupled', () => {
    const low = noisy(128, { dose: 1000 })
    const high = noisy(128, { dose: 4000 })

    within(high.deviation / low.deviation, 0.5, 0.05)
  })

  it('grows with the square root of the signal', () => {
    const dark = noisy(48, { dose: 1000 })
    const bright = noisy(192, { dose: 1000 })

    within(bright.deviation / dark.deviation, 2, 0.05)
  })

  it('leaves a zero signal at zero', () => {
    const state = createNoiseController(side, side, { dose: 100 })
    expect(state.sigmaTable[0]).toBe(0)
    expect(frameOf(state, constantImage(0)).every((value) => value === 0)).toBe(true)
  })

  it('rebuilds the sigma table in place from the dose', () => {
    const state = createNoiseController(2, 2)
    const table = state.sigmaTable

    setDose(state, 1000)

    expect(state.sigmaTable).toBe(table)
    expect(state.dose).toBe(1000)
    expect(state.sigmaTable[128]).toBeCloseTo(Math.sqrt((255 * 128) / 1000), 5)
  })

  it('adds the noise before windowing', () => {
    const identity = noisy(128, { dose: 1000 })
    const windowed = noisy(128, { dose: 1000, window: 50, level: 128 })

    within(windowed.deviation / identity.deviation, 255 / 50, 0.05)
  })

  it('stays in range at a very low dose', () => {
    const state = createNoiseController(side, side, { dose: 0.01 })
    const values = frameOf(state, constantImage(128))

    expect(values.every((value) => value >= 0 && value <= 255)).toBe(true)
    expect(new Set(values).size).toBeGreaterThan(1)
  })

  it('never modifies the input image', () => {
    const state = createNoiseController(side, side, { dose: 500, seed: 3 })
    const image = constantImage(100)

    processFrame(state, image)

    expect(image.data.every((value) => value === 100)).toBe(true)
  })
})

describe('generator', () => {
  it('advances with every frame when the dose is finite', () => {
    const state = createNoiseController(8, 8, { dose: 500, seed: 9 })
    const before = state.rng[0]

    processFrame(state, constantImage8())

    expect(state.rng[0]).not.toBe(before)
  })

  it('reproduces the same frames for the same seed', () => {
    const first = createNoiseController(8, 8, { dose: 500, seed: 7 })
    const second = createNoiseController(8, 8, { dose: 500, seed: 7 })

    for (let frame = 0; frame < 3; frame++) {
      expect(frameOf(first, constantImage8())).toEqual(frameOf(second, constantImage8()))
    }
  })

  it('differs for different seeds and between successive frames', () => {
    const first = createNoiseController(8, 8, { dose: 500, seed: 7 })
    const other = createNoiseController(8, 8, { dose: 500, seed: 8 })

    const firstFrame = frameOf(first, constantImage8())
    const nextFrame = frameOf(first, constantImage8())

    expect(frameOf(other, constantImage8())).not.toEqual(firstFrame)
    expect(nextFrame).not.toEqual(firstFrame)
  })

  it('restores the sequence after reseed', () => {
    const state = createNoiseController(8, 8, { dose: 500, seed: 7 })
    const firstFrame = frameOf(state, constantImage8())
    frameOf(state, constantImage8())

    reseed(state, 7)

    expect(frameOf(state, constantImage8())).toEqual(firstFrame)
  })

  it('accepts the seed extremes', () => {
    const state = createNoiseController(2, 2, { dose: 500 })

    reseed(state, 0)
    expect(state.rng[0]).toBe(0)
    reseed(state, 4294967295)
    expect(state.rng[0]).toBe(4294967295)
  })
})

describe('validation', () => {
  it('rejects invalid doses without changing state', () => {
    const state = createNoiseController(2, 2, { dose: 500, seed: 5 })
    const before = snapshot(state)

    for (const dose of [0, -1, NaN, -Infinity]) {
      expectReason(() => setDose(state, dose), 'invalid-dose')
      expectReason(() => createNoiseController(2, 2, { dose }), 'invalid-dose')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('accepts an infinite dose', () => {
    const state = createNoiseController(2, 2, { dose: 500 })

    setDose(state, Infinity)

    expect(state.dose).toBe(Infinity)
    expect(createNoiseController(2, 2, { dose: Infinity }).dose).toBe(Infinity)
  })

  it('rejects invalid seeds without changing state', () => {
    const state = createNoiseController(2, 2, { dose: 500, seed: 5 })
    const before = snapshot(state)

    for (const seed of [1.5, -1, 4294967296, NaN, Infinity]) {
      expectReason(() => reseed(state, seed), 'invalid-seed')
      expectReason(() => createNoiseController(2, 2, { seed }), 'invalid-seed')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('keeps independent controllers isolated', () => {
    const first = createNoiseController(2, 2, { dose: 500, seed: 1 })
    const second = createNoiseController(2, 2, { dose: 500, seed: 1 })

    setDose(first, 50)
    setWindowLevel(first, 10, 10)
    reseed(first, 99)

    expect(second.dose).toBe(500)
    expect(second.window).toBe(255)
    expect(second.rng[0]).toBe(1)
  })
})

function constantImage8(): GrayscaleImage {
  return { width: 8, height: 8, data: new Uint8ClampedArray(64).fill(100) }
}
