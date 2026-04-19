/**
 * Frontend LLM utilities — OpenAI-compatible streaming API.
 *
 * Users configure their own LLM endpoint (e.g. a local Ollama instance) in
 * Settings → AI / LLM.  The config is stored in athlete.app_settings and
 * accessed here at call-time, so no server-side API keys are required.
 *
 * Mixed-content note: if the app is served over HTTPS and the user points
 * llm_base_url at an http:// address (e.g. http://localhost:11434/v1) the
 * browser will block the request.  Self-hosted HTTP deployments work fine.
 */

import type { ActivityDetail, AthleteProfile } from './types'

// ── Config ────────────────────────────────────────────────────────────────

export interface LlmConfig {
  base_url: string
  api_key: string
  model: string
}

/** Extract LLM config from app_settings; returns null when not configured. */
export function getLlmConfig(
  appSettings: Record<string, unknown> | undefined | null,
): LlmConfig | null {
  const base_url = (appSettings?.llm_base_url as string | undefined)?.trim()
  if (!base_url) return null
  return {
    base_url,
    api_key: ((appSettings?.llm_api_key as string) || '').trim(),
    model: ((appSettings?.llm_model as string) || 'llama3.2').trim(),
  }
}

// ── Activity analysis ─────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT =
  'You are an expert endurance sports coach. Analyse the following workout data and ' +
  'provide actionable coaching feedback in 3-5 paragraphs. Cover: effort quality and ' +
  'pacing, power/heart-rate relationship if data is available, training load context, ' +
  'and 1-2 specific recommendations for the athlete\'s next sessions. ' +
  'Write in plain prose — no markdown headers, no bullet points, no code blocks.'

