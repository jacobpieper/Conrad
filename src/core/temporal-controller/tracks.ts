import { TemporalError } from './types'
import type { CompositorState, LayerId, TemporalState, TrackId } from './types'

function validateKeyframes(
  maxKeyframes: number,
  times: ArrayLike<number>,
  values: ArrayLike<number>
): void {
  const count = times.length
  if (count !== values.length || count < 1 || count > maxKeyframes) {
    throw new TemporalError(
      'invalid-keyframes',
      `Keyframes need matching times and values with 1 to ${maxKeyframes} entries`
    )
  }

  let previous = -Infinity
  for (let index = 0; index < count; index++) {
    const time = times[index] ?? NaN
    const value = values[index] ?? NaN
    if (!Number.isFinite(time) || time <= previous) {
      throw new TemporalError('invalid-keyframes', 'Keyframe times must be finite and strictly increasing')
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new TemporalError('invalid-keyframes', 'Keyframe values must be finite and >= 0')
    }
    previous = time
  }
}

export function createTemporalController(
  compositor: CompositorState,
  maxTracks: number,
  maxKeyframes: number
): TemporalState {
  if (
    !Number.isInteger(maxTracks) ||
    !Number.isInteger(maxKeyframes) ||
    maxTracks <= 0 ||
    maxKeyframes <= 0
  ) {
    throw new TemporalError('invalid-dimensions', 'maxTracks and maxKeyframes must be positive integers')
  }

  return {
    compositor,
    maxTracks,
    maxKeyframes,
    trackLayer: new Int32Array(maxTracks).fill(-1),
    trackLength: new Int32Array(maxTracks),
    times: new Float64Array(maxTracks * maxKeyframes),
    values: new Float64Array(maxTracks * maxKeyframes)
  }
}

export function addTrack(
  state: TemporalState,
  layerId: LayerId,
  times: ArrayLike<number>,
  values: ArrayLike<number>
): TrackId {
  validateKeyframes(state.maxKeyframes, times, values)

  const { compositor } = state
  if (
    !Number.isInteger(layerId) ||
    layerId < 0 ||
    layerId >= compositor.maxLayers ||
    (compositor.layers[layerId] ?? null) === null
  ) {
    throw new TemporalError('unknown-layer', `No layer is registered at id ${layerId}`)
  }

  let slot = -1
  for (let index = 0; index < state.maxTracks; index++) {
    if (state.trackLayer[index] === layerId) {
      throw new TemporalError('layer-already-driven', `Layer ${layerId} already has a track`)
    }
    if (slot === -1 && state.trackLayer[index] === -1) slot = index
  }
  if (slot === -1) {
    throw new TemporalError('capacity-exceeded', `All ${state.maxTracks} track slots are in use`)
  }

  const base = slot * state.maxKeyframes
  const count = times.length
  for (let index = 0; index < count; index++) {
    state.times[base + index] = times[index] ?? 0
    state.values[base + index] = values[index] ?? 0
  }
  state.trackLayer[slot] = layerId
  state.trackLength[slot] = count
  return slot
}

export function removeTrack(state: TemporalState, trackId: TrackId): void {
  if (
    !Number.isInteger(trackId) ||
    trackId < 0 ||
    trackId >= state.maxTracks ||
    state.trackLayer[trackId] === -1
  ) {
    throw new TemporalError('unknown-track', `No track exists at id ${trackId}`)
  }

  state.trackLayer[trackId] = -1
  state.trackLength[trackId] = 0
}
