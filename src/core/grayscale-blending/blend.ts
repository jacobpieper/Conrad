import { BlendError } from './types'
import type { GrayscaleImage } from './types'

function validateLayer(layer: GrayscaleImage, width: number, height: number): void {
  if (!Number.isInteger(layer.width) || !Number.isInteger(layer.height) || layer.width <= 0 || layer.height <= 0) {
    throw new BlendError('Layer dimensions must be positive integers')
  }
  if (layer.width !== width || layer.height !== height) {
    throw new BlendError('Layer dimensions must match')
  }
  if (layer.data.length !== width * height) {
    throw new BlendError('Layer data length must equal width multiplied by height')
  }
}

function validateOut(out: Uint8ClampedArray, pixelCount: number): void {
  if (out.length !== pixelCount) {
    throw new BlendError('Output data length must equal width multiplied by height')
  }
}

function accumulate(
  layers: readonly GrayscaleImage[],
  sign: number,
  out: Uint8ClampedArray
): Uint8ClampedArray {
  const firstLayer = layers[0] as GrayscaleImage
  const pixelCount = out.length

  if (layers.length === 2) {
    const secondLayer = layers[1] as GrayscaleImage
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
      out[pixelIndex] = (firstLayer.data[pixelIndex] as number) + sign * (secondLayer.data[pixelIndex] as number)
    }
    return out
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    let value = firstLayer.data[pixelIndex] as number
    for (let layerIndex = 1; layerIndex < layers.length; layerIndex++) {
      value += sign * ((layers[layerIndex] as GrayscaleImage).data[pixelIndex] as number)
    }
    out[pixelIndex] = value
  }

  return out
}

export function addLayers(
  layers: readonly GrayscaleImage[],
  out?: Uint8ClampedArray
): Uint8ClampedArray {
  if (layers.length === 0) {
    throw new BlendError('At least one layer is required')
  }

  const firstLayer = layers[0] as GrayscaleImage
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    validateLayer(layers[layerIndex] as GrayscaleImage, firstLayer.width, firstLayer.height)
  }

  const pixelCount = firstLayer.width * firstLayer.height
  if (out !== undefined) {
    validateOut(out, pixelCount)
  }
  return accumulate(layers, 1, out ?? new Uint8ClampedArray(pixelCount))
}

export function subtractLayers(
  layers: readonly GrayscaleImage[],
  out?: Uint8ClampedArray
): Uint8ClampedArray {
  if (layers.length === 0) {
    throw new BlendError('At least one layer is required')
  }

  const firstLayer = layers[0] as GrayscaleImage
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    validateLayer(layers[layerIndex] as GrayscaleImage, firstLayer.width, firstLayer.height)
  }

  const pixelCount = firstLayer.width * firstLayer.height
  if (out !== undefined) {
    validateOut(out, pixelCount)
  }
  return accumulate(layers, -1, out ?? new Uint8ClampedArray(pixelCount))
}

export function alphaMask(
  base: GrayscaleImage,
  overlay: GrayscaleImage,
  mask: GrayscaleImage,
  out?: Uint8ClampedArray
): Uint8ClampedArray {
  validateLayer(base, base.width, base.height)
  validateLayer(overlay, base.width, base.height)
  validateLayer(mask, base.width, base.height)

  const pixelCount = base.width * base.height
  if (out !== undefined) {
    validateOut(out, pixelCount)
  }
  const output = out ?? new Uint8ClampedArray(pixelCount)

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const baseValue = base.data[pixelIndex] as number
    const overlayValue = overlay.data[pixelIndex] as number
    const maskValue = mask.data[pixelIndex] as number
    output[pixelIndex] = baseValue + (overlayValue - baseValue) * maskValue / 255
  }

  return output
}