import * as cheerio from "cheerio"

export type HintaProduct = {
  name: string
  price: number
  url: string
}

type JsonObject = Record<string, unknown>

const MAX_HTML_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000


async function readHtml(response: Response) {
  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase() ?? ""

  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    throw new Error("Linkki ei palauttanut HTML-sivua.")
  }

  const contentLength = Number(
    response.headers.get("content-length")
  )

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_HTML_BYTES
  ) {
    throw new Error("Tuotesivu on liian suuri käsiteltäväksi.")
  }

  if (!response.body) {
    throw new Error("Tuotesivu palautti tyhjän vastauksen.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  let html = ""

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    receivedBytes += value.byteLength

    if (receivedBytes > MAX_HTML_BYTES) {
      await reader.cancel()
      throw new Error("Tuotesivu on liian suuri käsiteltäväksi.")
    }

    html += decoder.decode(value, { stream: true })
  }

  return html + decoder.decode()
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase()

  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local") ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^169\.254\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  )
}

function parsePrice(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? value
      : null
  }

  if (typeof value !== "string") {
    return null
  }

  const cleaned = value
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")

  const price = Number(cleaned)

  return Number.isFinite(price) && price > 0
    ? price
    : null
}

function objectsFromJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.flatMap(objectsFromJsonLd)
  }

  if (!value || typeof value !== "object") {
    return []
  }

  const object = value as JsonObject
  const graph = objectsFromJsonLd(object["@graph"])

  return [object, ...graph]
}

function jsonLdProduct($: cheerio.CheerioAPI) {
  const objects: JsonObject[] = []

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      objects.push(
        ...objectsFromJsonLd(JSON.parse($(element).text()))
      )
    } catch {
      // Sivun muu kelvollinen tuotetieto voi silti riittää.
    }
  })

  return objects.find((object) => {
    const type = object["@type"]
    return type === "Product" ||
      (Array.isArray(type) && type.includes("Product"))
  })
}

function offerPrice(product: JsonObject | undefined) {
  if (!product) {
    return null
  }

  const offers = Array.isArray(product.offers)
    ? product.offers
    : [product.offers]

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") {
      continue
    }

    const object = offer as JsonObject
    const price =
      parsePrice(object.price) ??
      parsePrice(object.lowPrice)

    if (price) {
      return price
    }
  }

  return null
}

export async function fetchHintaProduct(
  url: string
): Promise<HintaProduct> {
  const parsedUrl = new URL(url)

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    isPrivateHostname(parsedUrl.hostname)
  ) {
    throw new Error("Linkin täytyy olla julkinen verkkosivu.")
  }

  const response = await fetch(parsedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(
      REQUEST_TIMEOUT_MS
    ),
  })

  if (!response.ok) {
    throw new Error(`Sivu palautti HTTP-virheen ${response.status}.`)
  }

  const $ = cheerio.load(
    await readHtml(response)
  )
  const product = jsonLdProduct($)

  const name =
    (typeof product?.name === "string" ? product.name.trim() : "") ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim()

  const hintaMatch = $("body")
    .text()
    .replace(/\s+/g, " ")
    .match(/Halvin hinta\s+([\d\s]+,\d{2})\s*€/i)

  const price =
    offerPrice(product) ??
    parsePrice($('meta[property="product:price:amount"]').attr("content")) ??
    parsePrice($('meta[itemprop="price"]').attr("content")) ??
    parsePrice($('[itemprop="price"]').first().attr("content")) ??
    parsePrice($('[data-price]').first().attr("data-price")) ??
    parsePrice(hintaMatch?.[1])

  if (!name) {
    throw new Error("Tuotteen nimeä ei löytynyt sivulta.")
  }

  if (!price) {
    throw new Error("Tuotteen hintaa ei löytynyt sivulta.")
  }

  return {
    name,
    price,
    url: parsedUrl.toString(),
  }
}
