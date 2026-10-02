# Macham standards (load-bearing)

Break these only with explicit written approval for that task.

## Code

- TypeScript `strict`, `noEmit` typecheck clean, `node --test` green.
  Nothing merges otherwise.
- Zero heavyweight deps by default. Every dependency needs a stated
  reason and a free-tier path.
- Fail-closed money paths: unknown state rejects, never assumes paid.
- Secrets live in env only. Never in code, logs, commits, or chat.
  Publishable keys are not secrets; everything else is.
- Idempotency keys on every money-moving call. Retries must be safe.
- Log decisions with actor + reason + expiry. Never log keys, tokens,
  or full credentials.

## Negotiation safety (from research)

- No open haggling on fixed-price goods. Ever.
- No price below cost floor, below MAP, or beyond approval thresholds
  without a recorded human approval.
- Discounts come from tier tables, clearance flags, and promotions —
  never invented by the model.
- Max rounds per negotiation (default 3–5), expiring quotes
  (default 24–48h), hidden auto-accept/decline bounds.
- Every concession logged: who, what, why, until when.

## Product copy (all user-facing strings)

1. Short first. One line where possible, two at most.
2. No em dashes or double hyphens joining clauses. Use a period.
3. No explainers, mechanics, or T&Cs in UI.
4. No dev-speak. No IDs, codes, or infra names. No "simply" or "just".
5. Errors state what happened plus the single next step.
6. Money about the reader's own money names the amount.
7. Revisit adjacent strings whenever touching a screen.

## Research honesty

- Every architectural claim cites a source in `docs/RESEARCH.md`.
- Items marked TBD are unverified — verify before building on them.
- Competing findings beat convenient ones. Record both.

## Probe readiness

The codebase will be read by judges and auditors. Keep it inspection-clean:

- No speculative migration scaffolding, no named future-provider
  fallbacks, no dead code paths. What's here works; what's next lives
  in docs, not in branches.
- Every dependency justified in one line. Trials flagged with their
  replacement already named.
- No TODO without an owner and a map entry. No commented-out code.
