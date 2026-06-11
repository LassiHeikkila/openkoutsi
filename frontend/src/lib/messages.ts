// Message types known to the frontend. Each has localized title/body templates
// under the `messages.types.<type>` i18n namespace; anything else falls back to
// `messages.types.unknown`.
export const KNOWN_MESSAGE_TYPES = [
  'team_request',
  'invite_used',
  'join_request',
] as const

export type KnownMessageType = (typeof KNOWN_MESSAGE_TYPES)[number]

/** Map a backend message type to the i18n key segment used to render it. */
export function messageTypeKey(type: string): KnownMessageType | 'unknown' {
  return (KNOWN_MESSAGE_TYPES as readonly string[]).includes(type)
    ? (type as KnownMessageType)
    : 'unknown'
}

/**
 * Coerce a message's `data` payload into safe interpolation values for
 * next-intl. The backend may send `null` for optional fields (e.g. a join
 * request's `display_name`/`message`); passing those straight into `t(...)`
 * would render "null" or break formatting, so null/undefined become "".
 */
export function messageValues(
  data: Record<string, string | null> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v ?? ''
  }
  return out
}
