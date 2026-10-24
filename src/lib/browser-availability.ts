import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

import { parseAvailability } from "@/lib/parse-availability"
import type { StoreAvailability, ZeldaStore } from "@/lib/zelda-stores"

const state = globalThis as typeof globalThis & {
  priceWatchBrowserQueue?: Promise<void>
}

async function readBrowserAvailability(store: ZeldaStore, diagnosticsDirectory?: string): Promise<Pick<StoreAvailability, "status" | "detail">> {
  const dataDirectory = path.dirname(process.env.DB_FILE_NAME ?? "./data/pricewatch.db")
  const profileDirectory = path.resolve(
    process.env.AVAILABILITY_BROWSER_PROFILE_DIR ?? path.join(dataDirectory, "playwright"),
    store.id,
  )
  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: true,
    chromiumSandbox: true,
    locale: store.id === "amazon" ? "de-DE" : "en-IE",
    timezoneId: "Europe/Helsinki",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: false,
    timeout: 15_000,
  }).catch(() => {
    throw new Error("Selaimen käynnistäminen epäonnistui. Varmista, että Chromium ja sen riippuvuudet on asennettu.")
  })

  let timedOut = false
  let diagnostics: Record<string, unknown> | undefined
  let closing: Promise<void> | undefined
  const close = () => closing ??= context.close()
  // A stalled page must not keep Chromium alive until the next hourly check.
  const timer = setTimeout(() => {
    timedOut = true
    void close().catch(() => {})
  }, 60_000)
  timer.unref()

  console.log(`[PriceWatch] Selain käynnistetty: ${store.name}`)
  try {
    context.setDefaultTimeout(5_000)
    const page = context.pages()[0] ?? await context.newPage()
    const response = await page.goto(store.url, { waitUntil: "domcontentloaded", timeout: 25_000 })
    if (response && response.status() >= 400) {
      throw new Error(`Kaupan sivu palautti HTTP ${response.status()}. Avaa kaupan sivu.`)
    }

    // Wait for stock markup, or observe an interactive challenge without submitting it.
    await page.waitForFunction(() => {
      if (document.querySelector("#captchacharacters, form[action*='validateCaptcha']")) return true
      const heading = document.querySelector("#productTitle, h1")?.textContent ?? ""
      const title = `${document.title} ${heading}`
      return /switch\s*2/i.test(title) && /zelda/i.test(title) && Boolean(document.querySelector(
        "#availability, [itemprop='availability'], script[type='application/ld+json']",
      ))
    }, undefined, { timeout: 20_000 }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.name !== "TimeoutError") throw error
    })

    const finalUrl = new URL(page.url())
    if (finalUrl.hostname.endsWith(".queue-it.net")) {
      return { status: "error", detail: "Kaupan jonotus ei valmistunut tarkistuksen aikana. Yritetään seuraavalla tarkistuksella uudelleen." }
    }
    if (finalUrl.host !== new URL(store.url).host) {
      return { status: "unknown", detail: "Kauppa ohjasi pois tuotesivustolta. Tarkista saatavuus kaupan linkistä." }
    }
    const availability = parseAvailability(await page.content(), store.id)
    if (diagnosticsDirectory) {
      await mkdir(diagnosticsDirectory, { recursive: true })
      const rejectCookies = page.getByRole("button", { name: "Reject all non-essential cookies", exact: true })
      if (await rejectCookies.isVisible()) {
        await rejectCookies.click({ timeout: 1_500 }).catch(() => {})
        await rejectCookies.waitFor({ state: "hidden", timeout: 2_000 }).catch(async () => {
          // A server-rendered consent button can precede its JavaScript handler.
          if (await rejectCookies.isVisible()) {
            await rejectCookies.click({ timeout: 1_500 }).catch(() => {})
            await rejectCookies.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => {})
          }
        })
      }
      const bodyText = await page.locator("body").innerText()
      diagnostics = {
        store: store.id,
        checkedAt: new Date().toISOString(),
        pageUrl: `${finalUrl.origin}${finalUrl.pathname}`,
        pageTitle: await page.title(),
        httpStatus: response?.status() ?? null,
        availability,
        schemaAvailability: await page.locator('[itemprop="availability"]').evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href") ?? element.getAttribute("content")).filter(Boolean)),
        visibleStockText: bodyText.match(/This item is out of stock|Unfortunately this product is currently out of stock[^.\n]*|Derzeit nicht verfügbar\.|Auf Lager[^.\n]*/gi) ?? [],
        screenshot: `${store.id}.png`,
      }
      await page.screenshot({ path: path.join(diagnosticsDirectory, `${store.id}.png`), fullPage: false })
    }
    return availability
  } catch (error) {
    if (timedOut) throw new Error("Selaimen saatavuustarkistus aikakatkaistiin 60 sekunnin jälkeen.")
    // Playwright errors may contain long launch diagnostics. Keep them out of the UI.
    if (error instanceof Error && error.message.startsWith("Kaupan sivu palautti HTTP")) throw error
    throw new Error("Selaimen saatavuustarkistus epäonnistui. Yritetään seuraavalla tarkistuksella uudelleen.")
  } finally {
    clearTimeout(timer)
    await close()
    console.log(`[PriceWatch] Selain suljettu: ${store.name}`)
    if (diagnosticsDirectory && diagnostics) {
      await writeFile(path.join(diagnosticsDirectory, `${store.id}.json`), JSON.stringify({ ...diagnostics, browserClosed: true }, null, 2))
    }
  }
}

export function checkBrowserAvailability(store: ZeldaStore, diagnosticsDirectory?: string) {
  // Share one queue between manual, scheduled and hot-reloaded callers.
  // No browser is retained by this queue: it only holds completion promises.
  const request = (state.priceWatchBrowserQueue ?? Promise.resolve()).then(() => readBrowserAvailability(store, diagnosticsDirectory))
  state.priceWatchBrowserQueue = request.then(() => {}, () => {})
  return request
}
