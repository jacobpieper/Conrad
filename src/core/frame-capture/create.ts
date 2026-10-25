import { CaptureError } from './types'
import type { CaptureTarget, CaptureTargetConfig } from './types'

export function createCaptureTargets(
  frameSize: number,
  configs: readonly CaptureTargetConfig[]
): CaptureTarget[] {
  const targets: CaptureTarget[] = []
  const ids = new Set<string>()

  for (let index = 0; index < configs.length; index++) {
    const config = configs[index]
    if (config === undefined) continue

    if (typeof config.id !== 'string' || config.id.length === 0) {
      throw new CaptureError('invalid-id', 'capture target id must be a non-empty string')
    }
    if (ids.has(config.id)) {
      throw new CaptureError('duplicate-id', `duplicate capture target id: ${config.id}`)
    }
    if (!Number.isInteger(config.maxCapacity) || config.maxCapacity <= 0) {
      throw new CaptureError('invalid-capacity', 'capture target maxCapacity must be a positive integer')
    }
    if (config.mode !== 'stop' && config.mode !== 'loop') {
      throw new CaptureError('invalid-mode', 'capture target mode must be stop or loop')
    }

    ids.add(config.id)
    const buffer = new Uint8ClampedArray(config.maxCapacity * frameSize)
    targets.push({
      id: config.id,
      mode: config.mode,
      maxCapacity: config.maxCapacity,
      frameSize,
      buffer,
      isRecording: true,
      headIndex: 0,
      totalFramesRecorded: 0
    })
  }

  return targets
}