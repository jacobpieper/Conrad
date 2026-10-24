import type { GrayscaleImage, ImageSource, LoadImageOptions } from './types'
import { ImageLoadError } from './errors'
import { toGrayscale } from './to-grayscale'

const defaultMaxDimension = 128

type Bounds = { maxWidth: number; maxHeight: number }

function resolveBounds(options: LoadImageOptions | undefined): Bounds {
  const maxWidth = options?.maxWidth ?? defaultMaxDimension
  const maxHeight = options?.maxHeight ?? defaultMaxDimension
  if (
    !Number.isInteger(maxWidth) ||
    !Number.isInteger(maxHeight) ||
    maxWidth <= 0 ||
    maxHeight <= 0
  ) {
    throw new ImageLoadError('invalid-options', 'maxWidth and maxHeight must be positive integers')
  }
  return { maxWidth, maxHeight }
}

async function decodeBlob(blob: Blob, bounds: Bounds): Promise<GrayscaleImage> {
  if (blob.size === 0) {
    throw new ImageLoadError('empty-input', 'Cannot load an empty (zero-byte) image source')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (cause) {
    throw new ImageLoadError('decode-failed', 'Image decoding failed', cause)
  }

  const scale = Math.min(1, bounds.maxWidth / bitmap.width, bounds.maxHeight / bitmap.height)
  const width = Math.max(1, Math.floor(bitmap.width * scale))
  const height = Math.max(1, Math.floor(bitmap.height * scale))
  try {
    const ctx = new OffscreenCanvas(width, height).getContext('2d')
    if (!ctx) {
      throw new ImageLoadError('decode-failed', 'Failed to acquire a 2D canvas context for pixel readback')
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = toGrayscale(imageData.data, width, height)
    return { width, height, data }
  } catch (cause) {
    if (cause instanceof ImageLoadError) throw cause
    throw new ImageLoadError('decode-failed', 'Image pixel extraction failed', cause)
  } finally {
    bitmap.close()
  }
}

export async function loadImageFromUrl(
  url: string,
  options?: LoadImageOptions
): Promise<GrayscaleImage> {
  const bounds = resolveBounds(options)
  if (url.length === 0) {
    throw new ImageLoadError('empty-input', 'Cannot load an image from an empty URL')
  }

  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    throw new ImageLoadError('network', `Failed to fetch image from URL: ${url}`, cause)
  }
  if (!response.ok) {
    throw new ImageLoadError('network', `Image URL responded with status ${response.status}: ${url}`)
  }

  let blob: Blob
  try {
    blob = await response.blob()
  } catch (cause) {
    throw new ImageLoadError('network', `Failed to read image data from URL: ${url}`, cause)
  }
  return decodeBlob(blob, bounds)
}

export async function loadImageFromBlob(
  blob: Blob,
  options?: LoadImageOptions
): Promise<GrayscaleImage> {
  return decodeBlob(blob, resolveBounds(options))
}

export async function loadImage(
  source: ImageSource,
  options?: LoadImageOptions
): Promise<GrayscaleImage> {
  return source.kind === 'url'
    ? loadImageFromUrl(source.value, options)
    : loadImageFromBlob(source.value, options)
}
