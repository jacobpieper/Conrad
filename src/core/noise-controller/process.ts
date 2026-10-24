import { NoiseError } from './types'
import type { GrayscaleImage, NoiseState } from './types'

export function processFrame(state: NoiseState, image: GrayscaleImage): GrayscaleImage {
  if (
    image.width !== state.width ||
    image.height !== state.height ||
    image.data.length !== state.pixelCount
  ) {
    throw new NoiseError('invalid-image', 'image size must match the controller')
  }

  const { output, pixelCount, windowTable } = state
  const input = image.data
  const out = output.data
  for (let index = 0; index < pixelCount; index++) {
    out[index] = windowTable[input[index] ?? 0] ?? 0
  }
  return output
}
