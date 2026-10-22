export type { GrayscaleImage } from '../image-loader'

export class BlendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlendError'
  }
}