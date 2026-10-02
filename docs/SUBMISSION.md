# Submission checklist (PayPal AI Hackathon)

## Repo

- [x] Public repo with MIT LICENSE
- [x] README: what it does, partner matrix, 60-second quickstart
- [x] Tests green (`npm test`), typecheck clean
- [x] No secrets in tree (`.env` ignored; keys via env only)

## Demo

- [ ] Deploy demo/ to a public URL
- [ ] Record <3 min YouTube: pain → live sandbox payment → ledger →
      approval → roadmap
- [ ] Sandbox credentials work from a fresh machine (document exact env)

## Live proof (needs keys)

- [ ] PayPal sandbox app (client ID + secret) → run Orders create →
      approve (sandbox personal account) → capture → refund
- [ ] Channel3 key → one real enriched search on video
- [ ] Provider key (Groq) → one narrated answer on video

## Boxes to tick on camera

- [ ] PayPal + AI money loop with receipt
- [ ] APIMatic-built calls (cite plugin in README)
- [ ] AG Grid ledger visible with live rows
- [ ] Postman collection fork link in repo
- [ ] Render deploy URL in submission (credits box)
- [ ] Kernel/EVC lane only if core loop is green first

## After submit

- Keep demo + sandbox app alive through judging (Dec 15)
- Weekly changelog from user feedback
- Rotate any key that appeared on screen
