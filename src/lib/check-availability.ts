import { db, ensureDatabaseInitialized } from "@/db"
import { availabilityChecks } from "@/db/schema"
import { notifyAvailability } from "@/lib/availability-notifications"
import { checkBrowserAvailability } from "@/lib/browser-availability"
import { parseAvailability } from "@/lib/parse-availability"
import { zeldaStores, type StoreAvailability, type ZeldaStore } from "@/lib/zelda-stores"

const MAX_HTML_BYTES = 4 * 1024 * 1024
const state = globalThis as typeof globalThis & {
  priceWatchAvailabilityRequests?: Map<string, Promise<StoreAvailability>>
}
const requests = state.priceWatchAvailabilityRequests ??= new Map()

export async function getAvailability(): Promise<StoreAvailability[]> {
  ensureDatabaseInitialized()
  const rows = await db.select().from(availabilityChecks)
  return zeldaStores.map((store) => {
    const row = rows.find((row) => row.storeId === store.id)
    return {
      ...store,
      status: row?.status ?? "unchecked",
      detail: row?.detail ?? "Tarkista ennakkotilaus- ja varastotilanne.",
      checkedAt: row?.checkedAt.toISOString() ?? null,
    }
  })
}

async function fetchStoreHtml(store: ZeldaStore) {
  const signal = AbortSignal.timeout(15_000)
  let url = new URL(store.url)
  // Fixed catalogue and same-host redirects keep this endpoint from fetching arbitrary URLs.
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      redirect: "manual",
      signal,
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get("location")
      if (!location) throw new Error("Kaupan uudelleenohjaus epäonnistui.")
      const next = new URL(location, url)
      if (next.protocol !== "https:" || next.host !== new URL(store.url).host) {
        throw new Error("Kauppa ohjasi toiselle sivustolle. Tarkista linkki kaupan sivulta.")
      }
      url = next
      continue
    }

    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Kaupan sivu palautti HTTP ${response.status}. Avaa kaupan sivu.`)
    }
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel()
      throw new Error("Kauppa ei palauttanut tuotesivua.")
    }
    if (!response.body) throw new Error("Kaupan vastaus oli tyhjä.")

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let html = ""
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return html + decoder.decode()
        size += value.byteLength
        if (size > MAX_HTML_BYTES) {
          await reader.cancel()
          throw new Error("Tuotesivu oli liian suuri tarkistettavaksi. Avaa kaupan sivu.")
        }
        html += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }
  }
  throw new Error("Kaupan sivu ohjasi liian monta kertaa uudelleen.")
}

async function checkStore(store: ZeldaStore): Promise<StoreAvailability> {
  ensureDatabaseInitialized()
  let result: Pick<StoreAvailability, "status" | "detail">
  try {
    result = store.id === "amazon" || store.id === "nintendo"
      ? await checkBrowserAvailability(store)
      : parseAvailability(await fetchStoreHtml(store), store.id)
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
    result = {
      status: "error",
      detail: timedOut
        ? "Kauppa ei vastannut 15 sekunnissa. Kokeile uudelleen tai avaa kaupan sivu."
        : error instanceof Error && error.message !== "fetch failed"
          ? error.message
          : "Kaupan sivuun ei saatu yhteyttä. Kokeile uudelleen tai avaa kaupan sivu.",
    }
  }
  const checkedAt = new Date()
  await db.insert(availabilityChecks).values({ storeId: store.id, ...result, checkedAt })
    .onConflictDoUpdate({ target: availabilityChecks.storeId, set: { ...result, checkedAt } })
  await notifyAvailability(store, result.status)
  return { ...store, ...result, checkedAt: checkedAt.toISOString() }
}

export async function checkAvailability(storeId?: string) {
  const stores = zeldaStores.filter((store) => !storeId || store.id === storeId)
  await Promise.all(stores.map((store) => {
    const pending = requests.get(store.id)
    if (pending) return pending
    const request = checkStore(store).finally(() => requests.delete(store.id))
    requests.set(store.id, request)
    return request
  }))
  return getAvailability()
}
