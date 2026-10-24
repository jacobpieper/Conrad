export type ImageSource =
  | { kind: 'url'; value: string }
  | { kind: 'blob'; value: Blob }

export type GrayscaleImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type LoadImageOptions = {
  maxWidth?: number
  maxHeight?: number
}
