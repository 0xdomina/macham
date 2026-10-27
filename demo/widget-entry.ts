// The film's browser/capture bundle. One entry, two outputs (see build.mjs):
//   demo/build/macham-film.js  — IIFE for the storefront page (global MachamFilm)
//   demo/build/film-core.mjs   — ESM for demo/capture.mjs (real gateway capture)
//
// This file adds NO product logic. It mounts the real widget
// (src/widget/assistant.ts) with a StoreAdapter over committed fixture rows and
// the real MachamCloudProvider as the brain, so the browser performs the genuine
// POST /v1/assist call — the film's virtual clock answers it from a frozen
// transcript of a live capture. `brain` is passed for offline development only,
// exactly as documented at src/widget/assistant.ts:24-26.

import { mountAssistant } from "../src/widget/assistant.js";
import { MachamCloudProvider } from "../src/providers/cloud.js";
import { Harness } from "../src/safety/harness.js";
import { chatTurn, type ChatTurn } from "../src/buyer/chat.js";
import {
  SEARCH_CAPABILITY,
  COMPARE_CAPABILITY,
  CART_PROPOSAL_CAPABILITY,
  searchContract,
  cartProposalContract,
  priceLabel,
} from "../src/buyer/shop.js";
import type { StoreAdapter } from "../src/adapters/types.js";
import type { AIProvider } from "../src/providers/types.js";
import type { Product } from "../src/types.js";
import { FILM_PRODUCTS } from "./store-fixture.js";

// A publishable-shape test key. It matches isKeyShape (src/auth/key-shape.ts:6)
// so mountAssistant accepts it, and it is NOT a key from any .env and is NOT in
// any keystore the film can reach — the render is offline. Documented in NOTES.md.
export const FILM_API_KEY = "mch_test_000000000000000000000000000000000000000000000000_deadbeef";
export const FILM_TENANT_ID = "film-host";
export const FILM_ASSIST_URL = "http://127.0.0.1:8787";

export type FilmProposal = {
  action: string;
  productId?: string;
  title?: string;
  qty?: number;
};

/**
 * The store side of the seam. `listProducts` filtering mirrors
 * src/adapters/mock.ts:24-38 (token match against title + description) so the
 * search results are the same computation the shipped demo adapter performs.
 */
export class FilmStoreAdapter implements StoreAdapter {
  // The neutral host shell is not a real merchant; UniversalAdapter would set
  // storeId from the host origin. Recorded in NOTES.md.
  readonly storeId = "film-host.local";

  async listProducts(input?: { limit?: number; query?: string; categoryId?: string }): Promise<Product[]> {
    const keys = (input?.query ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);
    if (!keys.length) return FILM_PRODUCTS.slice(0, input?.limit ?? 24);
    const found = FILM_PRODUCTS.filter((p) => {
      const text = `${p.title} ${p.description ?? ""}`.toLowerCase();
      const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      return keys.some((k) => text.includes(k) || words.some((w) => k.includes(w) || w.includes(k)));
    });
    return found.slice(0, input?.limit ?? 24);
  }

  async getProduct(idOrHandle: string): Promise<Product | null> {
    return FILM_PRODUCTS.find((p) => p.id === idOrHandle || p.handle === idOrHandle) ?? null;
  }

  async listCategories() {
    return [
      { id: "outerwear", name: "Outerwear" },
      { id: "accessories", name: "Accessories" },
    ];
  }
}

export const filmStore = new FilmStoreAdapter();

/** Mount the real widget into the host shell. */
export function mountStorefront(target: HTMLElement, onProposal?: (p: FilmProposal) => void) {
  return mountAssistant(target, {
    store: filmStore,
    apiKey: FILM_API_KEY,
    tenantId: FILM_TENANT_ID,
    assistUrl: FILM_ASSIST_URL,
    brain: new MachamCloudProvider(FILM_API_KEY, FILM_ASSIST_URL),
    onProposal,
  });
}

/**
 * Same capability registry the widget builds at src/widget/assistant.ts:97-103,
 * used by demo/capture.mjs so the captured prompt is the prompt the browser sends.
 */
export function createFilmHarness(brain: AIProvider): Harness {
  return new Harness({
    tenantId: FILM_TENANT_ID,
    brain,
    capabilities: [
      { key: SEARCH_CAPABILITY, effects: "none", contract: searchContract },
      { key: COMPARE_CAPABILITY, effects: "none", contract: searchContract },
      { key: CART_PROPOSAL_CAPABILITY, effects: "none", contract: cartProposalContract },
    ],
  });
}

export function runFilmTurn(harness: Harness, history: ChatTurn[], message: string) {
  return chatTurn(harness, filmStore, history, message);
}

export { priceLabel, FILM_PRODUCTS, MachamCloudProvider };
export type { ChatTurn, Product, StoreAdapter };
