import type { CaptureTarget } from './types'

export function captureFrame(targets: CaptureTarget[], frame: Uint8ClampedArray): void {
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]
    if (target === undefined || !target.isRecording) continue

    target.buffer.set(frame, target.headIndex * target.frameSize)
    target.headIndex++
    target.totalFramesRecorded++

    if (target.headIndex === target.maxCapacity) {
      if (target.mode === 'stop') {
        target.isRecording = false
      } else {
        target.headIndex = 0
      }
    }
  }
}