import { describe, it, expect, inject } from 'vitest'
import { loadImageFromUrl, loadImageFromBlob, loadImage } from '../../../src/core/image-loader/load-image'
import { ImageLoadError } from '../../../src/core/image-loader/errors'
import {
  TEST_PNG_DATA_URI,
  CORRUPTED_PNG_DATA_URI,
  NON_IMAGE_TEXT,
  dataUriToBlob,
} from './fixtures'

describe('loadImageFromUrl', () => {
  it('rejects an empty URL with an empty-input error', async () => {
    await expect(loadImageFromUrl('')).rejects.toMatchObject({ reason: 'empty-input' })
  })

  it('decodes a PNG data URI into a grayscale buffer matching the reference conversion', async () => {
    const result = await loadImageFromUrl(TEST_PNG_DATA_URI)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(result.data.length).toBe(result.width * result.height)
    expect(result.data).toBeInstanceOf(Uint8ClampedArray)
    expect(result.data[0]).toBeGreaterThanOrEqual(0)
    expect(result.data[0]).toBeLessThanOrEqual(255)
  })

  it('rejects with ImageLoadError(reason: "network") for an unreachable URL', async () => {
    await expect(loadImageFromUrl('https://example.invalid/missing.png')).rejects.toMatchObject({
      reason: 'network'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('loadImageFromBlob', () => {
  it('decodes a PNG Blob into the same grayscale buffer as the URL path', async () => {
    const blob = dataUriToBlob(TEST_PNG_DATA_URI)
    const result = await loadImageFromBlob(blob)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(Array.from(result.data)).toEqual(Array.from((await loadImageFromUrl(TEST_PNG_DATA_URI)).data))
  })

  it.each(['image/jpeg', 'image/webp'])('decodes browser-encoded %s into a grayscale buffer', async (type) => {
    const sourceBitmap = await createImageBitmap(dataUriToBlob(TEST_PNG_DATA_URI))
    const canvas = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height)
    const context = canvas.getContext('2d')
    expect(context).not.toBeNull()
    context?.drawImage(sourceBitmap, 0, 0)
    sourceBitmap.close()

    const encodedBlob = await canvas.convertToBlob({ type })
    expect(encodedBlob.type).toBe(type)

    const result = await loadImageFromBlob(encodedBlob)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(result.data.length).toBe(1)
  })

  it('loads browser-encoded JPEG and WebP through the URL path', async () => {
    const bitmap = await createImageBitmap(dataUriToBlob(TEST_PNG_DATA_URI))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context?.drawImage(bitmap, 0, 0)
    bitmap.close()

    for (const type of ['image/jpeg', 'image/webp']) {
      const blob = await canvas.convertToBlob({ type })
      expect(blob.type).toBe(type)
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Failed to read encoded image'))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const result = await loadImageFromUrl(dataUri)
      expect(result.width).toBe(1)
      expect(result.height).toBe(1)
      expect(result.data.length).toBe(1)
    }
  })

  it('rejects with ImageLoadError(reason: "empty-input") for a zero-byte Blob', async () => {
    await expect(loadImageFromBlob(new Blob([]))).rejects.toMatchObject({
      reason: 'empty-input'
    } satisfies Partial<ImageLoadError>)
  })

  it('rejects with a single generic ImageLoadError(reason: "decode-failed") for corrupted image bytes', async () => {
    const blob = dataUriToBlob(CORRUPTED_PNG_DATA_URI)
    await expect(loadImageFromBlob(blob)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
    await expect(loadImageFromUrl(CORRUPTED_PNG_DATA_URI)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
  })

  it('rejects with the same generic ImageLoadError(reason: "decode-failed") for non-image content', async () => {
    const blob = new Blob([NON_IMAGE_TEXT], { type: 'text/plain' })
    await expect(loadImageFromBlob(blob)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
    await expect(loadImageFromUrl(`data:text/plain,${encodeURIComponent(NON_IMAGE_TEXT)}`)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('loadImage', () => {
  it('dispatches to loadImageFromUrl for a url source', async () => {
    const result = await loadImage({ kind: 'url', value: TEST_PNG_DATA_URI })
    expect(result.width).toBe(1)
  })

  it('dispatches to loadImageFromBlob for a blob source', async () => {
    const blob = dataUriToBlob(TEST_PNG_DATA_URI)
    const result = await loadImage({ kind: 'blob', value: blob })
    expect(result.width).toBe(1)
  })
})

describe('concurrent loads', () => {
  it('resolves multiple independent calls to their own correct results without interference', async () => {
    const goodBlob = dataUriToBlob(TEST_PNG_DATA_URI)
    const badBlob = new Blob([NON_IMAGE_TEXT], { type: 'text/plain' })

    const [good1, good2, bad] = await Promise.allSettled([
      loadImageFromBlob(goodBlob),
      loadImageFromUrl(TEST_PNG_DATA_URI),
      loadImageFromBlob(badBlob)
    ])

    expect(good1.status).toBe('fulfilled')
    expect(good2.status).toBe('fulfilled')
    expect(bad.status).toBe('rejected')
    if (good1.status === 'fulfilled' && good2.status === 'fulfilled') {
      expect(Array.from(good1.value.data)).toEqual(Array.from(good2.value.data))
    }
  })
})

async function pngBlobFromCanvas(width: number, height: number, paint: (ctx: OffscreenCanvasRenderingContext2D) => void): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  paint(ctx)
  return canvas.convertToBlob({ type: 'image/png' })
}

describe('pixel layout and alpha', () => {
  it('returns row-major, top-left-origin pixels matching the BT.601 reference', async () => {
    const blob = await pngBlobFromCanvas(2, 2, (ctx) => {
      ctx.fillStyle = 'rgb(255, 0, 0)'
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = 'rgb(0, 255, 0)'
      ctx.fillRect(1, 0, 1, 1)
      ctx.fillStyle = 'rgb(0, 0, 255)'
      ctx.fillRect(0, 1, 1, 1)
      ctx.fillStyle = 'rgb(255, 255, 255)'
      ctx.fillRect(1, 1, 1, 1)
    })

    const result = await loadImageFromBlob(blob)
    const expected = [76, 150, 29, 255]

    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs((result.data[i] as number) - (expected[i] as number))).toBeLessThanOrEqual(2.55)
    }
  })

  it('discards alpha so a half-transparent red pixel keeps its red luma', async () => {
    const blob = await pngBlobFromCanvas(1, 1, (ctx) => {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.fillRect(0, 0, 1, 1)
    })

    const result = await loadImageFromBlob(blob)

    // Opaque red is 76; blending onto black would give ~38.
    expect(Math.abs((result.data[0] as number) - 76)).toBeLessThanOrEqual(2.55)
  })
})

describe('cross-origin loading', () => {
  it('loads a cross-origin image when the server allows CORS', async () => {
    const result = await loadImageFromUrl(`${inject('crossOriginBaseUrl')}/open.png`)
    expect(result.width).toBe(1)
  })

  it('rejects with a network error when the server omits CORS headers', async () => {
    await expect(loadImageFromUrl(`${inject('crossOriginBaseUrl')}/blocked.png`)).rejects.toMatchObject({
      reason: 'network'
    } satisfies Partial<ImageLoadError>)
  })

  it('rejects with a network error when the connection drops mid-download', async () => {
    await expect(loadImageFromUrl(`${inject('crossOriginBaseUrl')}/truncated.png`)).rejects.toMatchObject({
      reason: 'network'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('mislabelled image bytes', () => {
  it('rejects with an ImageLoadError for a tiny non-image Blob typed as image/png', async () => {
    const blob = new Blob(['not an image'], { type: 'image/png' })

    await expect(loadImageFromBlob(blob)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('large image performance', () => {
  it('decodes and converts a 1920x1080 image in under one second', async () => {
    const source = await createImageBitmap(dataUriToBlob(TEST_PNG_DATA_URI))
    const canvas = new OffscreenCanvas(1920, 1080)
    const context = canvas.getContext('2d')
    context?.drawImage(source, 0, 0, 1920, 1080)
    source.close()
    const blob = await canvas.convertToBlob({ type: 'image/png' })

    const start = performance.now()
    const result = await loadImageFromBlob(blob, { maxWidth: 1920, maxHeight: 1080 })
    const elapsed = performance.now() - start

    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
    expect(result.data.length).toBe(1920 * 1080)
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('max dimension downscaling', () => {
  it.each([
    { name: 'a 4000x3000 image with defaults', size: [4000, 3000], options: undefined, expected: [128, 96] },
    { name: 'a 300x100 image with defaults', size: [300, 100], options: undefined, expected: [128, 42] },
    { name: 'a 64x32 image within the default bounds', size: [64, 32], options: undefined, expected: [64, 32] },
    { name: 'a 200x100 image with 50x50 bounds', size: [200, 100], options: { maxWidth: 50, maxHeight: 50 }, expected: [50, 25] },
    { name: 'a 100x400 image with a width-only bound', size: [100, 400], options: { maxWidth: 200 }, expected: [32, 128] }
  ])('loads $name at the expected size', async ({ size, options, expected }) => {
    const [sourceWidth = 1, sourceHeight = 1] = size
    const blob = await pngBlobFromCanvas(sourceWidth, sourceHeight, (ctx) => {
      ctx.fillStyle = 'rgb(200, 200, 200)'
      ctx.fillRect(0, 0, sourceWidth, sourceHeight)
    })

    const result = await loadImageFromBlob(blob, options)

    expect([result.width, result.height]).toEqual(expected)
    expect(result.data.length).toBe(result.width * result.height)
  })

  it('applies the options through loadImage and loadImageFromUrl', async () => {
    const blob = await pngBlobFromCanvas(40, 20, (ctx) => ctx.fillRect(0, 0, 40, 20))
    const viaBlob = await loadImage({ kind: 'blob', value: blob }, { maxWidth: 10, maxHeight: 10 })
    expect([viaBlob.width, viaBlob.height]).toEqual([10, 5])

    const url = URL.createObjectURL(blob)
    try {
      const viaUrl = await loadImage({ kind: 'url', value: url }, { maxWidth: 10, maxHeight: 10 })
      expect([viaUrl.width, viaUrl.height]).toEqual([10, 5])
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  it.each([{ maxWidth: 0 }, { maxHeight: 1.5 }, { maxWidth: -1 }])(
    'rejects invalid options %o before fetching or decoding',
    async (options) => {
      const unreachable = 'https://example.invalid/never-fetched.png'
      await expect(loadImageFromUrl(unreachable, options)).rejects.toMatchObject({
        reason: 'invalid-options'
      } satisfies Partial<ImageLoadError>)
      await expect(loadImageFromBlob(new Blob([]), options)).rejects.toMatchObject({
        reason: 'invalid-options'
      } satisfies Partial<ImageLoadError>)
    }
  )
})

