import * as cheerio from "cheerio"

import type { AvailabilityStatus, ZeldaStoreId } from "@/lib/zelda-stores"
import { zeldaStores } from "@/lib/zelda-stores"

type JsonObject = Record<string, unknown>
type Availability = { status: AvailabilityStatus; detail: string }

const unknown: Availability = {
  status: "unknown",
  detail: "Kaupan sivulta ei saatu varmaa saatavuustietoa. Tarkista tilanne kaupan sivulta.",
}

function objects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(objects)
  if (!value || typeof value !== "object") return []
  const object = value as JsonObject
  return [object, ...objects(object["@graph"]), ...objects(object.mainEntity)]
}

function isZeldaProduct(name: string) {
  return /switch\s*2/i.test(name) && /zelda/i.test(name)
}

function isZeldaEdition(name: string) {
  return isZeldaProduct(name) && /40|anniversary/i.test(name)
}

function schemaStatus(value: unknown): AvailabilityStatus | null {
  if (typeof value !== "string") return null
  const name = value.split(/[\/#]/).pop()?.toLowerCase()
  if (name === "instock" || name === "limitedavailability") return "in_stock"
  if (name === "preorder" || name === "presale") return "preorder"
  if (["outofstock", "soldout", "discontinued"].includes(name ?? "")) return "out_of_stock"
  // BackOrder and InStoreOnly do not confirm an online order is possible.
  return null
}

function result(status: AvailabilityStatus): Availability {
  const details: Partial<Record<AvailabilityStatus, string>> = {
    in_stock: "Kauppa ilmoittaa tuotteen olevan varastossa.",
    preorder: "Kauppa ilmoittaa tuotteen olevan ennakkotilattavissa.",
    out_of_stock: "Tuote ei ole tällä hetkellä tilattavissa verkkokaupasta.",
  }
  return { status, detail: details[status] ?? unknown.detail }
}

function teliaAvailability($: cheerio.CheerioAPI, preorder: boolean): Availability | null {
  // Telia embeds the product's stock in React's streamed JSON, while the
  // visible server-rendered delivery section is still a loading placeholder.
  const chunks: string[] = []
  $("script").each((_, element) => {
    const match = $(element).text().match(/^self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?$/)
    if (!match) return
    try {
      const chunk = JSON.parse(match[1])[1]
      if (typeof chunk === "string") chunks.push(chunk)
    } catch { /* Ignore non-JSON script content; never execute page scripts. */ }
  })

  for (const line of chunks.join("").split("\n")) {
    const colon = line.indexOf(":")
    if (colon < 0) continue
    try {
      const record = JSON.parse(line.slice(colon + 1))
      const product = record?.[3]?.product
      if (!product || product.sku !== "220006" || !isZeldaProduct(product.name ?? "")) continue
      const variants = Array.isArray(product.variants) ? product.variants : [product]
      for (const variant of variants) {
        if (variant.sku !== product.sku) continue
        if (variant.status === "SOLD_OUT") return result("out_of_stock")
        for (const stock of Array.isArray(variant.availability) ? variant.availability : []) {
          if (stock.state === "NOT_AVAILABLE" || stock.noPurch === true) return result("out_of_stock")
          if (stock.state === "AVAILABLE" && stock.noPurch === false) return result(preorder ? "preorder" : "in_stock")
        }
      }
    } catch { /* Other streamed records may contain non-JSON React data. */ }
  }
  return null
}

export function parseAvailability(html: string, storeId: ZeldaStoreId): Availability {
  const $ = cheerio.load(html)
  const titles = [
    $('meta[property="og:title"]').attr("content"),
    $("h1").first().text(),
    $("title").text(),
  ]

  if (/captcha|robot check|access denied|just a moment|verify you are human/i.test($("title").text()) ||
      $("form[action*='validateCaptcha'], #captchacharacters").length ||
      /the site requires javascript to be enabled/i.test($("noscript").text())) {
    return { status: "error", detail: "Kauppa esti automaattisen tarkistuksen. Avaa kaupan sivu." }
  }

  const products: JsonObject[] = []
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      products.push(...objects(JSON.parse($(element).text())).filter((object) => {
        const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]]
        return types.includes("Product") && typeof object.name === "string" && isZeldaEdition(object.name)
      }))
    } catch {
      // A malformed, unrelated JSON-LD block must not prevent other evidence.
    }
  })

  // Amazon's title omits the anniversary name. Accept its exact catalogue ASIN
  // together with the Switch 2 / Zelda title, never an arbitrary Zelda game.
  const amazonAsin = zeldaStores.find((store) => store.id === "amazon")!.url.match(/\/dp\/([A-Z0-9]{10})/)![1]
  const matchingAmazonAsin = storeId === "amazon" && $("input#ASIN").attr("value") === amazonAsin
  if (!titles.some((title) => title && (isZeldaEdition(title) || ((storeId === "telia" || matchingAmazonAsin) && isZeldaProduct(title))))) {
    return { status: "unknown", detail: "Linkin sivulta ei voitu tunnistaa seurattavaa Zelda-juhlaversiota. Tarkista tuotelinkki." }
  }

  if (storeId === "telia") {
    const stock = teliaAvailability($, /ennakkomyynnissä/i.test($("main").text() || $("body").text()))
    if (stock) return stock
  }

  // Only examine the product area, excluding scripts, navigation and recommendations.
  $("script, style, noscript, header, footer, nav, aside, [hidden], [aria-hidden='true'], [data-testid*='recommendation'], [class*='recommendation'], [class*='Recommendation']").remove()
  const main = $("main").first()
  const scope = main.length ? main : $("body")
  const text = scope.text().replace(/\s+/g, " ").trim()
  const stockSelectors: Record<ZeldaStoreId, string> = {
    amazon: "#availability",
    dna: '[data-testid="webshop-availability-text"]',
    verkkokauppa: 'label[for="delivery-availability-button"]',
    nintendo: '[data-testid*="availability"], [class*="stock-status"], [class*="stockStatus"]',
    power: '[itemprop="offers"]',
    telia: '[data-testid*="availability"]',
  }
  const stockText = scope.find(stockSelectors[storeId]).text().replace(/\s+/g, " ").trim()

  // A preorder marketing label or a generic cart button alone is insufficient.
  // Explicit sold-out messages take precedence over stale structured offers.
  if (/tuote toistaiseksi loppunut|ennakko(?:tilaus|myynti)[^.]{0,50}(?:loppuunmyyty|loppunut)|lähetettävissä\s*0\s*kpl|toimitettuna\s*ei saatavilla|currently unavailable|(?:derzeit|momentan|zurzeit) nicht verfügbar|nicht auf lager|not in stock|sold out|out of stock/i.test(stockText)) {
    return result("out_of_stock")
  }

  if (/selvitetään verkkosaatavuutta|näytetään saatavuus pian|checking availability/i.test(text)) return unknown

  const statuses = new Set<AvailabilityStatus>()
  for (const product of products) {
    for (const offer of objects(product.offers)) {
      const status = schemaStatus(offer.availability)
      if (status) statuses.add(status)
    }
  }

  const microdata = scope.find('[itemprop="availability"]')
  microdata.each((_, element) => {
    const status = schemaStatus($(element).attr("href") ?? $(element).attr("content"))
    if (status) statuses.add(status)
  })

  if (statuses.size === 1) return result([...statuses][0])
  if (statuses.size > 1) return unknown

  if (storeId === "amazon" && /auf lager|in stock/i.test(stockText)) return result("in_stock")

  const preorderButtons = scope.find("button, input[type='submit'], a[role='button']").filter((_, element) => {
    const button = $(element)
    return !button.is("[disabled], [aria-disabled='true'], [hidden]") &&
      /^(?:pre[ -]?order(?: now)?|ennakkotilaa(?: nyt)?|vorbestellen(?: jetzt)?)$/i.test((button.text() || button.attr("value") || "").trim())
  })
  if (preorderButtons.length) return result("preorder")

  return unknown
}
