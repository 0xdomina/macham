export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ChatResult = {
  text: string
  model: string
}

// The seam every model provider implements. Failover across providers is an
// assistant-level concern, never a provider concern.
export type AIProvider = {
  readonly name: string
  chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<ChatResult>
}
