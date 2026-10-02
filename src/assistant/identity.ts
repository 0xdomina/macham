// Assistant identity: name, face, and voice. Per tenant, picked in one
// config object. A 10-year-old names it; the SDK does the rest.

export type AvatarMode = "none" | "procedural" | "upload"
export type Tone = "precise" | "friendly" | "playful"

export type AssistantIdentity = {
  // Shown in the bubble and messages. Defaults per tenant below.
  name: string
  avatar: {
    mode: AvatarMode
    // Procedural knobs: style family + palette + shape. Ignored otherwise.
    style?: string
    palette?: string[]
    square?: boolean
    // Upload tier: brand image URL. Ignored otherwise.
    imageUrl?: string
  }
  tone: Tone
  // Always rendered under the bubble. Non-negotiable disclosure.
  disclosure?: string
}

export const DEFAULT_IDENTITY: AssistantIdentity = {
  name: "Shop helper",
  avatar: { mode: "procedural", style: "beam", square: false },
  tone: "friendly",
  disclosure: "AI assistant",
}

const TONE_RULES: Record<Tone, string> = {
  precise: "Formal diction. Short sentences. Cite totals and policy.",
  friendly: "Warm, one emoji max. First names once.",
  playful: "Light and fun. Never on errors, payments, or refunds.",
}

export function toneRule(tone: Tone): string {
  return TONE_RULES[tone] ?? TONE_RULES.friendly
}

export function resolveIdentity(
  partial?: Partial<AssistantIdentity>
): AssistantIdentity {
  return {
    name: partial?.name?.trim() || DEFAULT_IDENTITY.name,
    avatar: {
      mode: partial?.avatar?.mode ?? DEFAULT_IDENTITY.avatar.mode,
      style: partial?.avatar?.style ?? DEFAULT_IDENTITY.avatar.style,
      palette: partial?.avatar?.palette,
      square: partial?.avatar?.square ?? false,
      imageUrl: partial?.avatar?.imageUrl,
    },
    tone: partial?.tone ?? DEFAULT_IDENTITY.tone,
    disclosure: partial?.disclosure ?? DEFAULT_IDENTITY.disclosure,
  }
}
