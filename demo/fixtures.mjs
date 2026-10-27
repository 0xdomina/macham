// The film's frozen transcript. assist-1.json is the byte-for-byte response body
// Macham's own gateway (server/assist.mjs, POST /v1/assist) returned for the exact
// request in assist-1.request.json, captured live on 2026-10-22 by demo/capture.mjs
// against a scratch keystore with a freshly minted mch_test_ key. The reply text is
// model output; the titles and prices inside it come from the adapter through
// priceLabel (src/buyer/shop.ts:28-34), never from the model.
//
// demo/fixtures/assist-1.meta.json records whether this was a live call or a stub.
// It is live: { "stub": false }.
//
// The render itself is offline — vclock.js answers this fetch from here, in strict
// call order, and refuses anything unrecorded with 410.
export const EPOCH_MS = 1792671735443; // capture run's mintedAt, pinned for the film clock

export const SCRIPT = [
  {
    method: "POST",
    routes: ["/v1/assist"],
    file: "assist-1.json",
    expect: "assist-1.request.json",
    // Pacing, not a measurement: one beat of visible waiting between the typed ask
    // and the answer landing. The real call's duration was not captured per-request.
    delay: 600,
  },
];

// The line the buyer types in the film, and the card the film adds. Kept here so
// the storyboard, the transcript, and the DOM script cannot drift apart.
export const FILM = {
  ask: "i need a parka or a shell",
  addTitle: "Harbor Parka",
  addMessage: "add Harbor Parka to my bag",
  priceLabels: ["USD 42.00", "USD 46.50"],
};
