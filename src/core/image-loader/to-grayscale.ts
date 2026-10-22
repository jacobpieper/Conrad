/**
 * Converts a flat RGBA buffer into a single-channel grayscale buffer using
 * ITU-R BT.601 luma weights, discarding alpha. Writes into `out` if provided
 * (reused pre-sized buffer), otherwise allocates a new `Uint8ClampedArray` once.
 */
export function toGrayscale(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  out: Uint8ClampedArray = new Uint8ClampedArray(width * height)
): Uint8ClampedArray {
  const pixelCount = width * height
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    const r = rgba[offset] as number
    const g = rgba[offset + 1] as number
    const b = rgba[offset + 2] as number
    out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return out
}
