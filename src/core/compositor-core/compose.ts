import type { CompositorState, GrayscaleImage } from './types'

export function compose(state: CompositorState): GrayscaleImage {
  const { accumulator, active, height, layers, maxLayers, offsetsX, offsetsY, output, pixelCount, weights, width } =
    state
  const out = output.data

  accumulator.fill(0)
  for (let slot = 0; slot < maxLayers; slot++) {
    const pixels = layers[slot]
    if (active[slot] !== 1 || pixels === null || pixels === undefined) continue

    const weight = weights[slot] ?? 0
    const dx = offsetsX[slot] ?? 0
    const dy = offsetsY[slot] ?? 0
    const xStart = dx > 0 ? dx : 0
    const xEnd = dx < 0 ? width + dx : width
    const yStart = dy > 0 ? dy : 0
    const yEnd = dy < 0 ? height + dy : height
    if (xStart >= xEnd) continue

    // Output (x, y) reads source (x - dx, y - dy); rows and columns outside the image are skipped.
    for (let y = yStart; y < yEnd; y++) {
      const outRow = y * width
      const sourceRow = (y - dy) * width - dx
      for (let x = xStart; x < xEnd; x++) {
        accumulator[outRow + x] = (accumulator[outRow + x] ?? 0) + weight * (pixels[sourceRow + x] ?? 0)
      }
    }
  }

  for (let index = 0; index < pixelCount; index++) {
    out[index] = accumulator[index] ?? 0
  }
  return output
}
