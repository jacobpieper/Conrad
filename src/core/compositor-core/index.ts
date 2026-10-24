export {
  createCompositor,
  registerLayer,
  setLayerActive,
  setLayerOffset,
  setLayerWeight,
  unregisterLayer
} from './layers'
export { compose } from './compose'
export { CompositorError } from './types'
export type {
  CompositorErrorReason,
  CompositorState,
  GrayscaleImage,
  LayerId,
  LayerPixels
} from './types'
