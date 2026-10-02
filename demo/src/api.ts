// Live catalog reads (How's U backend, publishable key only).
const BASE = (import.meta.env.VITE_MARKET_API ?? "").replace(/\/$/, "")
const KEY = import.meta.env.VITE_MARKET_KEY ?? ""

export type Product = {
  id: string
  title: string
  handle: string
  description?: string | null
  thumbnail?: string | null
  variants?: { id: string; calculated_price?: { calculated_amount: number; currency_code: string } }[]
}

async function get<T>(path: string): Promise<T> {
  if (!BASE || !KEY) throw new Error("Market connection is not configured.")
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-publishable-api-key": KEY },
  })
  if (!res.ok) throw new Error(`Market answered ${res.status}.`)
  return (await res.json()) as T
}

let regionId: string | null = null

export async function getRegionId(): Promise<string> {
  if (regionId) return regionId
  const data = await get<{ regions: { id: string; countries?: { iso_2?: string }[] }[] }>(`/store/regions`)
  const regions = data.regions ?? []
  const ng = regions.find((r) => (r.countries ?? []).some((c) => (c.iso_2 ?? "").toLowerCase() === "ng")) ?? regions[0]
  if (!ng) throw new Error("Market has no regions.")
  regionId = ng.id
  return regionId
}

export async function listProducts(limit = 24, q?: string): Promise<Product[]> {
  const region = await getRegionId()
  const params = new URLSearchParams({ limit: String(limit), region_id: region })
  params.set("fields", "*variants.calculated_price,thumbnail,handle,title,description")
  if (q) params.set("q", q)
  const data = await get<{ products: Product[] }>(`/store/products?${params}`)
  return data.products ?? []
}

export function priceOf(p: Product): string | null {
  const v = p.variants?.find((x) => typeof x.calculated_price?.calculated_amount === "number")
  const amount = v?.calculated_price?.calculated_amount
  if (amount == null) return null
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: v?.calculated_price?.currency_code ?? "NGN",
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return String(amount)
  }
}
