import { describe, expect, it } from 'vitest'
import { addLayers, alphaMask, BlendError, subtractLayers } from '../../../src/core/grayscale-blending'
import type { GrayscaleImage } from '../../../src/core/grayscale-blending'

function image(data: number[], width = 2, height = 2): GrayscaleImage {
  return { width, height, data: new Uint8ClampedArray(data) }
}

function expectFailureWithoutWriting(run: (out: Uint8ClampedArray) => unknown): void {
  const out = new Uint8ClampedArray(4).fill(7)
  expect(() => run(out)).toThrow(BlendError)
  expect([...out]).toEqual([7, 7, 7, 7])
}

describe('grayscale blending add and subtract', () => {
  it('adds two layers and saturates overflow at 255', () => {
    const result = addLayers([
      image([200, 100, 0, 50]),
      image([100, 100, 0, 250])
    ])

    expect([...result]).toEqual([255, 200, 0, 255])
  })

  it('adds three layers pixel by pixel', () => {
    const result = addLayers([
      image([100, 0, 50, 255]),
      image([100, 0, 50, 1]),
      image([100, 0, 50, 0])
    ])

    expect([...result]).toEqual([255, 0, 150, 255])
  })

  it('subtracts a second layer and floors underflow at zero', () => {
    const result = subtractLayers([
      image([10, 100, 255, 0]),
      image([20, 40, 5, 0])
    ])

    expect([...result]).toEqual([0, 60, 250, 0])
  })

  it('subtracts later layers from the first layer in order', () => {
    const result = subtractLayers([
      image([100, 50, 10, 255]),
      image([30, 60, 5, 5]),
      image([20, 10, 10, 250])
    ])

    expect([...result]).toEqual([50, 0, 0, 0])
  })

  it('copies a single layer for both operations without returning its input buffer', () => {
    const input = image([8, 64, 128, 255])

    const added = addLayers([input])
    const subtracted = subtractLayers([input])

    expect([...added]).toEqual([...input.data])
    expect([...subtracted]).toEqual([...input.data])
    expect(added).not.toBe(input.data)
    expect(subtracted).not.toBe(input.data)
    expect(added).not.toBe(subtracted)
  })

  it('returns width times height pixels without modifying input buffers', () => {
    const layers = [image([1, 2, 3, 4]), image([5, 6, 7, 8])]
    const before = layers.map(layer => [...layer.data])

    const added = addLayers(layers)
    const subtracted = subtractLayers(layers)

    expect(added).toHaveLength(4)
    expect(subtracted).toHaveLength(4)
    expect(layers.map(layer => [...layer.data])).toEqual(before)
  })

  it.each([
    ['empty layer list', []],
    ['different widths', [image([1, 2, 3, 4]), image([1, 2], 1, 2)]],
    ['different heights', [image([1, 2, 3, 4]), image([1, 2], 2, 1)]],
    ['incorrect data length', [image([1, 2, 3])]],
    ['zero width', [image([1, 2], 0, 2)]],
    ['negative width', [image([1, 2], -1, 2)]],
    ['non-integer width', [image([1, 2, 3, 4], 2.5, 2)]],
    ['zero height', [image([1, 2], 2, 0)]],
    ['negative height', [image([1, 2], 2, -1)]],
    ['non-integer height', [image([1, 2, 3, 4], 2, 2.5)]]
  ])('rejects %s for addition and subtraction', (_case, layers) => {
    expect(() => addLayers(layers)).toThrow(BlendError)
    expect(() => subtractLayers(layers)).toThrow(BlendError)
  })
})

