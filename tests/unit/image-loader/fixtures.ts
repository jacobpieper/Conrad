// Hardcoded, hand-built-and-verified minimal PNG byte strings (no external
// generation step, no Python/shell/ImageMagick) — real, standard-compliant
// PNG bytes decoded via the browser's real image decoder in tests.

// 2x2 RGBA PNG: red, green, blue, white (matches the reference pixels used
// in to-grayscale.test.ts so expected grayscale values are shared).
export const TWO_BY_TWO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4nGP4z8DwHwwZGP6DAQBJyAn3FGMynQAAAABJRU5ErkJggg=='

// 1x1 solid gray RGBA PNG — simplest possible valid image.
export const ONE_PIXEL_GRAY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg=='

export const TWO_BY_TWO_PNG_DATA_URI = `data:image/png;base64,${TWO_BY_TWO_PNG_BASE64}`
export const ONE_PIXEL_GRAY_PNG_DATA_URI = `data:image/png;base64,${ONE_PIXEL_GRAY_PNG_BASE64}`

// Expected BT.601 grayscale conversion of the 2x2 reference pixels above.
export const TWO_BY_TWO_EXPECTED_GRAYSCALE = [76, 150, 29, 255]

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type })
}

export function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',')
  const type = header?.match(/data:(.*);base64/)?.[1] ?? 'application/octet-stream'
  return base64ToBlob(base64 as string, type)
}

// Deliberately corrupt: valid PNG signature followed by garbage bytes.
export const CORRUPTED_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAAD////////////////'

// Not an image at all.
export const NON_IMAGE_TEXT = 'this is plain text, not an image'
