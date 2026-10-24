import { setLayerOffset } from '../compositor-core'
import { KinematicError, modeCubic, modeParametric, paramStride } from './types'
import type { KinematicState } from './types'

function keyframeAxis(
  times: Float64Array,
  values: Float64Array,
  base: number,
  count: number,
  timeMs: number,
  cubic: boolean
): number {
  const last = base + count - 1
  if (timeMs <= (times[base] ?? 0)) return values[base] ?? 0
  if (timeMs >= (times[last] ?? 0)) return values[last] ?? 0

  let k = base
  while ((times[k + 1] ?? Infinity) <= timeMs) k++
  const startTime = times[k] ?? 0
  const span = (times[k + 1] ?? 0) - startTime
  const start = values[k] ?? 0
  const end = values[k + 1] ?? 0
  const u = (timeMs - startTime) / span
  if (!cubic) return start + (end - start) * u

  const startTangent =
    k > base
      ? (end - (values[k - 1] ?? 0)) / ((times[k + 1] ?? 0) - (times[k - 1] ?? 0))
      : (end - start) / span
  const endTangent =
    k + 1 < last
      ? ((values[k + 2] ?? 0) - start) / ((times[k + 2] ?? 0) - startTime)
      : (end - start) / span
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * start +
    (u3 - 2 * u2 + u) * span * startTangent +
    (-2 * u3 + 3 * u2) * end +
    (u3 - u2) * span * endTangent
  )
}

function waveform(
  center: number,
  amplitude: number,
  periodMs: number,
  phaseMs: number,
  exponent: number,
  timeMs: number
): number {
  const cosine = Math.cos((Math.PI * (timeMs - phaseMs)) / periodMs)
  return center + amplitude * (2 * Math.pow(cosine, 2 * exponent) - 1)
}

export function evaluateMotion(state: KinematicState, timeMs: number): void {
  if (!Number.isFinite(timeMs)) {
    throw new KinematicError('invalid-time', 'timeMs must be a finite number')
  }

  const { compositor, maxKeyframes, maxTracks, params, times, trackLayer, trackLength, trackMode, xs, ys } =
    state
  for (let track = 0; track < maxTracks; track++) {
    const layerId = trackLayer[track] ?? -1
    if (layerId === -1) continue

    let x: number
    let y: number
    const mode = trackMode[track]
    if (mode === modeParametric) {
      const base = track * paramStride
      const periodMs = params[base + 4] ?? 1
      const phaseMs = params[base + 5] ?? 0
      const exponent = params[base + 6] ?? 1
      x = waveform(params[base] ?? 0, params[base + 2] ?? 0, periodMs, phaseMs, exponent, timeMs)
      y = waveform(params[base + 1] ?? 0, params[base + 3] ?? 0, periodMs, phaseMs, exponent, timeMs)
    } else {
      const base = track * maxKeyframes
      const count = trackLength[track] ?? 1
      const cubic = mode === modeCubic
      x = keyframeAxis(times, xs, base, count, timeMs, cubic)
      y = keyframeAxis(times, ys, base, count, timeMs, cubic)
    }

    setLayerOffset(compositor, layerId, Math.round(x), Math.round(y))
  }
}
