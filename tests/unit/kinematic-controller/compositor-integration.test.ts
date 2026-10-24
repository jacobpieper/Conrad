import { describe, expect, it } from 'vitest'
import { compose, createCompositor, registerLayer } from '../../../src/core/compositor-core'
import { addMotionTrack, createKinematicController, evaluateMotion } from '../../../src/core/kinematic-controller'
import { addTrack, createTemporalController, evaluate } from '../../../src/core/temporal-controller'

function row(): { pixels: Uint8Array; compositor: ReturnType<typeof createCompositor> } {
  const compositor = createCompositor(4, 1, 1)
  const pixels = Uint8Array.from([10, 20, 30, 40])
  registerLayer(compositor, pixels, 1)
  return { pixels, compositor }
}

describe('kinematic controller with compositor', () => {
  it('moves a layer over time without touching its bytes', () => {
    const { compositor, pixels } = row()
    const state = createKinematicController(compositor, 1, 2)
    addMotionTrack(state, 0, { mode: 'linear', times: [0, 1000], x: [0, 2], y: [0, 0] })

    evaluateMotion(state, 500)
    expect(Array.from(compose(compositor).data)).toEqual([0, 10, 20, 30])

    evaluateMotion(state, 1000)
    expect(Array.from(compose(compositor).data)).toEqual([0, 0, 10, 20])

    expect(compositor.layers[0]).toBe(pixels)
    expect(Array.from(pixels)).toEqual([10, 20, 30, 40])
  })

  it('moves a layer back and forth with a parametric track', () => {
    const { compositor } = row()
    const state = createKinematicController(compositor, 1, 2)
    addMotionTrack(state, 0, {
      mode: 'parametric',
      centerX: 0,
      centerY: 0,
      amplitudeX: 2,
      amplitudeY: 0,
      periodMs: 4000,
      phaseMs: 0,
      exponent: 1
    })

    evaluateMotion(state, 0)
    expect(Array.from(compose(compositor).data)).toEqual([0, 0, 10, 20])

    evaluateMotion(state, 2000)
    expect(Array.from(compose(compositor).data)).toEqual([30, 40, 0, 0])
  })

  it('combines with a temporal weight track on the same layer', () => {
    const { compositor } = row()
    const motion = createKinematicController(compositor, 1, 2)
    addMotionTrack(motion, 0, { mode: 'linear', times: [0, 1000], x: [0, 2], y: [0, 0] })
    const weight = createTemporalController(compositor, 1, 2)
    addTrack(weight, 0, [0, 1000], [1, 0.5])

    evaluate(weight, 1000)
    evaluateMotion(motion, 1000)

    expect(Array.from(compose(compositor).data)).toEqual([0, 0, 5, 10])
  })
})
