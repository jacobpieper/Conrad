export type CaptureMode = 'stop' | 'loop'

export type CaptureTargetConfig = {
  id: string
  maxCapacity: number
  mode: CaptureMode
}

export type CaptureTarget = {
  // Fixed after creation.
  id: string
  // Fixed after creation.
  mode: CaptureMode
  // Fixed after creation.
  maxCapacity: number
  // Fixed after creation.
  frameSize: number
  // Length maxCapacity * frameSize; zero-filled once and never resized or replaced.
  buffer: Uint8ClampedArray
  isRecording: boolean
  headIndex: number
  totalFramesRecorded: number
}

export type CaptureErrorReason =
  | 'invalid-id'
  | 'duplicate-id'
  | 'invalid-capacity'
  | 'invalid-mode'

export class CaptureError extends Error {
  readonly reason: CaptureErrorReason

  constructor(reason: CaptureErrorReason, message: string) {
    super(message)
    this.name = 'CaptureError'
    this.reason = reason
  }
}