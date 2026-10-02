// Shared commerce shapes. Store adapters translate their platform's native
// objects into these — assistants only ever speak Macham.

export type Money = {
  amountMinor: number
  currency: string
}

export type Product = {
  id: string
  title: string
  handle?: string
  description?: string | null
  imageUrl?: string | null
  price?: Money | null
  metadata?: Record<string, unknown> | null
}

export type Category = {
  id: string
  name: string
  handle?: string
}

export type Customer = {
  id?: string
  email?: string
  name?: string
}
