import { randomUUID } from "node:crypto"

// PayPal Orders v2 rail, sandbox-first. Negotiate first, lock a quote,
// create the order for the quote total, buyer approves, authorize, then
// capture within tolerance (or void and re-quote outside it).

export type PayPalEnv = "sandbox" | "live"

export type PayPalOptions = {
  clientId: string
  clientSecret: string
  env?: PayPalEnv
  timeoutMs?: number
}

export type OrderRequest = {
  amountMinor: number
  currency: string
  invoiceId: string
  intent?: "CAPTURE" | "AUTHORIZE"
  description?: string
}

export type PayPalOrder = {
  id: string
  status: string
  approveUrl?: string
}

const HOSTS: Record<PayPalEnv, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
}

function major(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

/** Capture tolerance: within 115% or +$75 over authorized, whichever less. */
export function withinCaptureTolerance(
  authorizedMinor: number,
  captureMinor: number
): boolean {
  if (!(authorizedMinor > 0) || !(captureMinor > 0)) return false
  if (captureMinor <= authorizedMinor) return true
  const cap = Math.min(authorizedMinor * 1.15, authorizedMinor + 7500)
  return captureMinor <= cap
}

export class PayPalRail {
  private readonly env: PayPalEnv
  private readonly timeoutMs: number
  private token: { value: string; at: number } | null = null

  constructor(private readonly opts: PayPalOptions) {
    if (!opts.clientId || !opts.clientSecret) {
      throw new Error("PayPal credentials needed.")
    }
    this.env = opts.env ?? "sandbox"
    this.timeoutMs = opts.timeoutMs ?? 20_000
  }

  private base(): string {
    return HOSTS[this.env]
  }

  private async accessToken(fetcher: typeof fetch = fetch): Promise<string> {
    if (this.token && Date.now() - this.token.at < 8 * 60 * 1000) {
      return this.token.value
    }
    const res = await fetcher(`${this.base()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(
          `${this.opts.clientId}:${this.opts.clientSecret}`
        ).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`PayPal auth answered ${res.status}.`)
    const body = (await res.json()) as { access_token?: string }
    if (!body.access_token) throw new Error("PayPal auth empty.")
    this.token = { value: body.access_token, at: Date.now() }
    return body.access_token
  }

  private async call<T>(
    path: string,
    init: RequestInit,
    idempotencyKey?: string,
    fetcher: typeof fetch = fetch
  ): Promise<T> {
    const token = await this.accessToken(fetcher)
    const res = await fetcher(`${this.base()}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "").then((t) => t.slice(0, 200))
      throw new Error(`PayPal ${path} answered ${res.status}. ${detail}`)
    }
    return (await res.json()) as T
  }

  static idempotencyKey(): string {
    return randomUUID()
  }

  async createOrder(
    input: OrderRequest,
    fetcher: typeof fetch = fetch
  ): Promise<PayPalOrder> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Amount must be positive minor units.")
    }
    if (!input.invoiceId.trim()) throw new Error("Invoice id needed.")
    const body = await this.call<any>(
      "/v2/checkout/orders",
      {
        method: "POST",
        body: JSON.stringify({
          intent: input.intent ?? "CAPTURE",
          purchase_units: [
            {
              invoice_id: input.invoiceId,
              description: input.description ?? "Macham order",
              amount: {
                currency_code: input.currency.toUpperCase(),
                value: major(input.amountMinor),
              },
            },
          ],
        }),
      },
      PayPalRail.idempotencyKey(),
      fetcher
    )
    const approveUrl = (body.links ?? []).find(
      (l: any) => l.rel === "approve" || l.rel === "payer-action"
    )?.href
    return { id: body.id, status: body.status, approveUrl }
  }

  async getOrder(orderId: string, fetcher: typeof fetch = fetch): Promise<any> {
    if (!orderId.trim()) throw new Error("Order id needed.")
    return this.call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }, undefined, fetcher)
  }

  async captureOrder(
    orderId: string,
    finalMinor: number,
    authorizedMinor: number,
    fetcher: typeof fetch = fetch
  ): Promise<any> {
    if (!withinCaptureTolerance(authorizedMinor, finalMinor)) {
      throw new Error("Outside capture tolerance. Re-quote.")
    }
    return this.call(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: "{}" },
      PayPalRail.idempotencyKey(),
      fetcher
    )
  }

  async refundCapture(
    captureId: string,
    amountMinor: number,
    currency: string,
    fetcher: typeof fetch = fetch
  ): Promise<any> {
    return this.call(
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: { value: major(amountMinor), currency_code: currency.toUpperCase() },
        }),
      },
      PayPalRail.idempotencyKey(),
      fetcher
    )
  }
}
