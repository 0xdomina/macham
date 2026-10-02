# Macham keys and identity

Yes: every platform gets its own API key. That is the whole segregation
story, plus user tokens beneath it.

## Platform keys

- Shape: `mch_live_…` / `mch_test_…`. Prefix carries zero entropy. Random
  part 128-bit minimum plus checksum suffix. Test keys never touch live.
- Bound to exactly one platform. Scopes per key
  (`catalog:read`, `assist:use`, `orders:propose`, never broad).
- Issued in dashboard; plaintext shown once. Rotate with 24h dual-active
  grace. Revoke kills within seconds. Inventory shows creator, expiry,
  last use. Leaked key = rotate first, investigate second.
- Server-only. A browser bundle holding one fails closed.

## Users under a business

- The platform owns identity. It calls Macham with its key plus an
  opaque `external_user_id` and gets back a short-lived user JWT
  (platform, user, grants, expiry). Devices hold only that.
- Personalization stores key on `(platform, user)` composite — never
  bare user id. Tenant A can never query tenant B. Anonymous carts get
  temporary ids that link on sign-in.
- Revoking a user = short expiry plus deny-list. Revoking a platform
  = all its user tokens die with it.

## Storage rule

Every row and vector carries its platform (and user where personal).
Enforcement lives in the store layer with fail-closed defaults:
missing scope returns nothing, never everything. Cross-tenant reads
are tested in CI the way unit tests are — bank-swap recall empty,
four-operation matrix green — or the build fails.

## Abuse survival

Leaked key: scoped blast radius, throttled quota, rotate runbook.
Farming: per-account and per-device budgets plus verification caps.
Probing: server-derived scope only, never client filters. Noisy
tenant: per-key quotas isolate the blast, others stay green.