describe('grayscale blending alpha mask', () => {
  it('blends base and overlay proportionally through the mask', () => {
    const result = alphaMask(
      image([0, 100, 200, 50]),
      image([255, 200, 100, 150]),
      image([0, 255, 128, 64])
    )

    expect([...result]).toEqual([0, 200, 150, 75])
  })

  it('returns the base for a transparent mask and overlay for an opaque mask', () => {
    const base = image([0, 64, 128, 255])
    const overlay = image([255, 192, 64, 0])

    expect([...alphaMask(base, overlay, image([0, 0, 0, 0]))]).toEqual([...base.data])
    expect([...alphaMask(base, overlay, image([255, 255, 255, 255]))]).toEqual([...overlay.data])
  })

  it('does not modify the base, overlay, or mask', () => {
    const inputs = [image([1, 2, 3, 4]), image([5, 6, 7, 8]), image([9, 10, 11, 12])]
    const before = inputs.map(input => [...input.data])

    const result = alphaMask(inputs[0] as GrayscaleImage, inputs[1] as GrayscaleImage, inputs[2] as GrayscaleImage)

    expect(result).toHaveLength(4)
    expect(inputs.map(input => [...input.data])).toEqual(before)
    expect(result).not.toBe(inputs[0]?.data)
  })

  it.each([
    ['different overlay width', image([1, 2, 3, 4]), image([5, 6], 1, 2), image([9, 10, 11, 12])],
    ['different mask height', image([1, 2, 3, 4]), image([5, 6, 7, 8]), image([9, 10], 2, 1)],
    ['incorrect data length', image([1, 2, 3]), image([5, 6, 7, 8]), image([9, 10, 11, 12])],
    ['zero dimension', image([1, 2], 0, 2), image([5, 6], 0, 2), image([9, 10], 0, 2)],
    ['negative dimension', image([1, 2], -1, 2), image([5, 6], -1, 2), image([9, 10], -1, 2)],
    ['non-integer dimension', image([1, 2, 3, 4], 2.5, 2), image([5, 6, 7, 8], 2.5, 2), image([9, 10, 11, 12], 2.5, 2)]
  ])('rejects %s', (_case, base, overlay, mask) => {
    expect(() => alphaMask(base, overlay, mask)).toThrow(BlendError)
  })
})

describe('grayscale blending output reuse', () => {
  it('writes into and returns the supplied output for all operations', () => {
    const addOut = new Uint8ClampedArray(4)
    const subtractOut = new Uint8ClampedArray(4)
    const maskOut = new Uint8ClampedArray(4)

    expect(addLayers([image([10, 20, 30, 40]), image([1, 2, 3, 4])], addOut)).toBe(addOut)
    expect([...addOut]).toEqual([11, 22, 33, 44])
    expect(subtractLayers([image([10, 20, 30, 40]), image([1, 2, 3, 4])], subtractOut)).toBe(subtractOut)
    expect([...subtractOut]).toEqual([9, 18, 27, 36])
    expect(alphaMask(image([0, 100, 200, 50]), image([255, 200, 100, 150]), image([0, 255, 128, 64]), maskOut)).toBe(maskOut)
    expect([...maskOut]).toEqual([0, 200, 150, 75])
  })

  it('returns a new output buffer when one is not supplied', () => {
    const input = image([1, 2, 3, 4])
    const result = addLayers([input])

    expect(result).toBeInstanceOf(Uint8ClampedArray)
    expect(result).toHaveLength(4)
    expect(result).not.toBe(input.data)
  })

  it('supports output aliasing each input buffer', () => {
    const addOriginals = [[100, 100, 100, 100], [20, 30, 40, 50], [5, 6, 7, 8]]
    for (let aliasIndex = 0; aliasIndex < addOriginals.length; aliasIndex++) {
      const layers = addOriginals.map(values => image(values))
      const out = layers[aliasIndex]?.data as Uint8ClampedArray
      expect(addLayers(layers, out)).toBe(out)
      expect([...out]).toEqual([125, 136, 147, 158])
    }

    const subtractOriginals = [[100, 100, 100, 100], [20, 30, 40, 50], [5, 6, 7, 8]]
    for (let aliasIndex = 0; aliasIndex < subtractOriginals.length; aliasIndex++) {
      const layers = subtractOriginals.map(values => image(values))
      const out = layers[aliasIndex]?.data as Uint8ClampedArray
      expect(subtractLayers(layers, out)).toBe(out)
      expect([...out]).toEqual([75, 64, 53, 42])
    }

    const alphaValues = [[20, 40, 60, 80], [200, 180, 160, 140], [64, 128, 192, 255]]
    for (let aliasIndex = 0; aliasIndex < alphaValues.length; aliasIndex++) {
      const inputs = alphaValues.map(values => image(values))
      const out = inputs[aliasIndex]?.data as Uint8ClampedArray
      expect(alphaMask(inputs[0] as GrayscaleImage, inputs[1] as GrayscaleImage, inputs[2] as GrayscaleImage, out)).toBe(out)
      expect([...out]).toEqual([65, 110, 135, 140])
    }
  })

  it.each([0, 5])('rejects a supplied output of length %i without changing it', invalidLength => {
    const out = new Uint8ClampedArray(invalidLength).fill(7)
    const before = [...out]
    const layers = [image([10, 20, 30, 40]), image([1, 2, 3, 4])]

    expect(() => addLayers(layers, out)).toThrow(BlendError)
    expect(() => subtractLayers(layers, out)).toThrow(BlendError)
    expect(() => alphaMask(layers[0] as GrayscaleImage, layers[1] as GrayscaleImage, image([0, 128, 255, 64]), out)).toThrow(BlendError)
    expect([...out]).toEqual(before)
  })
})

