import { NoiseError } from './types'
import type { GrayscaleImage, NoiseState } from './types'

// Standard deviation of the sum of four uniform bytes, used to normalize a draw to unit variance.
const inverseDeviation = 1 / Math.sqrt((4 * (256 * 256 - 1)) / 12)

export function processFrame(state: NoiseState, image: GrayscaleImage): GrayscaleImage {
  if (
    image.width !== state.width ||
    image.height !== state.height ||
    image.data.length !== state.pixelCount
  ) {
    throw new NoiseError('invalid-image', 'image size must match the controller')
  }

  const { output, pixelCount, rng, sigmaTable, windowTable } = state
  const input = image.data
  const out = output.data

  if (Number.isFinite(state.dose)) {
    let seedState = (rng[0] ?? 0) | 0
    for (let index = 0; index < pixelCount; index++) {
      seedState = (seedState + 0x6d2b79f5) | 0
      let mixed = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState)
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
      const draw = (mixed ^ (mixed >>> 14)) >>> 0
      const sample =
        ((draw & 255) + ((draw >>> 8) & 255) + ((draw >>> 16) & 255) + (draw >>> 24) - 510) *
        inverseDeviation

      const value = input[index] ?? 0
      let noisy = value + (sigmaTable[value] ?? 0) * sample
      if (noisy < 0) noisy = 0
      else if (noisy > 255) noisy = 255
      out[index] = windowTable[(noisy + 0.5) | 0] ?? 0
    }
    rng[0] = seedState
  } else {
    for (let index = 0; index < pixelCount; index++) {
      out[index] = windowTable[input[index] ?? 0] ?? 0
    }
  }
  return output
}
