import { Harness, type Contract } from "../safety/harness.js"

// Listing writer: rough seller notes become a publish-ready listing.
// Structured output, Zod-style contract, zero platform coupling — the
// caller supplies notes, the harness enforces the shape.

export type ListingInput = {
  notes: string
  category?: string
}

export type Listing = {
  title: string
  description: string
  tags: string[]
  seo_title?: string
  seo_description?: string
}

export const LISTING_CAPABILITY = "listing"

export const listingContract: Contract = {
  type: "object",
  required: ["title", "description", "tags"],
  fields: {
    title: { type: "string", minLength: 3, maxLength: 120 },
    description: { type: "string", minLength: 20, maxLength: 2000 },
    tags: { type: "array", items: { type: "string", minLength: 2 }, maxItems: 10 },
    seo_title: { type: "string", maxLength: 70 },
    seo_description: { type: "string", maxLength: 160 },
  },
}

export async function writeListing(
  harness: Harness,
  input: ListingInput
): Promise<Listing> {
  const notes = (input.notes ?? "").trim()
  if (notes.length < 10) throw new Error("Describe the product first.")
  return harness.run<Listing>(LISTING_CAPABILITY, () => ({
    system: [
      "Write a marketplace listing as JSON only.",
      "Keys: title, description, tags (max 10), seo_title, seo_description.",
      "No markdown, no commentary, JSON only.",
    ].join(" "),
    user: `Category: ${input.category ?? "general"}\nNotes: ${notes}`,
  }))
}

