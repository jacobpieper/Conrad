import { describe, expect, it } from 'vitest'
import {
  NoiseError,
  createNoiseController,
  processFrame,
  setWindowLevel
} from '../../../src/core/noise-controller'
import type { GrayscaleImage, NoiseErrorReason, NoiseState } from '../../../src/core/noise-controller'

function rowImage(values: number[]): GrayscaleImage {
  return { width: values.length, height: 1, data: Uint8ClampedArray.from(values) }
}

function processRow(state: NoiseState, values: number[]): number[] {
  return Array.from(processFrame(state, rowImage(values)).data)
}

function snapshot(state: NoiseState) {
  return { window: state.window, level: state.level, windowTable: Array.from(state.windowTable) }
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

describe('window/level mapping', () => {
  it('leaves every byte unchanged with the default window and level', () => {
    const state = createNoiseController(16, 16)
    const data = Uint8ClampedArray.from({ length: 256 }, (_, index) => index)
    const image: GrayscaleImage = { width: 16, height: 16, data }

    const result = processFrame(state, image)

    expect(Array.from(result.data)).toEqual(Array.from({ length: 256 }, (_, index) => index))
    for (let value = 0; value < 256; value++) expect(state.windowTable[value]).toBe(value)
  })

  it('maps bytes with a narrowed window', () => {
    const state = createNoiseController(7, 1, { window: 100, level: 100 })
    expect(processRow(state, [0, 50, 75, 100, 125, 150, 200])).toEqual([0, 0, 64, 128, 191, 255, 255])
  })

  it('compresses with a window wider than the byte range', () => {
    const state = createNoiseController(3, 1, { window: 510, level: 255 })
    expect(processRow(state, [0, 100, 255])).toEqual([0, 50, 128])
  })

  it('stretches a small window around its level', () => {
    const state = createNoiseController(2, 1, { window: 50, level: 128 })
    expect(processRow(state, [103, 153])).toEqual([0, 255])
  })

  it('applies setWindowLevel in place and uses it on the next frame', () => {
    const state = createNoiseController(3, 1)
    const table = state.windowTable
    expect(processRow(state, [50, 100, 150])).toEqual([50, 100, 150])

    setWindowLevel(state, 100, 100)

    expect(state.windowTable).toBe(table)
    expect(state.window).toBe(100)
    expect(state.level).toBe(100)
    expect(processRow(state, [50, 100, 150])).toEqual([0, 128, 255])

    const viaOptions = createNoiseController(3, 1, { window: 100, level: 100 })
    expect(Array.from(viaOptions.windowTable)).toEqual(Array.from(state.windowTable))
  })

  it('never modifies the input and returns the same reusable output', () => {
    const state = createNoiseController(4, 1, { window: 100, level: 100 })
    const image = rowImage([0, 75, 100, 150])
    const copy = Uint8ClampedArray.from(image.data)

    const first = processFrame(state, image)
    const second = processFrame(state, image)

    expect(Array.from(image.data)).toEqual(Array.from(copy))
    expect(first).toBe(state.output)
    expect(second).toBe(first)
    expect(second.data).toBe(first.data)
    expect(first).not.toBe(image)
    expect(first.data).not.toBe(image.data)
    expect([first.width, first.height]).toEqual([4, 1])
  })

  it('accepts its own output as input because the mapping is per pixel', () => {
    const state = createNoiseController(3, 1, { window: 100, level: 100 })
    state.output.data.set([50, 100, 150])

    processFrame(state, state.output)

    expect(Array.from(state.output.data)).toEqual([0, 128, 255])
  })

  it('rejects invalid window and level values without changing state', () => {
    const state = createNoiseController(2, 1, { window: 100, level: 100 })
    const before = snapshot(state)

    for (const window of [0, -1, NaN, Infinity, -Infinity]) {
      expectReason(() => setWindowLevel(state, window, 100), 'invalid-window-level')
      expectReason(() => createNoiseController(2, 1, { window }), 'invalid-window-level')
    }
    for (const level of [NaN, Infinity, -Infinity]) {
      expectReason(() => setWindowLevel(state, 100, level), 'invalid-window-level')
      expectReason(() => createNoiseController(2, 1, { level }), 'invalid-window-level')
    }
    expect(snapshot(state)).toEqual(before)
  })

  it('rejects invalid dimensions', () => {
    for (const value of [0, -1, 1.5]) {
      expectReason(() => createNoiseController(value, 2), 'invalid-dimensions')
      expectReason(() => createNoiseController(2, value), 'invalid-dimensions')
    }
  })

  it('rejects images that do not match the controller and leaves the output unchanged', () => {
    const state = createNoiseController(2, 2)
    processFrame(state, { width: 2, height: 2, data: Uint8ClampedArray.from([1, 2, 3, 4]) })
    const before = Array.from(state.output.data)

    const wrongWidth: GrayscaleImage = { width: 4, height: 2, data: new Uint8ClampedArray(4) }
    const wrongHeight: GrayscaleImage = { width: 2, height: 1, data: new Uint8ClampedArray(4) }
    const wrongLength: GrayscaleImage = { width: 2, height: 2, data: new Uint8ClampedArray(3) }
    for (const image of [wrongWidth, wrongHeight, wrongLength]) {
      expectReason(() => processFrame(state, image), 'invalid-image')
    }
    expect(Array.from(state.output.data)).toEqual(before)
  })

  it('keeps independent controllers isolated', () => {
    const first = createNoiseController(2, 1, { window: 100, level: 100 })
    const second = createNoiseController(2, 1)

    setWindowLevel(first, 50, 50)

    expect(second.window).toBe(255)
    expect(second.windowTable[10]).toBe(10)
  })
})
