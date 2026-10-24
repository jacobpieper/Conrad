# Contract: Image Loader API (additions)

Extends [001 contract](../../001-image-loader/contracts/image-loader-api.md).

```ts
type LoadImageOptions = {
  maxWidth?: number  // positive integer, default 128
  maxHeight?: number // positive integer, default 128
}

type ImageLoadErrorReason = 'network' | 'empty-input' | 'decode-failed' | 'invalid-options'

loadImageFromUrl(url: string, options?: LoadImageOptions): Promise<GrayscaleImage>
loadImageFromBlob(blob: Blob, options?: LoadImageOptions): Promise<GrayscaleImage>
loadImage(source: ImageSource, options?: LoadImageOptions): Promise<GrayscaleImage>
```

## Behavior

- Omitted `options` or fields default to 128.
- `scale = min(1, maxWidth / w, maxHeight / h)`; output is `floor(w * scale) x floor(h * scale)`, each at least 1. Aspect ratio is preserved within rounding; images within bounds are never resized.
- Scaling happens by drawing the decoded bitmap at the target size onto the extraction canvas; `data.length === width * height` still holds.
- Invalid options reject with `ImageLoadError('invalid-options')` before any network or decode work.
- All existing guarantees (alpha flattened, first frame only, independent calls, no partial results) are unchanged.
