import { describe, expect, it } from 'vitest'
import { captureFrame, createCaptureTargets } from '../../../src/core/frame-capture'

describe('frame capture writes', () => {
  it('stops after filling the buffer and leaves later ticks untouched', () => {
    const target = createCaptureTargets(4, [
      { id: 'stop', maxCapacity: 3, mode: 'stop' }
    ])[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    const frames = [
      Uint8ClampedArray.from([1, 2, 3, 4]),
      Uint8ClampedArray.from([5, 6, 7, 8]),
      Uint8ClampedArray.from([9, 10, 11, 12]),
      Uint8ClampedArray.from([13, 14, 15, 16])
    ]

    for (let index = 0; index < 3; index++) {
      const frame = frames[index]
      expect(frame).toBeDefined()
      if (frame === undefined) continue
      captureFrame([target], frame)
      expect(Array.from(target.buffer.subarray(index * 4, index * 4 + 4))).toEqual(Array.from(frame))
      expect(target.headIndex).toBe(index + 1)
      expect(target.totalFramesRecorded).toBe(index + 1)
    }

    expect(target.isRecording).toBe(false)
    const fullBuffer = Array.from(target.buffer)
    captureFrame([target], frames[3] ?? new Uint8ClampedArray(4))
    expect(Array.from(target.buffer)).toEqual(fullBuffer)
    expect(target.headIndex).toBe(3)
    expect(target.totalFramesRecorded).toBe(3)
  })

  it('stops a one-frame target after its first frame', () => {
    const target = createCaptureTargets(2, [
      { id: 'single', maxCapacity: 1, mode: 'stop' }
    ])[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    captureFrame([target], Uint8ClampedArray.from([21, 22]))
    captureFrame([target], Uint8ClampedArray.from([31, 32]))

    expect(Array.from(target.buffer)).toEqual([21, 22])
    expect(target.isRecording).toBe(false)
    expect(target.headIndex).toBe(1)
    expect(target.totalFramesRecorded).toBe(1)
  })

  it('does nothing for an empty list and resumes a paused target at its head', () => {
    const frame = Uint8ClampedArray.from([41, 42])
    expect(() => captureFrame([], frame)).not.toThrow()

    const target = createCaptureTargets(2, [
      { id: 'paused', maxCapacity: 3, mode: 'stop' }
    ])[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    captureFrame([target], Uint8ClampedArray.from([1, 2]))
    target.isRecording = false
    captureFrame([target], frame)
    expect(Array.from(target.buffer)).toEqual([1, 2, 0, 0, 0, 0])
    expect(target.headIndex).toBe(1)
    expect(target.totalFramesRecorded).toBe(1)

    target.isRecording = true
    captureFrame([target], frame)
    expect(Array.from(target.buffer)).toEqual([1, 2, 41, 42, 0, 0])
    expect(target.headIndex).toBe(2)
    expect(target.totalFramesRecorded).toBe(2)
  })

  it('wraps loop targets and overwrites the oldest frame', () => {
    const target = createCaptureTargets(2, [
      { id: 'loop', maxCapacity: 3, mode: 'loop' }
    ])[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    const frames = [
      Uint8ClampedArray.from([1, 1]),
      Uint8ClampedArray.from([2, 2]),
      Uint8ClampedArray.from([3, 3]),
      Uint8ClampedArray.from([4, 4]),
      Uint8ClampedArray.from([5, 5])
    ]

    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index]
      expect(frame).toBeDefined()
      if (frame === undefined) continue
      captureFrame([target], frame)
      if (index === 2) expect(target.headIndex).toBe(0)
    }

    expect(Array.from(target.buffer)).toEqual([4, 4, 5, 5, 3, 3])
    expect(target.headIndex).toBe(2)
    expect(target.totalFramesRecorded).toBe(5)
    expect(target.isRecording).toBe(true)
  })

  it('maintains slot order over multiple wraps and handles mixed modes independently', () => {
    const targets = createCaptureTargets(1, [
      { id: 'loop', maxCapacity: 4, mode: 'loop' },
      { id: 'stop', maxCapacity: 2, mode: 'stop' }
    ])
    const loop = targets[0]
    const stop = targets[1]
    expect(loop).toBeDefined()
    expect(stop).toBeDefined()
    if (loop === undefined || stop === undefined) return

    for (let frameNumber = 1; frameNumber <= 11; frameNumber++) {
      captureFrame(targets, Uint8ClampedArray.of(frameNumber))
      expect(loop.totalFramesRecorded % loop.maxCapacity).toBe(loop.headIndex)
      const newestSlot = (loop.headIndex - 1 + loop.maxCapacity) % loop.maxCapacity
      expect(loop.buffer[newestSlot]).toBe(frameNumber)
      if (frameNumber >= loop.maxCapacity) {
        expect(loop.buffer[loop.headIndex]).toBe(frameNumber - loop.maxCapacity + 1)
      }
    }

    expect(stop.isRecording).toBe(false)
    expect(stop.headIndex).toBe(2)
    expect(stop.totalFramesRecorded).toBe(2)
    expect(Array.from(stop.buffer)).toEqual([1, 2])
    expect(loop.totalFramesRecorded).toBe(11)
    expect(loop.headIndex).toBe(3)
  })

  it('overwrites slot zero for every one-frame loop capture', () => {
    const target = createCaptureTargets(1, [
      { id: 'single-loop', maxCapacity: 1, mode: 'loop' }
    ])[0]
    expect(target).toBeDefined()
    if (target === undefined) return

    captureFrame([target], Uint8ClampedArray.of(7))
    captureFrame([target], Uint8ClampedArray.of(8))

    expect(target.buffer[0]).toBe(8)
    expect(target.headIndex).toBe(0)
    expect(target.totalFramesRecorded).toBe(2)
    expect(target.isRecording).toBe(true)
  })
})