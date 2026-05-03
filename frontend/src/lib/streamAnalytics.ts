/**
 * Pure signal processing functions for activity streams.
 * All functions accept streams recorded at 1-second intervals.
 */

export function totalEnergyKj(streams: Record<string, number[]>): number | null {
  const power = streams['power']
  if (!power || power.length === 0) return null
  // Each sample = 1 second; energy = Σ P*1s, convert J → kJ
  const joules = power.reduce((sum, p) => sum + (p ?? 0), 0)
  return Math.round(joules / 1000)
}

export function normalizedPower(streams: Record<string, number[]>): number | null {
  const power = streams['power']
  if (!power || power.length < 30) return null

  // 30-second rolling average, then raise to 4th power, mean, 4th root
  const windowSize = 30
  const smoothed: number[] = []
  for (let i = windowSize - 1; i < power.length; i++) {
    let sum = 0
    for (let j = i - windowSize + 1; j <= i; j++) sum += power[j] ?? 0
    smoothed.push(sum / windowSize)
  }
  const mean4th = smoothed.reduce((sum, v) => sum + v ** 4, 0) / smoothed.length
  return Math.round(mean4th ** 0.25)
}

export function rollingAverage(data: number[], windowSeconds: number): number[] {
  if (windowSeconds <= 0 || data.length === 0) return data.slice()
  const result = new Array<number>(data.length).fill(NaN)
  for (let i = windowSeconds - 1; i < data.length; i++) {
    let sum = 0
    for (let j = i - windowSeconds + 1; j <= i; j++) sum += data[j] ?? 0
    result[i] = Math.round((sum / windowSeconds) * 10) / 10
  }
  return result
}
