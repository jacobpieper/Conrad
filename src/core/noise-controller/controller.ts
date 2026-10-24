import { NoiseError } from './types'
import type { NoiseOptions, NoiseState } from './types'

const defaultWindow = 255
const defaultLevel = 127.5
const defaultSeed = 1

function validateWindowLevel(window: number, level: number): void {
  if (!Number.isFinite(window) || window <= 0 || !Number.isFinite(level)) {
    throw new NoiseError('invalid-window-level', 'window must be finite and > 0, and level must be finite')
  }
}

function buildWindowTable(state: NoiseState): void {
  const low = state.level - state.window / 2
  for (let value = 0; value < 256; value++) {
    state.windowTable[value] = ((value - low) / state.window) * 255
  }
}

export function createNoiseController(
  width: number,
  height: number,
  options?: NoiseOptions
): NoiseState {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new NoiseError('invalid-dimensions', 'width and height must be positive integers')
  }
  const window = options?.window ?? defaultWindow
  const level = options?.level ?? defaultLevel
  validateWindowLevel(window, level)

  const pixelCount = width * height
  const state: NoiseState = {
    width,
    height,
    pixelCount,
    window,
    level,
    dose: Infinity,
    windowTable: new Uint8ClampedArray(256),
    sigmaTable: new Float32Array(256),
    rng: new Uint32Array(1),
    output: { width, height, data: new Uint8ClampedArray(pixelCount) }
  }
  state.rng[0] = defaultSeed
  buildWindowTable(state)
  return state
}

export function setWindowLevel(state: NoiseState, window: number, level: number): void {
  validateWindowLevel(window, level)
  state.window = window
  state.level = level
  buildWindowTable(state)
}
