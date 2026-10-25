export function fitScale(
  containerWidth: number,
  containerHeight: number,
  gridWidth: number,
  gridHeight: number
): number {
  return Math.min(containerWidth / gridWidth, containerHeight / gridHeight)
}
