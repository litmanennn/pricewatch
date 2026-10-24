import assert from "node:assert/strict"
import { mkdtempSync, rmSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, afterEach, before, beforeEach, mock, test } from "node:test"
import { chromium, type BrowserContext } from "playwright"

import { zeldaStores } from "../src/lib/zelda-stores"

const originalFetch = globalThis.fetch
const originalDatabaseFile = process.env.DB_FILE_NAME
const originalWebhook = process.env.DISCORD_WEBHOOK_URL
const testDirectory = mkdtempSync(path.join(tmpdir(), "pricewatch-notifications-"))
const databaseFile = path.join(testDirectory, "test.db")
const webhook = "https://discord.com/api/webhooks/123/test-token"
const store = zeldaStores.find((store) => store.id === "power")!

let db: typeof import("../src/db").db
let checkAvailability: typeof import("../src/lib/check-availability").checkAvailability
let schema: typeof import("../src/db/schema")
let storeStatus: "PreOrder" | "InStock" | "OutOfStock" | "error" | "unknown"
let discordFails: boolean
let discordNetworkError: boolean
let messages: { content: string; username: string; allowed_mentions: { parse: string[] } }[]

before(async () => {
  process.env.DB_FILE_NAME = databaseFile
  ;({ db } = await import("../src/db/index"))
  schema = await import("../src/db/schema")
  const { ensureDatabaseInitialized } = await import("../src/db/index")
  ensureDatabaseInitialized()
  ;({ checkAvailability } = await import("../src/lib/check-availability"))
})

