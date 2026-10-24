import { setLayerWeight } from '../compositor-core'
import { TemporalError } from './types'
import type { TemporalState } from './types'

export function evaluate(state: TemporalState, timeMs: number): void {
  if (!Number.isFinite(timeMs)) {
    throw new TemporalError('invalid-time', 'timeMs must be a finite number')
  }

  const { compositor, maxKeyframes, maxTracks, times, trackLayer, trackLength, values } = state
  for (let track = 0; track < maxTracks; track++) {
    const layerId = trackLayer[track] ?? -1
    if (layerId === -1) continue

    const base = track * maxKeyframes
    const last = base + (trackLength[track] ?? 1) - 1
    let weight: number
    if (timeMs <= (times[base] ?? 0)) {
      weight = values[base] ?? 0
    } else if (timeMs >= (times[last] ?? 0)) {
      weight = values[last] ?? 0
    } else {
      let segment = base
      while ((times[segment + 1] ?? Infinity) <= timeMs) segment++
      const startTime = times[segment] ?? 0
      const startValue = values[segment] ?? 0
      const endValue = values[segment + 1] ?? 0
      const span = (times[segment + 1] ?? 0) - startTime
      weight = startValue + ((endValue - startValue) * (timeMs - startTime)) / span
    }

    setLayerWeight(compositor, layerId, weight)
  }
}
