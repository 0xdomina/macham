# Submission checklist (PayPal AI Hackathon)

## Repo

- [x] Public repo with MIT LICENSE
- [x] README: what it does, partner matrix, 60-second quickstart
- [x] Tests green (`npm test`), typecheck clean
- [x] No secrets in tree (`.env` ignored; keys via env only)

## Demo (widget via snippet)

- [ ] Deploy `server/assist.mjs` + build the snippet (`dist-loader/macham.js`) to a public URL
- [ ] Record <3 min YouTube: pain → live sandbox payment → Rialo settlement proof →
      approval → roadmap
- [x] Sandbox credentials work from a fresh machine (exact env:
  `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
  Verified 2026-10-03: OAuth 200, order CREATED, approve host
  `www.sandbox.paypal.com`)

## Live proof (needs keys)

- [ ] PayPal sandbox app (client ID + secret) → run Orders create →
      approve (sandbox personal account) → capture → refund
- [ ] Channel3 key → one real enriched search on video
- [ ] Provider key (Groq) → one narrated answer on video

## Boxes to tick on camera

- [ ] PayPal + AI money loop with receipt
- [x] APIMatic-built calls (`apimatic/openapi.json`, cited in README)
- [x] AG Grid ledger visible with live rows (demo `#/ledger`, device ledger)
- [x] Postman collection fork link in repo (https://www.postman.com/domina9193-4264801/macham)
- [ ] Render deploy URL in submission (credits box)
- [ ] Kernel/EVC lane only if core loop is green first

## After submit

- Keep demo + sandbox app alive through judging (Dec 15)
- Weekly changelog from user feedback
- Rotate any key that appeared on screen
