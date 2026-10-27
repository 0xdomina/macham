import type { AIProvider, ChatMessage, ChatResult } from "./types.js"

// Deterministic stand-in for the cloud brain. A shopper browsing a store with no
// Macham endpoint configured still gets the real answer — the matches and their
// prices, in the order the store showed them — with no model call and nothing
// sent anywhere. The caller has already built the lines, so this only speaks them.
export class LocalBrain implements AIProvider {
  readonly name = "macham-local"

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const last = messages[messages.length - 1]?.content ?? ""
    const data = /<DATA>\n?([\s\S]*?)<\/DATA>/.exec(last)?.[1] ?? ""
    const lines = data.split("\n").map((l) => l.trim()).filter(Boolean)
    const asked = /Shopper asked:\s*(.+)/.exec(last)?.[1]?.trim() ?? ""

    let summary: string
    if (!lines.length) {
      summary = "Nothing on this page matched. Try other words, or open another page."
    } else {
      const head = asked
        ? `${lines.length} on this page match "${asked.slice(0, 60)}". `
        : `${lines.length} from this page. `
      summary = head + lines.slice(0, 3).join("; ") + (lines.length > 3 ? ` and ${lines.length - 3} more.` : "")
    }
    return { text: JSON.stringify({ summary: summary.slice(0, 590) }), model: "local" }
  }
}
