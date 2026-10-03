// Browser fallback lane: structured API first, always. When a storefront
// exposes no endpoint, this lane drives a real browser with page-level
// actions (Skyvern `page.act` semantics). Providers plug in behind it;
// the lane contract never changes.

export type PageAction =
  | { kind: "click"; target: string }
  | { kind: "fill"; target: string; value: string }
  | { kind: "extract"; target: string; schema: string }
  | { kind: "wait"; text: string }

export type LaneResult =
  | { ok: true; data?: unknown }
  | { ok: false; reason: string }

export type BrowserLane = {
  readonly name: string
  goto(url: string): Promise<LaneResult>
  act(action: PageAction): Promise<LaneResult>
  close(): Promise<void>
}

export type LaneFactory = (input: {
  url: string
  headless?: boolean
}) => Promise<BrowserLane>

// Escalation policy: API 404/422/extraction-fail routes here. A lane that
// cannot reach the target in 3 actions stops and reports — loops burn
// money and trust.
export const LANE_ACTION_BUDGET = 3
