import type { CompositorState, GrayscaleImage } from './types'

export function compose(state: CompositorState): GrayscaleImage {
  const { accumulator, active, layers, maxLayers, output, pixelCount, weights } = state
  const out = output.data

  accumulator.fill(0)
  for (let slot = 0; slot < maxLayers; slot++) {
    const pixels = layers[slot]
    if (active[slot] !== 1 || pixels === null || pixels === undefined) continue

    const weight = weights[slot] ?? 0
    for (let index = 0; index < pixelCount; index++) {
      accumulator[index] = (accumulator[index] ?? 0) + weight * (pixels[index] ?? 0)
    }
  }

  for (let index = 0; index < pixelCount; index++) {
    out[index] = accumulator[index] ?? 0
  }
  return output
}
