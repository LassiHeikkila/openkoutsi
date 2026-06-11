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
