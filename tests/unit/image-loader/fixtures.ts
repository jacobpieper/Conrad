export const TEST_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

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
