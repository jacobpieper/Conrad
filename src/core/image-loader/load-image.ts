import type { GrayscaleImage, ImageSource } from './types'
import { ImageLoadError } from './errors'
import { toGrayscale } from './to-grayscale'

type PixelContext = Pick<CanvasRenderingContext2D, 'drawImage' | 'getImageData'>

async function decodeBlob(blob: Blob): Promise<GrayscaleImage> {
  if (blob.size === 0) {
    throw new ImageLoadError('empty-input', 'Cannot load an empty (zero-byte) image source')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (cause) {
    throw new ImageLoadError('decode-failed', 'Image decoding failed', cause)
  }

  const { width, height } = bitmap
  try {
    let ctx: PixelContext | null
    if (typeof OffscreenCanvas === 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      ctx = canvas.getContext('2d')
    } else {
      const canvas = new OffscreenCanvas(width, height)
      ctx = canvas.getContext('2d')
    }
    if (!ctx) {
      throw new ImageLoadError('decode-failed', 'Failed to acquire a 2D canvas context for pixel readback')
    }
    ctx.drawImage(bitmap, 0, 0)

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

export async function loadImageFromUrl(url: string): Promise<GrayscaleImage> {
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

  const blob = await response.blob()
  return decodeBlob(blob)
}

export async function loadImageFromBlob(blob: Blob): Promise<GrayscaleImage> {
  return decodeBlob(blob)
}

export async function loadImage(source: ImageSource): Promise<GrayscaleImage> {
  return source.kind === 'url' ? loadImageFromUrl(source.value) : loadImageFromBlob(source.value)
}
