import { describe, it, expect } from 'vitest'
import { loadImageFromUrl, loadImageFromBlob, loadImage } from '../../../src/core/image-loader/load-image'
import { ImageLoadError } from '../../../src/core/image-loader/errors'
import {
  TWO_BY_TWO_PNG_DATA_URI,
  TWO_BY_TWO_EXPECTED_GRAYSCALE,
  CORRUPTED_PNG_DATA_URI,
  NON_IMAGE_TEXT,
  dataUriToBlob,
  base64ToBlob,
  TWO_BY_TWO_PNG_BASE64
} from './fixtures'

describe('loadImageFromUrl', () => {
  it('decodes a PNG data URI into a grayscale buffer matching the reference conversion', async () => {
    const result = await loadImageFromUrl(TWO_BY_TWO_PNG_DATA_URI)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(result.width * result.height)
    for (let i = 0; i < TWO_BY_TWO_EXPECTED_GRAYSCALE.length; i++) {
      expect(Math.abs((result.data[i] as number) - (TWO_BY_TWO_EXPECTED_GRAYSCALE[i] as number))).toBeLessThanOrEqual(2.55)
    }
  })

  it('rejects with ImageLoadError(reason: "network") for an unreachable URL', async () => {
    await expect(loadImageFromUrl('https://example.invalid/missing.png')).rejects.toMatchObject({
      reason: 'network'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('loadImageFromBlob', () => {
  it('decodes a PNG Blob into the same grayscale buffer as the URL path', async () => {
    const blob = base64ToBlob(TWO_BY_TWO_PNG_BASE64, 'image/png')
    const result = await loadImageFromBlob(blob)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(Array.from(result.data)).toEqual(Array.from((await loadImageFromUrl(TWO_BY_TWO_PNG_DATA_URI)).data))
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
  })

  it('rejects with the same generic ImageLoadError(reason: "decode-failed") for non-image content', async () => {
    const blob = new Blob([NON_IMAGE_TEXT], { type: 'text/plain' })
    await expect(loadImageFromBlob(blob)).rejects.toMatchObject({
      reason: 'decode-failed',
      message: 'Image decoding failed'
    } satisfies Partial<ImageLoadError>)
  })
})

describe('loadImage', () => {
  it('dispatches to loadImageFromUrl for a url source', async () => {
    const result = await loadImage({ kind: 'url', value: TWO_BY_TWO_PNG_DATA_URI })
    expect(result.width).toBe(2)
  })

  it('dispatches to loadImageFromBlob for a blob source', async () => {
    const blob = base64ToBlob(TWO_BY_TWO_PNG_BASE64, 'image/png')
    const result = await loadImage({ kind: 'blob', value: blob })
    expect(result.width).toBe(2)
  })
})

describe('concurrent loads', () => {
  it('resolves multiple independent calls to their own correct results without interference', async () => {
    const goodBlob = base64ToBlob(TWO_BY_TWO_PNG_BASE64, 'image/png')
    const badBlob = new Blob([NON_IMAGE_TEXT], { type: 'text/plain' })

    const [good1, good2, bad] = await Promise.allSettled([
      loadImageFromBlob(goodBlob),
      loadImageFromUrl(TWO_BY_TWO_PNG_DATA_URI),
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

