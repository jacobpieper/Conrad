import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GrayscaleImage } from '../../../src/core/image-loader'
import {
  createRenderer,
  destroyRenderer,
  bindTarget,
  readSurface,
  RendererError,
  resize,
  unbindTarget,
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

  async function canvasPixels(canvas: OffscreenCanvas): Promise<Uint8Array> {
    const copy = new OffscreenCanvas(canvas.width, canvas.height)
    const context = copy.getContext('2d')
    if (context === null) throw new Error('2D canvas context unavailable')
    context.drawImage(canvas, 0, 0)
    return Uint8Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data)
  }

  function image(width: number, height: number, data?: Uint8ClampedArray): GrayscaleImage {
    const pixels = data ?? new Uint8ClampedArray(Math.max(0, width * height))
    return { width, height, data: pixels }
  }

  it('starts with a blank background surface and supports headless readback', async () => {
    const renderer = await create(3, 2)
    const expected = referenceFrame(null, 3, 2)
    expect(await surface(renderer)).toEqual(expected)
  })

  it('copies a viewport-sized image exactly into the surface', async () => {
    const renderer = await create(4, 4)
    const input = image(4, 4, Uint8ClampedArray.from({ length: 16 }, (_, index) => index * 13))

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
      Uint8ClampedArray.from({ length: imageWidth * imageHeight }, (_, index) => (index * 37 + 11) % 256)
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
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([20, 40, 60, 80])))
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([180, 160, 140, 120])))

    expect(await surface(renderer)).toEqual(referenceFrame(image(2, 2, new Uint8ClampedArray([180, 160, 140, 120])), 2, 2))
  })

  it('rejects malformed images and preserves the current surface', async () => {
    const renderer = await create(2, 2)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([25, 50, 75, 100])))
    const before = await surface(renderer)
    const maxDimension = renderer.device.limits.maxTextureDimension2D
    const invalidImages = [
      image(2, 2, new Uint8ClampedArray(3)),
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
    const firstImage = image(2, 2, new Uint8ClampedArray([10, 20, 30, 40]))
    const secondImage = image(2, 2, new Uint8ClampedArray([210, 220, 230, 240]))

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

  it('resizes and refits the active image at each new viewport size', async () => {
    const renderer = await create(4, 4)
    const input = image(3, 2, Uint8ClampedArray.from([10, 40, 70, 100, 130, 160]))
    updateBuffer(renderer, input)

    const sizes: [number, number][] = [[8, 4], [3, 7], [4, 4]]
    for (const [width, height] of sizes) {
      resize(renderer, width, height)
      expect(renderer.viewport).toEqual({ width, height })
      const actual = await surface(renderer)
      const expected = referenceFrame(input, width, height)
      for (let index = 0; index < expected.length; index++) {
        const difference = Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))
        expect(difference, `viewport ${width}x${height}, byte ${index}: actual ${actual[index]}, expected ${expected[index]}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('resizes a blank surface and leaves same-size calls unchanged', async () => {
    const renderer = await create(2, 3)
    resize(renderer, 5, 4)
    const blank = await surface(renderer)
    expect(blank).toEqual(referenceFrame(null, 5, 4))

    resize(renderer, 5, 4)

    expect(await surface(renderer)).toEqual(blank)
  })

  it('rejects invalid sizes without changing viewport or surface', async () => {
    const renderer = await create(3, 2)
    const before = await surface(renderer)
    const invalidSizes: [number, number][] = [
      [0, 10],
      [-1, 10],
      [10.5, 10],
      [renderer.device.limits.maxTextureDimension2D + 1, 1]
    ]

    for (const [width, height] of invalidSizes) {
      let caught: unknown
      try {
        resize(renderer, width, height)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(RendererError)
      expect(caught).toMatchObject({ reason: 'invalid-viewport' })
      expect(renderer.viewport).toEqual({ width: 3, height: 2 })
      expect(await surface(renderer)).toEqual(before)
    }
  })

  it('ends rapid consecutive resizes in a frame for the latest size', async () => {
    const renderer = await create(2, 2)
    const input = image(2, 2, new Uint8ClampedArray([15, 85, 155, 225]))
    updateBuffer(renderer, input)

    resize(renderer, 4, 3)
    resize(renderer, 7, 2)
    resize(renderer, 5, 6)

    expect(await surface(renderer)).toEqual(referenceFrame(input, 5, 6))
    await expect(readSurface(renderer, new Uint8Array(4 * 3 * 4))).rejects.toMatchObject({
      reason: 'invalid-output'
    })
  })

  it('binds a target and keeps its presentation synchronized with the surface', async () => {
    const renderer = await create(3, 2)
    const canvas = new OffscreenCanvas(1, 1)
    bindTarget(renderer, canvas)
    expect([canvas.width, canvas.height]).toEqual([3, 2])
    let currentSurface = await surface(renderer)
    expect(await canvasPixels(canvas)).toEqual(currentSurface)

    const input = image(2, 2, new Uint8ClampedArray([20, 80, 160, 240]))
    updateBuffer(renderer, input)
    currentSurface = await surface(renderer)
    expect(await canvasPixels(canvas)).toEqual(currentSurface)

    resize(renderer, 5, 4)
    expect([canvas.width, canvas.height]).toEqual([5, 4])
    currentSurface = await surface(renderer)
    expect(await canvasPixels(canvas)).toEqual(currentSurface)
  })

  it('stops updating an unbound target and replaces targets when rebound', async () => {
    const renderer = await create(2, 2)
    const firstCanvas = new OffscreenCanvas(1, 1)
    bindTarget(renderer, firstCanvas)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([10, 20, 30, 40])))
    const firstPixels = await canvasPixels(firstCanvas)

    unbindTarget(renderer)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([200, 210, 220, 230])))
    expect(await canvasPixels(firstCanvas)).toEqual(firstPixels)

    const secondCanvas = new OffscreenCanvas(1, 1)
    bindTarget(renderer, secondCanvas)
    expect(await canvasPixels(secondCanvas)).toEqual(await surface(renderer))
    const secondInitialPixels = await canvasPixels(secondCanvas)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([60, 90, 120, 150])))
    expect(await canvasPixels(secondCanvas)).not.toEqual(secondInitialPixels)
    expect(await canvasPixels(firstCanvas)).toEqual(firstPixels)
  })

  it('preserves the active target when a replacement canvas cannot provide WebGPU', async () => {
    const renderer = await create(2, 2)
    const activeCanvas = new OffscreenCanvas(1, 1)
    bindTarget(renderer, activeCanvas)
    const activeTarget = renderer.target
    if (activeTarget === null) throw new Error('Target did not bind')
    const previousPixels = await canvasPixels(activeCanvas)

    const incompatibleCanvas = new OffscreenCanvas(1, 1)
    incompatibleCanvas.getContext('2d')
    expect(() => bindTarget(renderer, incompatibleCanvas)).toThrowError(RendererError)

    expect(renderer.target).toBe(activeTarget)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([30, 80, 130, 180])))
    expect(await canvasPixels(activeCanvas)).not.toEqual(previousPixels)
  })

  it('keeps presenting when rebinding the same canvas', async () => {
    const renderer = await create(2, 2)
    const canvas = new OffscreenCanvas(1, 1)
    bindTarget(renderer, canvas)
    updateBuffer(renderer, image(2, 2, new Uint8ClampedArray([10, 50, 90, 130])))

    bindTarget(renderer, canvas)
    expect(await canvasPixels(canvas)).toEqual(await surface(renderer))

    const nextImage = image(2, 2, new Uint8ClampedArray([40, 80, 120, 160]))
    updateBuffer(renderer, nextImage)
    expect(await canvasPixels(canvas)).toEqual(await surface(renderer))

    resize(renderer, 3, 3)
    expect(await canvasPixels(canvas)).toEqual(await surface(renderer))
  })
})
