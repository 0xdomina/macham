import test from "node:test"
import assert from "node:assert/strict"
import { PayPalRail, withinCaptureTolerance } from "../dist/index.js"

test("capture tolerance math", () => {
  assert.equal(withinCaptureTolerance(10000, 10000), true)
  assert.equal(withinCaptureTolerance(10000, 9000), true)
  assert.equal(withinCaptureTolerance(10000, 11500), true)
  assert.equal(withinCaptureTolerance(10000, 11501), false)
  assert.equal(withinCaptureTolerance(100000, 107400), true)
  assert.equal(withinCaptureTolerance(100000, 107501), false)
  assert.equal(withinCaptureTolerance(0, 100), false)
})

function stubFetch(routes) {
  return async (url, init) => {
    const key = `${init?.method ?? "GET"} ${String(url).split("?")[0].split("/").slice(3).join("/")}`
    const hit = routes[key]
    if (!hit) throw new Error(`unstubbed ${key}`)
    return {
      ok: hit.status < 300,
      status: hit.status,
      json: async () => hit.body,
      text: async () => JSON.stringify(hit.body),
    }
  }
}

const TOKEN = {
  "POST v1/oauth2/token": {
    status: 200,
    body: { access_token: "tok", expires_in: 30000 },
  },
}

test("create order returns approve link", async () => {
  const rail = new PayPalRail({ clientId: "id", clientSecret: "sh" })
  const fetch = stubFetch({
    ...TOKEN,
    "POST v2/checkout/orders": {
      status: 201,
      body: {
        id: "ORD-1",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://approve/1" }],
      },
    },
  })
  const order = await rail.createOrder(
    { amountMinor: 2500, currency: "USD", invoiceId: "INV-1" },
    fetch
  )
  assert.equal(order.id, "ORD-1")
  assert.equal(order.approveUrl, "https://approve/1")
  await assert.rejects(
    rail.createOrder({ amountMinor: 0, currency: "USD", invoiceId: "x" }, fetch),
    /positive/
  )
})

test("capture refuses outside tolerance before any call", async () => {
  const rail = new PayPalRail({ clientId: "id", clientSecret: "sh" })
  let called = false
  const fetch = async () => {
    called = true
    throw new Error("must not call")
  }
  await assert.rejects(rail.captureOrder("ORD-1", 20000, 10000, fetch), /tolerance/)
  assert.equal(called, false)
})

test("authorize then capture the authorization id", async () => {
  const rail = new PayPalRail({ clientId: "id", clientSecret: "sh" })
  const fetch = stubFetch({
    ...TOKEN,
    "POST v2/checkout/orders/ORD-1/authorize": {
      status: 201,
      body: {
        id: "ORD-1",
        status: "COMPLETED",
        purchase_units: [{ payments: { authorizations: [{ id: "AUTH-1", status: "CREATED" }] } }],
      },
    },
    "POST v2/payments/authorizations/AUTH-1/capture": {
      status: 201,
      body: { id: "CAP-1", status: "COMPLETED" },
    },
  })
  const auth = await rail.authorizeOrder("ORD-1", fetch)
  assert.equal(auth.authorizationId, "AUTH-1")
  const cap = await rail.captureAuthorization("AUTH-1", 2500, "USD", fetch)
  assert.equal(cap.status, "COMPLETED")
})

test("void releases an authorization", async () => {
  const rail = new PayPalRail({ clientId: "id", clientSecret: "sh" })
  const fetch = stubFetch({
    ...TOKEN,
    "POST v2/payments/authorizations/AUTH-1/void": {
      status: 204,
      body: {},
    },
  })
  const out = await rail.voidAuthorization("AUTH-1", fetch)
  assert.deepEqual(out, {})
})

test("refund posts capture refund", async () => {
  const rail = new PayPalRail({ clientId: "id", clientSecret: "sh" })
  const fetch = stubFetch({
    ...TOKEN,
    "POST v2/payments/captures/CAP-1/refund": {
      status: 201,
      body: { id: "R-1", status: "COMPLETED" },
    },
  })
  const out = await rail.refundCapture("CAP-1", 2500, "USD", fetch)
  assert.equal(out.status, "COMPLETED")
})

test("missing credentials refuse fast", () => {
  assert.throws(() => new PayPalRail({ clientId: "", clientSecret: "" }), /credentials/)
})