describe('grayscale blending convergence coverage', () => {
  it.each([
    ['different width', [image([1, 2, 3, 4]), image([5, 6], 1, 2)]],
    ['different height', [image([1, 2, 3, 4]), image([5, 6], 2, 1)]],
    ['incorrect data length', [image([1, 2, 3])]],
    ['zero dimension', [image([1, 2], 0, 2)]],
    ['negative dimension', [image([1, 2], 2, -1)]],
    ['non-integer dimension', [image([1, 2, 3, 4], 2.5, 2)]]
  ])('leaves output unchanged after invalid add/subtract inputs: %s', (_case, layers) => {
    expectFailureWithoutWriting(out => addLayers(layers, out))
    expectFailureWithoutWriting(out => subtractLayers(layers, out))
  })

  it('leaves output unchanged for empty add/subtract inputs', () => {
    expectFailureWithoutWriting(out => addLayers([], out))
    expectFailureWithoutWriting(out => subtractLayers([], out))
  })

  it.each([
    ['overlay width mismatch', image([1, 2, 3, 4]), image([5, 6], 1, 2), image([9, 10, 11, 12])],
    ['mask height mismatch', image([1, 2, 3, 4]), image([5, 6, 7, 8]), image([9, 10], 2, 1)],
    ['overlay data length mismatch', image([1, 2, 3, 4]), image([5, 6, 7]), image([9, 10, 11, 12])],
    ['mask data length mismatch', image([1, 2, 3, 4]), image([5, 6, 7, 8]), image([9, 10, 11])],
    ['zero dimensions', image([1, 2], 0, 2), image([5, 6], 0, 2), image([9, 10], 0, 2)],
    ['negative dimensions', image([1, 2], -1, 2), image([5, 6], -1, 2), image([9, 10], -1, 2)],
    ['non-integer dimensions', image([1, 2, 3, 4], 2.5, 2), image([5, 6, 7, 8], 2.5, 2), image([9, 10, 11, 12], 2.5, 2)]
  ])('leaves output unchanged after invalid alpha-mask inputs: %s', (_case, base, overlay, mask) => {
    expectFailureWithoutWriting(out => alphaMask(base, overlay, mask, out))
  })

  it('covers two-layer saturation and output aliasing for add and subtract', () => {
    const addFirst = image([250, 10, 0, 100])
    const addSecond = image([10, 20, 1, 200])
    expect([...addLayers([addFirst, addSecond], new Uint8ClampedArray(4))]).toEqual([255, 30, 1, 255])

    for (const aliasIndex of [0, 1]) {
      const layers = [image([250, 10, 0, 100]), image([10, 20, 1, 200])]
      const out = layers[aliasIndex]?.data as Uint8ClampedArray
      expect(addLayers(layers, out)).toBe(out)
      expect([...out]).toEqual([255, 30, 1, 255])
    }

    const subtractFirst = image([5, 100, 0, 250])
    const subtractSecond = image([10, 20, 1, 200])
    expect([...subtractLayers([subtractFirst, subtractSecond], new Uint8ClampedArray(4))]).toEqual([0, 80, 0, 50])

    for (const aliasIndex of [0, 1]) {
      const layers = [image([5, 100, 0, 250]), image([10, 20, 1, 200])]
      const out = layers[aliasIndex]?.data as Uint8ClampedArray
      expect(subtractLayers(layers, out)).toBe(out)
      expect([...out]).toEqual([0, 80, 0, 50])
    }
  })
})
