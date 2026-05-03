export function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)])
}
