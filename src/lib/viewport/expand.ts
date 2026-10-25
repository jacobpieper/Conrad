const opaqueBlack = 0xff000000

export function expandGrayscale(
  source: Uint8Array | Uint8ClampedArray,
  target32: Uint32Array
): void {
  for (let index = 0; index < target32.length; index++) {
    target32[index] = opaqueBlack | ((source[index] ?? 0) * 0x010101)
  }
}
