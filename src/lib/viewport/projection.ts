export function fitScale(
  containerWidth: number,
  containerHeight: number,
  gridWidth: number,
  gridHeight: number
): number {
  return Math.min(containerWidth / gridWidth, containerHeight / gridHeight)
}

export function toGrid(offset: number, cssExtent: number, gridExtent: number): number {
  return Math.min(Math.max((offset * gridExtent) / cssExtent, 0), gridExtent)
}