function buildAnalysisPrompt(activity: ActivityDetail, athlete: AthleteProfile): string {
  const lines: string[] = [
    `Workout summary for a ${activity.sport_type || 'unknown sport'} session:`,
  ]

  if (activity.start_time) {
    const d = new Date(activity.start_time)
    lines.push(`  Date: ${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
  }
  if (activity.duration_s) {
    const h = Math.floor(activity.duration_s / 3600)
    const m = Math.floor((activity.duration_s % 3600) / 60)
    const s = activity.duration_s % 60
    lines.push(`  Duration: ${h ? `${h}h ` : ''}${m}m ${s}s`)
  }
  if (activity.distance_m != null)
    lines.push(`  Distance: ${(activity.distance_m / 1000).toFixed(2)} km`)
  if (activity.elevation_m != null)
    lines.push(`  Elevation gain: ${Math.round(activity.elevation_m)} m`)
  if (activity.avg_power != null)
    lines.push(`  Average power: ${Math.round(activity.avg_power)} W`)
  if (activity.normalized_power != null)
    lines.push(`  Normalized power: ${Math.round(activity.normalized_power)} W`)
  if (activity.intensity_factor != null)
    lines.push(`  Intensity factor: ${activity.intensity_factor.toFixed(3)}`)
  if (activity.tss != null)
    lines.push(`  Training stress score (TSS): ${activity.tss.toFixed(1)}`)
  if (activity.avg_hr != null)
    lines.push(`  Average heart rate: ${Math.round(activity.avg_hr)} bpm`)
  if (activity.max_hr != null)
    lines.push(`  Max heart rate: ${Math.round(activity.max_hr)} bpm`)
  if (athlete.ftp != null) lines.push(`  Athlete FTP: ${athlete.ftp} W`)
  if (athlete.max_hr != null) lines.push(`  Athlete max HR: ${athlete.max_hr} bpm`)

  return lines.join('\n')
}

/**
 * Stream a coaching analysis from the LLM.
 * Calls `onChunk` for each text fragment as it arrives.
 * Returns the full accumulated text when the stream is complete.
 */
export async function streamAnalysis(
  activity: ActivityDetail,
  athlete: AthleteProfile,
  config: LlmConfig,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${config.base_url.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.api_key) headers['Authorization'] = `Bearer ${config.api_key}`

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: buildAnalysisPrompt(activity, athlete) },
      ],
      temperature: 0.7,
      stream: true,
    }),
    signal,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`LLM request failed: ${resp.status} ${text}`)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''

  outer: while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data.trim() === '[DONE]') break outer
      try {
        const chunk = JSON.parse(data)
        const content: string = chunk.choices?.[0]?.delta?.content ?? ''
        if (content) {
          accumulated += content
          onChunk(content)
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return accumulated
}

// ── Plan generation ───────────────────────────────────────────────────────

export interface WorkoutDay {
  day_of_week: number
  workout_type: string
  description: string | null
  duration_min: number | null
  target_tss: number | null
}

export interface PlanGenerationConfig {
  days_per_week: number
  day_configs: Array<{ day_of_week: number; workout_type: string; notes?: string }>
  periodization: string
  intensity_preference: string
  long_description?: string
}

const PLAN_SYSTEM_PROMPT =
  'You are an expert endurance sports coach that creates personalised training plans.\n' +
  'You MUST respond with ONLY valid JSON — no markdown, no prose, no code fences.\n' +
  'The JSON must conform exactly to the schema provided by the user.\n' +
  'Do not include any explanation or commentary outside the JSON object.'

const PLAN_SCHEMA_EXAMPLE = `{
  "weeks": [
    {
      "week_number": 1,
      "workouts": [
        {
          "day_of_week": 1,
          "workout_type": "rest",
          "description": null,
          "duration_min": null,
          "target_tss": null
        },
        {
          "day_of_week": 2,
          "workout_type": "threshold",
          "description": "2x20 min at threshold power",
          "duration_min": 60,
          "target_tss": 80
        }
      ]
    }
  ]
}

Rules:
- day_of_week: integer 1 (Monday) to 7 (Sunday)
- workout_type: one of "easy", "tempo", "threshold", "vo2max", "endurance", "long", "strength", "yoga", "cross-training", "rest"
- Every week must have exactly 7 workouts, one per day_of_week (1-7)
- Days not scheduled as training should be "rest" with null duration and tss
- TSS and duration_min must be null for rest days, integers otherwise
- Scale TSS and duration progressively across weeks (base building, recovery every 4th week, taper at end)`

const DAY_NAMES: Record<number, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
  5: 'Friday', 6: 'Saturday', 7: 'Sunday',
}

function buildPlanPrompt(
  config: PlanGenerationConfig,
  numWeeks: number,
  goal: string | null,
  athlete: AthleteProfile,
): string {
  const scheduled = [...config.day_configs]
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((dc) => `  - ${DAY_NAMES[dc.day_of_week]}: ${dc.workout_type}${dc.notes ? ` (${dc.notes})` : ''}`)

  const lines: string[] = [
    `Create a ${numWeeks}-week training plan with the following requirements:`,
    '',
    `Periodization style: ${config.periodization}`,
    `Intensity preference: ${config.intensity_preference}`,
    `Training days per week: ${config.days_per_week}`,
    '',
    'Scheduled training days:',
    ...scheduled,
  ]

  if (goal) lines.push('', `Goal/event: ${goal}`)
  if (config.long_description) lines.push('', `Additional context: ${config.long_description}`)
  if (athlete.ftp) lines.push('', `Athlete FTP: ${athlete.ftp}W`)

  lines.push('', `Output exactly ${numWeeks} weeks in the JSON schema below.`, '', PLAN_SCHEMA_EXAMPLE)

  return lines.join('\n')
}

function extractJson(text: string): string {
  text = text.trim()
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (match) return match[1].trim()
  return text
}

function parsePlanResponse(raw: string, numWeeks: number): WorkoutDay[][] {
  const data = JSON.parse(extractJson(raw))
  const weeksData = data.weeks as Array<{ week_number: number; workouts: WorkoutDay[] }>
  if (weeksData.length !== numWeeks) {
    throw new Error(`Expected ${numWeeks} weeks, got ${weeksData.length}`)
  }
  return weeksData.map((week) => {
    if (week.workouts.length !== 7) {
      throw new Error(`Week ${week.week_number} has ${week.workouts.length} days, expected 7`)
    }
    return [...week.workouts]
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .map((w) => ({
        day_of_week: Number(w.day_of_week),
        workout_type: String(w.workout_type ?? 'rest'),
        description: (w.description as string | null | undefined) ?? null,
        duration_min: w.duration_min != null ? Number(w.duration_min) : null,
        target_tss: w.target_tss != null ? Number(w.target_tss) : null,
      }))
  })
}

/**
 * Call the LLM to generate a full training plan.
 * Returns a 2-D array: weeks × days (7 entries per week).
 * Retries once on JSON parse failure.
 */
export async function generatePlanWeeks(
  config: PlanGenerationConfig,
  numWeeks: number,
  goal: string | null,
  athlete: AthleteProfile,
  llmConfig: LlmConfig,
): Promise<WorkoutDay[][]> {
  const url = `${llmConfig.base_url.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (llmConfig.api_key) headers['Authorization'] = `Bearer ${llmConfig.api_key}`

  const userPrompt = buildPlanPrompt(config, numWeeks, goal, athlete)

  async function callLlm(): Promise<string> {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: PLAN_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`LLM request failed: ${resp.status} ${text}`)
    }
    const data = await resp.json()
    return data.choices[0].message.content as string
  }

  const raw = await callLlm()
  try {
    return parsePlanResponse(raw, numWeeks)
  } catch {
    // One retry with same prompt
    const raw2 = await callLlm()
    return parsePlanResponse(raw2, numWeeks)
  }
}
