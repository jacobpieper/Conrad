import {
  KinematicError,
  maxOffsetMagnitude,
  modeCubic,
  modeLinear,
  modeParametric,
  paramStride
} from './types'
import type {
  CompositorState,
  KeyframeMotion,
  KinematicState,
  LayerId,
  MotionTrack,
  ParametricMotion,
  TrackId
} from './types'

function invalidMotion(message: string): KinematicError {
  return new KinematicError('invalid-motion', message)
}

function validateKeyframes(maxKeyframes: number, motion: KeyframeMotion): void {
  const { times, x, y } = motion
  const count = times.length
  if (x.length !== count || y.length !== count || count < 1 || count > maxKeyframes) {
    throw invalidMotion(`Keyframes need matching times, x, and y with 1 to ${maxKeyframes} entries`)
  }

  let previous = -Infinity
  for (let index = 0; index < count; index++) {
    const time = times[index] ?? NaN
    if (!Number.isFinite(time) || time <= previous) {
      throw invalidMotion('Keyframe times must be finite and strictly increasing')
    }
    const xValue = x[index] ?? NaN
    const yValue = y[index] ?? NaN
    if (
      !Number.isFinite(xValue) ||
      !Number.isFinite(yValue) ||
      Math.abs(xValue) > maxOffsetMagnitude ||
      Math.abs(yValue) > maxOffsetMagnitude
    ) {
      throw invalidMotion(`Keyframe x and y must be finite with magnitude <= ${maxOffsetMagnitude}`)
    }
    previous = time
  }
}

function validateParametric(motion: ParametricMotion): void {
  const { amplitudeX, amplitudeY, centerX, centerY, exponent, periodMs, phaseMs } = motion
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(amplitudeX) ||
    !Number.isFinite(amplitudeY) ||
    !Number.isFinite(periodMs) ||
    !Number.isFinite(phaseMs) ||
    !Number.isFinite(exponent)
  ) {
    throw invalidMotion('Parametric parameters must be finite')
  }
  if (periodMs <= 0) throw invalidMotion('periodMs must be greater than 0')
  if (!Number.isInteger(exponent) || exponent < 1) {
    throw invalidMotion('exponent must be an integer >= 1')
  }
  if (
    Math.abs(centerX) + Math.abs(amplitudeX) > maxOffsetMagnitude ||
    Math.abs(centerY) + Math.abs(amplitudeY) > maxOffsetMagnitude
  ) {
    throw invalidMotion(`|center| + |amplitude| must be <= ${maxOffsetMagnitude} on each axis`)
  }
}

export function createKinematicController(
  compositor: CompositorState,
  maxTracks: number,
  maxKeyframes: number
): KinematicState {
  if (
    !Number.isInteger(maxTracks) ||
    !Number.isInteger(maxKeyframes) ||
    maxTracks <= 0 ||
    maxKeyframes <= 0
  ) {
    throw new KinematicError('invalid-dimensions', 'maxTracks and maxKeyframes must be positive integers')
  }

  return {
    compositor,
    maxTracks,
    maxKeyframes,
    trackLayer: new Int32Array(maxTracks).fill(-1),
    trackMode: new Uint8Array(maxTracks),
    trackLength: new Int32Array(maxTracks),
    times: new Float64Array(maxTracks * maxKeyframes),
    xs: new Float64Array(maxTracks * maxKeyframes),
    ys: new Float64Array(maxTracks * maxKeyframes),
    params: new Float64Array(maxTracks * paramStride)
  }
}

export function addMotionTrack(
  state: KinematicState,
  layerId: LayerId,
  motion: MotionTrack
): TrackId {
  if (motion.mode === 'linear' || motion.mode === 'cubic') {
    validateKeyframes(state.maxKeyframes, motion)
  } else if (motion.mode === 'parametric') {
    validateParametric(motion)
  } else {
    throw invalidMotion('mode must be linear, cubic, or parametric')
  }

  const { compositor } = state
  if (
    !Number.isInteger(layerId) ||
    layerId < 0 ||
    layerId >= compositor.maxLayers ||
    (compositor.layers[layerId] ?? null) === null
  ) {
    throw new KinematicError('unknown-layer', `No layer is registered at id ${layerId}`)
  }

  let slot = -1
  for (let index = 0; index < state.maxTracks; index++) {
    if (state.trackLayer[index] === layerId) {
      throw new KinematicError('layer-already-driven', `Layer ${layerId} already has a motion track`)
    }
    if (slot === -1 && state.trackLayer[index] === -1) slot = index
  }
  if (slot === -1) {
    throw new KinematicError('capacity-exceeded', `All ${state.maxTracks} track slots are in use`)
  }

  if (motion.mode === 'parametric') {
    const base = slot * paramStride
    state.params[base] = motion.centerX
    state.params[base + 1] = motion.centerY
    state.params[base + 2] = motion.amplitudeX
    state.params[base + 3] = motion.amplitudeY
    state.params[base + 4] = motion.periodMs
    state.params[base + 5] = motion.phaseMs
    state.params[base + 6] = motion.exponent
    state.trackMode[slot] = modeParametric
    state.trackLength[slot] = 0
  } else {
    const base = slot * state.maxKeyframes
    const count = motion.times.length
    for (let index = 0; index < count; index++) {
      state.times[base + index] = motion.times[index] ?? 0
      state.xs[base + index] = motion.x[index] ?? 0
      state.ys[base + index] = motion.y[index] ?? 0
    }
    state.trackMode[slot] = motion.mode === 'cubic' ? modeCubic : modeLinear
    state.trackLength[slot] = count
  }
  state.trackLayer[slot] = layerId
  return slot
}

export function removeMotionTrack(state: KinematicState, trackId: TrackId): void {
  if (
    !Number.isInteger(trackId) ||
    trackId < 0 ||
    trackId >= state.maxTracks ||
    state.trackLayer[trackId] === -1
  ) {
    throw new KinematicError('unknown-track', `No motion track exists at id ${trackId}`)
  }

  state.trackLayer[trackId] = -1
  state.trackLength[trackId] = 0
}
