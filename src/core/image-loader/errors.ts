export type ImageLoadErrorReason =
  | 'network'
  | 'empty-input'
  | 'decode-failed'

export class ImageLoadError extends Error {
  readonly reason: ImageLoadErrorReason
  override readonly cause?: unknown

  constructor(reason: ImageLoadErrorReason, message: string, cause?: unknown) {
    super(message)
    this.name = 'ImageLoadError'
    this.reason = reason
    this.cause = cause
  }
}
