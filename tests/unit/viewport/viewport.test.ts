import { afterEach, describe, expect, it } from 'vitest'
import type { GrayscaleImage } from '../../../src/lib/viewport'
import { mountViewport } from './helpers'

describe('Viewport rendering', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('renders grayscale frames into a fixed-size crisp canvas', () => {
    const mounted = mountViewport({ width: 4, height: 4, containerWidth: 200, containerHeight: 200 })
    cleanup = mounted.unmount
    const { canvas, viewport } = mounted
    const data = Uint8ClampedArray.from({ length: 16 }, (_, index) => index * 17)
    const frame: GrayscaleImage = { width: 4, height: 4, data }

    viewport.render(frame)

    expect(canvas.width).toBe(4)
    expect(canvas.height).toBe(4)
    expect(getComputedStyle(canvas).imageRendering).toBe('pixelated')
    expect(getComputedStyle(canvas).touchAction).toBe('none')
    expect(canvas.getContext('2d')?.imageSmoothingEnabled).toBe(false)
    expect(readPixels(canvas)).toEqual(expandBytes(data))

    const nextData = Uint8ClampedArray.from({ length: 16 }, (_, index) => 255 - index * 13)
    viewport.render({ width: 4, height: 4, data: nextData })
    expect(readPixels(canvas)).toEqual(expandBytes(nextData))
  })

  it('rejects invalid frames without changing existing canvas pixels', () => {
    const mounted = mountViewport({ width: 2, height: 2, containerWidth: 40, containerHeight: 40 })
    cleanup = mounted.unmount
    const { canvas, viewport } = mounted
    const frame: GrayscaleImage = {
      width: 2,
      height: 2,
      data: Uint8ClampedArray.from([20, 80, 140, 200])
    }
    viewport.render(frame)
    const before = readPixels(canvas)

    expect(() => viewport.render({ ...frame, width: 3 })).toThrowError(
      expect.objectContaining({ reason: 'invalid-frame' })
    )
    expect(() => viewport.render({ ...frame, height: 3 })).toThrowError(
      expect.objectContaining({ reason: 'invalid-frame' })
    )
    expect(() => viewport.render({ ...frame, data: new Uint8ClampedArray(3) })).toThrowError(
      expect.objectContaining({ reason: 'invalid-frame' })
    )
    expect(readPixels(canvas)).toEqual(before)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid width of %s synchronously',
    (width) => {
      expect(() =>
        mountViewport({ width, height: 2, containerWidth: 40, containerHeight: 40 })
      ).toThrowError(expect.objectContaining({ reason: 'invalid-grid' }))
    }
  )

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid height of %s synchronously',
    (height) => {
      expect(() =>
        mountViewport({ width: 2, height, containerWidth: 40, containerHeight: 40 })
      ).toThrowError(expect.objectContaining({ reason: 'invalid-grid' }))
    }
  )
})

function readPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('2D canvas context unavailable')
  return context.getImageData(0, 0, canvas.width, canvas.height).data
}

function expandBytes(data: Uint8ClampedArray): Uint8ClampedArray {
  const expanded = new Uint8ClampedArray(data.length * 4)
  for (let index = 0; index < data.length; index++) {
    const value = data[index] ?? 0
    const offset = index * 4
    expanded[offset] = value
    expanded[offset + 1] = value
    expanded[offset + 2] = value
    expanded[offset + 3] = 255
  }
  return expanded
}
