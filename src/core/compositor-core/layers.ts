import { CompositorError } from './types'
import type { CompositorState, LayerId, LayerPixels } from './types'

function validateWeight(weight: number): void {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new CompositorError('invalid-weight', 'Weight must be a finite number >= 0')
  }
}

function assertOccupied(state: CompositorState, id: LayerId): void {
  if (
    !Number.isInteger(id) ||
    id < 0 ||
    id >= state.maxLayers ||
    (state.layers[id] ?? null) === null
  ) {
    throw new CompositorError('unknown-layer', `No layer is registered at id ${id}`)
  }
}

export function createCompositor(
  width: number,
  height: number,
  maxLayers: number
): CompositorState {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isInteger(maxLayers) ||
    width <= 0 ||
    height <= 0 ||
    maxLayers <= 0
  ) {
    throw new CompositorError(
      'invalid-dimensions',
      'width, height, and maxLayers must be positive integers'
    )
  }

  const pixelCount = width * height
  return {
    width,
    height,
    pixelCount,
    maxLayers,
    layers: new Array<LayerPixels | null>(maxLayers).fill(null),
    weights: new Float32Array(maxLayers),
    active: new Uint8Array(maxLayers),
    accumulator: new Float32Array(pixelCount),
    output: { width, height, data: new Uint8ClampedArray(pixelCount) }
  }
}

export function registerLayer(
  state: CompositorState,
  pixels: LayerPixels,
  weight: number
): LayerId {
  if (pixels.length !== state.pixelCount) {
    throw new CompositorError(
      'invalid-layer',
      `Layer length must equal width * height (${state.pixelCount})`
    )
  }
  validateWeight(weight)

  let slot = -1
  for (let index = 0; index < state.maxLayers; index++) {
    if (state.layers[index] === null) {
      slot = index
      break
    }
  }
  if (slot === -1) {
    throw new CompositorError('capacity-exceeded', `All ${state.maxLayers} layer slots are in use`)
  }

  state.layers[slot] = pixels
  state.weights[slot] = weight
  state.active[slot] = 1
  return slot
}

export function unregisterLayer(state: CompositorState, id: LayerId): void {
  assertOccupied(state, id)
  state.layers[id] = null
  state.weights[id] = 0
  state.active[id] = 0
}

export function setLayerWeight(state: CompositorState, id: LayerId, weight: number): void {
  assertOccupied(state, id)
  validateWeight(weight)
  state.weights[id] = weight
}

export function setLayerActive(state: CompositorState, id: LayerId, active: boolean): void {
  assertOccupied(state, id)
  state.active[id] = active ? 1 : 0
}
