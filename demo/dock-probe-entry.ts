import { mountAssistant } from "../src/widget/assistant.js";
import type { StoreAdapter } from "../src/adapters/types.js";

const products = [
  { id: "p1", title: "A Letter Gold Necklace", price: { amountMinor: 185000, currency: "TRY" }, imageUrl: null, description: "Elegance with a personal touch." },
  { id: "p2", title: "Silver Chain", price: { amountMinor: 64000, currency: "TRY" }, imageUrl: null, description: "Everyday layer." },
];
const store: StoreAdapter = {
  storeId: "dock-probe",
  async listProducts() { return products as never; },
  async getProduct() { return products[0] as never; },
  async listCategories() { return []; },
};
mountAssistant(document.body, { store, identity: { name: "Macham", disclosure: "AI assistant" }, fx: { currency: "USD", rate: (from, to) => (from === "TRY" && to === "USD" ? 0.02336 : null) } });
