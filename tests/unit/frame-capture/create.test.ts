import { describe, expect, it } from 'vitest'
import { CaptureError, createCaptureTargets } from '../../../src/core/frame-capture'
import type { CaptureTargetConfig } from '../../../src/core/frame-capture'

function asConfigs(value: unknown): readonly CaptureTargetConfig[] {
  return value as readonly CaptureTargetConfig[]
}

describe('frame capture target creation', () => {
  it('returns no targets for an empty configuration', () => {
    expect(createCaptureTargets(6, [])).toEqual([])
  })

  it('allocates one zero-filled buffer per target with initial recording state', () => {
    const targets = createCaptureTargets(6, [
      { id: 'first', maxCapacity: 4, mode: 'stop' },
      { id: 'second', maxCapacity: 2, mode: 'loop' }
    ])

    expect(targets).toHaveLength(2)
    expect(targets[0]).toMatchObject({
      id: 'first',
      mode: 'stop',
      maxCapacity: 4,
      frameSize: 6,
      isRecording: true,
      headIndex: 0,
      totalFramesRecorded: 0
    })
    expect(targets[0]?.buffer).toBeInstanceOf(Uint8ClampedArray)
    expect(targets[0]?.buffer.length).toBe(24)
    expect(Array.from(targets[0]?.buffer ?? [])).toEqual(new Array(24).fill(0))
    expect(targets[1]?.buffer.length).toBe(12)
    expect(targets[0]?.buffer).not.toBe(targets[1]?.buffer)
  })

  it('rejects empty and non-string identifiers', () => {
    const invalidConfigs = [
      [{ id: '', maxCapacity: 1, mode: 'stop' }],
      [{ id: 7, maxCapacity: 1, mode: 'stop' }]
    ]

    for (const config of invalidConfigs) {
      expect(() => createCaptureTargets(1, asConfigs(config))).toThrowError(
        expect.objectContaining({ name: 'CaptureError', reason: 'invalid-id' })
      )
    }
  })

  it('rejects duplicate identifiers', () => {
    expect(() => createCaptureTargets(1, [
      { id: 'duplicate', maxCapacity: 1, mode: 'stop' },
      { id: 'duplicate', maxCapacity: 1, mode: 'loop' }
    ])).toThrowError(expect.objectContaining({
      name: 'CaptureError',
      reason: 'duplicate-id'
    }))
  })

  it('rejects capacities that are not positive integers', () => {
    for (const maxCapacity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createCaptureTargets(1, [{
        id: 'target',
        maxCapacity,
        mode: 'stop'
      }])).toThrowError(expect.objectContaining({
        name: 'CaptureError',
        reason: 'invalid-capacity'
      }))
    }
  })

  it('rejects unsupported modes', () => {
    expect(() => createCaptureTargets(1, asConfigs([
      { id: 'target', maxCapacity: 1, mode: 'invalid' }
    ]))).toThrowError(expect.objectContaining({
      name: 'CaptureError',
      reason: 'invalid-mode'
    }))
  })

  it('reports the first invalid configuration in array order', () => {
    expect(() => createCaptureTargets(1, asConfigs([
      { id: '', maxCapacity: 0, mode: 'invalid' },
      { id: 'later', maxCapacity: 0, mode: 'invalid' }
    ]))).toThrowError(expect.objectContaining({
      name: 'CaptureError',
      reason: 'invalid-id'
    }))
  })

  it('preserves the native allocation RangeError', () => {
    expect(() => createCaptureTargets(1, [{
      id: 'oversized',
      maxCapacity: Number.MAX_SAFE_INTEGER,
      mode: 'stop'
    }])).toThrow(RangeError)
  })

  it('exposes CaptureError as the dedicated configuration error', () => {
    expect(() => createCaptureTargets(1, [{
      id: '',
      maxCapacity: 1,
      mode: 'stop'
    }])).toThrow(CaptureError)
  })
})