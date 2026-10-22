import { describe, it, expect } from 'vitest'
import { toGrayscale } from '../../../src/core/image-loader/to-grayscale'

describe('toGrayscale', () => {
  it('converts known RGBA pixels to BT.601 luma within 1% tolerance', () => {
    // 2x2 image: red, green, blue, white
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255
    ])
    const expected = [76, 150, 29, 255]

    const result = toGrayscale(rgba, 2, 2)

    expect(result.length).toBe(4)
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs((result[i] as number) - (expected[i] as number))).toBeLessThanOrEqual(2.55)
    }
  })

  it('produces a buffer whose length equals width * height', () => {
    const width = 3
    const height = 5
    const rgba = new Uint8ClampedArray(width * height * 4)
    const result = toGrayscale(rgba, width, height)
    expect(result.length).toBe(width * height)
  })

  it('writes into a provided output buffer instead of allocating a new one', () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255])
    const out = new Uint8ClampedArray(1)
    const result = toGrayscale(rgba, 1, 1, out)
    expect(result).toBe(out)
  })
})
