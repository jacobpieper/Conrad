import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GrayscaleImage } from '../../../src/core/image-loader'
import {
  createRenderer,
  destroyRenderer,
  readSurface,
  RendererError,
  updateBuffer
} from '../../../src/core/headless-renderer'
import type { RendererState } from '../../../src/core/headless-renderer'
import { referenceFrame } from './reference'

describe('headless renderer image updates', () => {
  let renderers: RendererState[]

  beforeEach(() => {
    renderers = []
  })

  afterEach(() => {
    for (const renderer of renderers) destroyRenderer(renderer)
  })

  async function create(width: number, height: number): Promise<RendererState> {
    const renderer = await createRenderer(width, height)
    renderers.push(renderer)
    return renderer
  }

  async function surface(renderer: RendererState): Promise<Uint8Array> {
    const { width, height } = renderer.viewport
    const pixels = new Uint8Array(width * height * 4)
    await readSurface(renderer, pixels)
    return pixels
  }

  function image(width: number, height: number, data?: Uint8Array): GrayscaleImage {
    const pixels = data ?? new Uint8Array(Math.max(0, width * height))
    return { width, height, data: pixels }
  }

  it('starts with a blank background surface and supports headless readback', async () => {
    const renderer = await create(3, 2)
    const expected = referenceFrame(null, 3, 2)
    expect(await surface(renderer)).toEqual(expected)
  })

  it('copies a viewport-sized image exactly into the surface', async () => {
    const renderer = await create(4, 4)
    const input = image(4, 4, Uint8Array.from({ length: 16 }, (_, index) => index * 13))

    updateBuffer(renderer, input)

    const pixels = await surface(renderer)
    for (let index = 0; index < input.data.length; index++) {
      const offset = index * 4
      expect(pixels[offset]).toBe(input.data[index])
      expect(pixels[offset + 1]).toBe(input.data[index])
      expect(pixels[offset + 2]).toBe(input.data[index])
      expect(pixels[offset + 3]).toBe(255)
    }
  })

  it.each([
    { name: 'smaller with matching aspect ratio', viewport: [6, 6], imageSize: [3, 3] },
    { name: 'larger with matching aspect ratio', viewport: [3, 3], imageSize: [6, 6] },
    { name: 'pillarboxed', viewport: [6, 4], imageSize: [2, 4] },
    { name: 'letterboxed', viewport: [4, 6], imageSize: [4, 2] },
    { name: 'different aspect ratio', viewport: [7, 5], imageSize: [3, 2] }
  ])('fits a $name image to the reference output', async ({ viewport, imageSize }) => {
    const viewportWidth = viewport[0] ?? 1
    const viewportHeight = viewport[1] ?? 1
    const imageWidth = imageSize[0] ?? 1
    const imageHeight = imageSize[1] ?? 1
    const renderer = await create(viewportWidth, viewportHeight)
    const input = image(
      imageWidth,
      imageHeight,
      Uint8Array.from({ length: imageWidth * imageHeight }, (_, index) => (index * 37 + 11) % 256)
    )

    updateBuffer(renderer, input)

    const actual = await surface(renderer)
    const expected = referenceFrame(input, viewportWidth, viewportHeight)
    for (let index = 0; index < expected.length; index++) {
      expect(Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))).toBeLessThanOrEqual(1)
    }
  })

  it('fully replaces the previous image', async () => {
    const renderer = await create(2, 2)
    updateBuffer(renderer, image(2, 2, new Uint8Array([20, 40, 60, 80])))
    updateBuffer(renderer, image(2, 2, new Uint8Array([180, 160, 140, 120])))

    expect(await surface(renderer)).toEqual(referenceFrame(image(2, 2, new Uint8Array([180, 160, 140, 120])), 2, 2))
  })

  it('rejects malformed images and preserves the current surface', async () => {
    const renderer = await create(2, 2)
    updateBuffer(renderer, image(2, 2, new Uint8Array([25, 50, 75, 100])))
    const before = await surface(renderer)
    const maxDimension = renderer.device.limits.maxTextureDimension2D
    const invalidImages = [
      image(2, 2, new Uint8Array(3)),
      image(0, 2),
      image(-1, 2),
      image(1.5, 2),
      image(2, 0),
      image(2, -1),
      image(2, 1.5),
      image(maxDimension + 1, 1)
    ]

    for (const invalidImage of invalidImages) {
      let caught: unknown
      try {
        updateBuffer(renderer, invalidImage)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(RendererError)
      expect(caught).toMatchObject({ reason: 'invalid-image' })
      expect(await surface(renderer)).toEqual(before)
    }
  })

  it('keeps independent renderers isolated', async () => {
    const firstRenderer = await create(2, 2)
    const secondRenderer = await create(2, 2)
    const firstImage = image(2, 2, new Uint8Array([10, 20, 30, 40]))
    const secondImage = image(2, 2, new Uint8Array([210, 220, 230, 240]))

    updateBuffer(firstRenderer, firstImage)
    updateBuffer(secondRenderer, secondImage)

    expect(await surface(firstRenderer)).toEqual(referenceFrame(firstImage, 2, 2))
    expect(await surface(secondRenderer)).toEqual(referenceFrame(secondImage, 2, 2))
  })

  it('rejects readback buffers with the wrong size', async () => {
    const renderer = await create(2, 2)
    await expect(readSurface(renderer, new Uint8Array(15))).rejects.toMatchObject({
      reason: 'invalid-output'
    })
  })
})
