import { describe, expect, it } from 'vitest'
import { expandGrayscale } from '../../../src/lib/viewport/expand'

function packedGray(value: number): number {
  return (0xff000000 | (value * 0x010101)) >>> 0
}

describe('expandGrayscale', () => {
  it('expands grayscale bytes to opaque RGBA words and little-endian bytes', () => {
    const source = Uint8Array.from([0, 1, 127, 128, 254, 255])
    const output = new Uint32Array(source.length)
    const expected = new Uint32Array(source.length)

    expandGrayscale(source, output)

    for (let index = 0; index < source.length; index++) {
      const value = source[index] ?? 0
      expected[index] = packedGray(value)
      expect(output[index]).toBe(expected[index])
    }
    expect(new Uint8Array(output.buffer)).toEqual(
      Uint8Array.from([0, 0, 0, 255, 1, 1, 1, 255, 127, 127, 127, 255, 128, 128, 128, 255, 254, 254, 254, 255, 255, 255, 255, 255])
    )
    expect(source).toEqual(Uint8Array.from([0, 1, 127, 128, 254, 255]))
  })

  it('accepts a Uint8ClampedArray source', () => {
    const source = Uint8ClampedArray.from([16, 64, 192])
    const output = new Uint32Array(source.length)

    expandGrayscale(source, output)

    expect(output).toEqual(Uint32Array.from(source, packedGray))
  })

  it('does nothing for empty arrays', () => {
    const output = new Uint32Array(0)

    expect(() => expandGrayscale(new Uint8Array(0), output)).not.toThrow()
    expect(output).toEqual(new Uint32Array(0))
  })

  it('uses target length and fills missing source values as opaque black', () => {
    const longerSource = Uint8Array.from([12, 34, 56])
    const shorterOutput = new Uint32Array(2)
    expandGrayscale(longerSource, shorterOutput)
    expect(shorterOutput).toEqual(Uint32Array.from([packedGray(12), packedGray(34)]))

    const shorterSource = Uint8Array.from([12])
    const longerOutput = new Uint32Array(3).fill(0x12345678)
    expandGrayscale(shorterSource, longerOutput)
    expect(longerOutput).toEqual(
      Uint32Array.from([packedGray(12), packedGray(0), packedGray(0)])
    )
  })
})
