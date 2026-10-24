import assert from "node:assert/strict"
import path from "node:path"
import { setImmediate } from "node:timers/promises"
import { afterEach, beforeEach, mock, test } from "node:test"
import { chromium, type BrowserContext, type Page } from "playwright"

import { checkBrowserAvailability } from "../src/lib/browser-availability"
import { zeldaStores } from "../src/lib/zelda-stores"

const nintendo = zeldaStores.find((store) => store.id === "nintendo")!
const amazon = zeldaStores.find((store) => store.id === "amazon")!
let active: number
let peak: number
let closed: number
let launches: string[]
let navigationFails: boolean
let launchFails: boolean
let beforeNavigation: (() => Promise<void>) | undefined
let onClose: (() => void) | undefined

beforeEach(() => {
  active = 0
  peak = 0
  closed = 0
  launches = []
  navigationFails = false
  launchFails = false
  beforeNavigation = undefined
  onClose = undefined
  mock.method(chromium, "launchPersistentContext", async (directory: string, options: Parameters<typeof chromium.launchPersistentContext>[1]) => {
    launches.push(directory)
    assert.equal(options?.headless, true)
    assert.equal(options?.chromiumSandbox, true)
    assert.equal(options?.timeout, 15_000)
    if (launchFails) throw new Error("Detailed launch diagnostics")
    active++
    peak = Math.max(peak, active)
    const store = path.basename(directory) === "amazon" ? amazon : nintendo
    const page = {
      goto: async () => {
        await beforeNavigation?.()
        if (navigationFails) throw new Error("Navigation failed")
        return { status: () => 200 }
      },
      waitForFunction: async () => {},
      url: () => store.url,
      content: async () => `<html><title>Nintendo Switch 2 Zelda 40th Anniversary Edition</title>
        <body><main><link itemprop="availability" href="https://schema.org/OutOfStock"></main></body></html>`,
    } as unknown as Page
    let isClosed = false
    return {
      setDefaultTimeout: () => {},
      pages: () => [page],
      close: async () => {
        if (isClosed) return
        isClosed = true
        active--
        closed++
        onClose?.()
      },
    } as unknown as BrowserContext
  })
})

afterEach(() => mock.restoreAll())

test("a successful browser check closes Chromium before returning", async () => {
  const result = await checkBrowserAvailability(nintendo)
  assert.equal(result.status, "out_of_stock")
  assert.equal(active, 0)
  assert.equal(closed, 1)
  assert.equal(path.basename(launches[0]), "nintendo")
})

test("navigation failure still closes Chromium", async () => {
  navigationFails = true
  await assert.rejects(checkBrowserAvailability(amazon), /Selaimen saatavuustarkistus epäonnistui/)
  assert.equal(active, 0)
  assert.equal(closed, 1)
})

test("concurrent stores are serialized so at most one browser is open", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  beforeNavigation = () => gate
  const first = checkBrowserAvailability(nintendo)
  const second = checkBrowserAvailability(amazon)
  await setImmediate()
  assert.equal(launches.length, 1)
  assert.equal(active, 1)
  release()
  await Promise.all([first, second])
  assert.equal(peak, 1)
  assert.equal(closed, 2)
  assert.equal(active, 0)
})

test("a failed launch does not block the next queued browser check", async () => {
  launchFails = true
  await assert.rejects(checkBrowserAvailability(nintendo), /Selaimen käynnistäminen epäonnistui/)
  launchFails = false
  assert.equal((await checkBrowserAvailability(amazon)).status, "out_of_stock")
  assert.equal(active, 0)
  assert.equal(closed, 1)
})

test("the overall watchdog closes a stalled browser and releases its queue", async () => {
  const originalSetTimeout = globalThis.setTimeout
  mock.method(globalThis, "setTimeout", (callback: () => void, delay?: number) => originalSetTimeout(callback, delay === 60_000 ? 5 : delay))
  beforeNavigation = () => new Promise<void>((_, reject) => {
    onClose = () => reject(new Error("Browser closed by watchdog"))
  })
  await assert.rejects(checkBrowserAvailability(nintendo), /aikakatkaistiin 60 sekunnin/)
  assert.equal(active, 0)
  assert.equal(closed, 1)
  beforeNavigation = undefined
  onClose = undefined
  await checkBrowserAvailability(amazon)
  assert.equal(active, 0)
  assert.equal(closed, 2)
})
