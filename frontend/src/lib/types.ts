export interface TokenPair {
  access_token: string
  token_type: string
}

export interface MemberResponse {
  user_id: string
  username: string
  roles: string[]
  joined_at: string
}

export interface InvitationResponse {
  id: string
  roles: string[]
  created_by_username: string
  used_by_username: string | null
  expires_at: string | null
  used_at: string | null
  created_at: string
  url?: string | null
}

export interface TeamSettingsResponse {
  llm_base_url: string | null
  llm_model: string | null
  llm_api_key_set: boolean
}

export interface User {
  id: string
  email: string
  created_at: string
}

export interface Zone {
  name: string
  low: number
  high: number
}

export interface FtpTest {
  date: string
  ftp: number
  method: string
}

export interface AthleteProfile {
  id: string
  user_id: string
  name: string | null
  date_of_birth: string | null
  weight_kg: number | null
  ftp: number | null
  max_hr: number | null
  resting_hr: number | null
  hr_zones: Zone[]
  power_zones: Zone[]
  ftp_tests: FtpTest[]
  connected_providers: string[]
  app_settings: Record<string, unknown>
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  athlete_id: string
  sources: string[]
  name: string
  sport_type: string
  start_time: string
  duration_s: number
  distance_m: number | null
  elevation_m: number | null
  avg_power: number | null
  normalized_power: number | null
  avg_hr: number | null
  max_hr: number | null
  tss: number | null
  intensity_factor: number | null
  workout_category: string | null
  has_fit_file: boolean
  status: string
  created_at: string
}

export interface StreamPoint {
  time: number
  power?: number | null
  hr?: number | null
  cadence?: number | null
  altitude?: number | null
  velocity?: number | null
}

export interface ZoneBreakdown {
  zone: string
  seconds: number
  pct: number
}

export interface Interval {
  interval_number: number
  start_offset_s: number
  duration_s: number
  distance_m: number | null
  avg_hr: number | null
  avg_power: number | null
  avg_speed_ms: number | null
  avg_cadence: number | null
  is_auto_split: boolean
}

export interface ActivityDetail extends Activity {
  streams: Record<string, number[]>
  power_bests: Record<number, number>
  distance_bests: Record<number, number>
  intervals: Interval[]
  zone_breakdown?: ZoneBreakdown[]
  analysis_status?: string | null
  analysis?: string | null
}

export interface FitnessPoint {
  date: string
  ctl: number
  atl: number
  tsb: number
  daily_tss: number
}

export interface FitnessCurrent {
  date: string
  ctl: number
  atl: number
  tsb: number
  form: 'peak' | 'fresh' | 'neutral' | 'tired' | 'overreached'
}

export interface Goal {
  id: string
  athlete_id: string
  title: string
  description: string | null
  target_date: string | null
  metric: string | null
  target_value: number | null
  current_value: number | null
  status: string
  created_at: string
}

export interface GoalCreate {
  title: string
  description?: string
  target_date?: string
  metric?: string
  target_value?: number
}

export interface PlannedWorkout {
  id: string
  plan_id: string
  week_number: number
  day_of_week: number
  workout_type: string
  description: string | null
  duration_min: number | null
  target_tss: number | null
  completed_activity_id: string | null
}

export interface TrainingPlan {
  id: string
  athlete_id: string
  name: string
  start_date: string
  end_date: string | null
  goal: string | null
  weeks: number | null
  status: string
  created_at: string
  workouts: PlannedWorkout[]
  config: Record<string, unknown> | null
  generation_method: string | null
}

export interface PaginatedActivities {
  items: Activity[]
  total: number
  page: number
  page_size: number
}

export interface PowerBestEntry {
  duration_s: number
  rank: number
  power_w: number
  activity_id: string
  activity_name: string | null
  activity_start_time: string | null
  weight_kg: number | null
}

export interface WeightLogEntry {
  date: string
  weight_kg: number
}

export interface AllTimePowerBests {
  bests: PowerBestEntry[]
}

export interface DistanceBestEntry {
  distance_m: number
  rank: number
  time_s: number
  activity_id: string
  activity_name: string | null
  activity_start_time: string | null
}

export interface AllTimeDistanceBests {
  bests: DistanceBestEntry[]
}
