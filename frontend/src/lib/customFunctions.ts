export interface CustomFunction {
  id: string
  name: string
  description?: string
  type: 'scalar' | 'stream'
  body: string
  createdAt: string
}

export interface StreamFunctionInfo {
  duration_s: number | null
  ftp: number | null
  weight_kg: number | null
}

export interface ExecutionResult {
  type: 'scalar' | 'stream'
  value: number | string | null
  data: number[] | null
  error: string | null
}

export function executeCustomFunction(
  fn: CustomFunction,
  streams: Record<string, number[]>,
  info: StreamFunctionInfo,
): ExecutionResult {
  try {
    // eslint-disable-next-line no-new-func
    const executor = new Function('streams', 'info', fn.body)
    const result = executor(streams, info)

    if (fn.type === 'scalar') {
      if (result === null || result === undefined) {
        return { type: 'scalar', value: null, data: null, error: null }
      }
      if (typeof result !== 'number' && typeof result !== 'string') {
        return {
          type: 'scalar',
          value: null,
          data: null,
          error: `Scalar function must return a number or string, got ${typeof result}`,
        }
      }
      return { type: 'scalar', value: result, data: null, error: null }
    } else {
      if (!Array.isArray(result)) {
        return {
          type: 'stream',
          value: null,
          data: null,
          error: `Stream function must return an array, got ${typeof result}`,
        }
      }
      return { type: 'stream', value: null, data: result as number[], error: null }
    }
  } catch (e) {
    return { type: fn.type, value: null, data: null, error: String(e) }
  }
}

export function getCustomFunctions(appSettings: Record<string, unknown> | undefined): CustomFunction[] {
  const fns = appSettings?.['custom_functions']
  if (!Array.isArray(fns)) return []
  return fns as CustomFunction[]
}
