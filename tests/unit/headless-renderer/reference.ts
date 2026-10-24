import type { GrayscaleImage } from '../../../src/core/headless-renderer/types'

export function referenceFrame(
  image: GrayscaleImage | null,
  viewportWidth: number,
  viewportHeight: number
): Uint8Array {
  const output = new Uint8Array(viewportWidth * viewportHeight * 4)
  const background = 16

  for (let y = 0; y < viewportHeight; y++) {
    for (let x = 0; x < viewportWidth; x++) {
      const outputIndex = (y * viewportWidth + x) * 4
      if (image === null) {
        output[outputIndex] = background
        output[outputIndex + 1] = background
        output[outputIndex + 2] = background
        output[outputIndex + 3] = 255
        continue
      }

      const scale = Math.min(viewportWidth / image.width, viewportHeight / image.height)
      const displayWidth = Math.max(1, Math.round(image.width * scale))
      const displayHeight = Math.max(1, Math.round(image.height * scale))
      const offsetX = Math.floor((viewportWidth - displayWidth) * 0.5)
      const offsetY = Math.floor((viewportHeight - displayHeight) * 0.5)
      const u = (x + 0.5 - offsetX) / displayWidth
      const v = (y + 0.5 - offsetY) / displayHeight

      if (u < 0 || u > 1 || v < 0 || v > 1) {
        output[outputIndex] = background
        output[outputIndex + 1] = background
        output[outputIndex + 2] = background
        output[outputIndex + 3] = 255
        continue
      }

      const sourceX = Math.max(0, Math.min(image.width - 1, u * image.width - 0.5))
      const sourceY = Math.max(0, Math.min(image.height - 1, v * image.height - 0.5))
      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const x1 = Math.min(image.width - 1, x0 + 1)
      const y1 = Math.min(image.height - 1, y0 + 1)
      const fractionX = sourceX - x0
      const fractionY = sourceY - y0
      const topLeft = image.data[y0 * image.width + x0] ?? 0
      const topRight = image.data[y0 * image.width + x1] ?? 0
      const bottomLeft = image.data[y1 * image.width + x0] ?? 0
      const bottomRight = image.data[y1 * image.width + x1] ?? 0
      const top = topLeft + (topRight - topLeft) * fractionX
      const bottom = bottomLeft + (bottomRight - bottomLeft) * fractionX
      const intensity = Math.round(top + (bottom - top) * fractionY)

      output[outputIndex] = intensity
      output[outputIndex + 1] = intensity
      output[outputIndex + 2] = intensity
      output[outputIndex + 3] = 255
    }
  }

  return output
}