beforeEach(async () => {
  await db.delete(schema.availabilityChecks)
  await db.delete(schema.availabilityNotifications)
  storeStatus = "OutOfStock"
  discordFails = false
  discordNetworkError = false
  messages = []
  process.env.DISCORD_WEBHOOK_URL = webhook
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin + url.pathname === webhook) {
      assert.equal(url.searchParams.get("wait"), "true")
      assert.equal(init?.method, "POST")
      assert(init?.signal)
      messages.push(JSON.parse(String(init?.body)))
      if (discordNetworkError) throw new Error("Simulated network error")
      if (discordFails) return new Response(null, { status: 503 })
      return Response.json({ id: String(messages.length) })
    }
    assert(zeldaStores.some((store) => store.url === url.toString() && store.id !== "amazon" && store.id !== "nintendo"),
      "Unexpected network destination in notification test")
    if (storeStatus === "error") throw new Error("fetch failed")
    const name = "Nintendo Switch 2 The Legend of Zelda 40th Anniversary Edition"
    const data = storeStatus === "unknown" ? "" : `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product", name, offers: { availability: `https://schema.org/${storeStatus}` },
    })}</script>`
    return new Response(`<html><head><title>${name}</title>${data}</head><body><main><h1>${name}</h1></main></body></html>`, {
      headers: { "Content-Type": "text/html" },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restoreAll()
})

after(() => {
  db?.$client.close()
  if (originalDatabaseFile === undefined) delete process.env.DB_FILE_NAME
  else process.env.DB_FILE_NAME = originalDatabaseFile
  if (originalWebhook === undefined) delete process.env.DISCORD_WEBHOOK_URL
  else process.env.DISCORD_WEBHOOK_URL = originalWebhook
  rmSync(databaseFile, { force: true })
  rmdirSync(testDirectory)
})

test("sold-out products never send a Discord notification", async () => {
  await checkAvailability(store.id)
  assert.equal(messages.length, 0)
})

test("a preorder sends one short message through the existing webhook", async () => {
  storeStatus = "PreOrder"
  await checkAvailability(store.id)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].username, "PriceWatch")
  assert.match(messages[0].content, /ennakkotilattavissa/)
  assert(messages[0].content.includes(store.name))
  assert(messages[0].content.includes(store.url))
  assert.deepEqual(messages[0].allowed_mentions, { parse: [] })
  const [saved] = await db.select().from(schema.availabilityNotifications)
  assert.equal(saved.status, "preorder")
})

test("unchanged availability is not announced on repeated checks", async () => {
  storeStatus = "InStock"
  await checkAvailability(store.id)
  await checkAvailability(store.id)
  await checkAvailability(store.id)
  assert.equal(messages.length, 1)
})

test("a preorder becoming in stock sends a new notification", async () => {
  storeStatus = "PreOrder"
  await checkAvailability(store.id)
  storeStatus = "InStock"
  await checkAvailability(store.id)
  assert.equal(messages.length, 2)
  assert.match(messages[1].content, /varastossa/)
})

test("errors and unknown checks do not reset notification deduplication", async () => {
  storeStatus = "InStock"
  await checkAvailability(store.id)
  storeStatus = "error"
  await checkAvailability(store.id)
  storeStatus = "unknown"
  await checkAvailability(store.id)
  storeStatus = "InStock"
  await checkAvailability(store.id)
  assert.equal(messages.length, 1)
})

test("confirmed sold-out status rearms the next restock notification", async () => {
  storeStatus = "InStock"
  await checkAvailability(store.id)
  storeStatus = "OutOfStock"
  await checkAvailability(store.id)
  storeStatus = "InStock"
  await checkAvailability(store.id)
  assert.equal(messages.length, 2)
})

test("a failed Discord delivery retries on the next availability check", async () => {
  storeStatus = "InStock"
  discordFails = true
  const stores = await checkAvailability(store.id)
  assert.equal(stores.find((row) => row.id === store.id)?.status, "in_stock")
  assert.equal((await db.select().from(schema.availabilityNotifications)).length, 0)
  discordFails = false
  await checkAvailability(store.id)
  await checkAvailability(store.id)
  assert.equal(messages.length, 2)
})

test("network failure does not mark a Discord alert as sent", async () => {
  storeStatus = "PreOrder"
  discordNetworkError = true
  await checkAvailability(store.id)
  discordNetworkError = false
  await checkAvailability(store.id)
  assert.equal(messages.length, 2)
})

test("a missing webhook can be configured later without losing the notification", async () => {
  delete process.env.DISCORD_WEBHOOK_URL
  storeStatus = "InStock"
  await checkAvailability(store.id)
  assert.equal(messages.length, 0)
  process.env.DISCORD_WEBHOOK_URL = webhook
  await checkAvailability(store.id)
  assert.equal(messages.length, 1)
})

test("concurrent checks for the same store send a single message", async () => {
  storeStatus = "InStock"
  await Promise.all([checkAvailability(store.id), checkAvailability(store.id)])
  assert.equal(messages.length, 1)
})

test("the scheduler checks both browser stores and sends their availability alerts", async () => {
  storeStatus = "PreOrder"
  let launched = 0
  let closed = 0
  let active = 0
  let peak = 0
  mock.method(chromium, "launchPersistentContext", async () => {
    launched++
    active++
    peak = Math.max(peak, active)
    let url = ""
    return {
      setDefaultTimeout: () => {},
      pages: () => [{
        goto: async (target: string) => { url = target; return { status: () => 200 } },
        waitForFunction: async () => {},
        url: () => url,
        content: async () => '<html><title>Nintendo Switch 2 Zelda 40th Anniversary Edition</title><body><main><link itemprop="availability" href="https://schema.org/PreOrder"></main></body></html>',
      }],
      close: async () => { active--; closed++ },
    } as unknown as BrowserContext
  })
  const { runPriceCheck } = await import("../src/lib/price-scheduler")
  const result = await runPriceCheck()
  assert(result)
  assert.equal(result.availability.length, 6)
  assert(result.availability.every((row) => row.status === "preorder"))
  assert.equal(messages.length, 6)
  assert.equal(launched, 2)
  assert.equal(closed, 2)
  assert.equal(active, 0)
  assert.equal(peak, 1)
})
