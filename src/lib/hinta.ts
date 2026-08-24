import * as cheerio from "cheerio"

export type HintaProduct = {
  name: string
  price: number
  url: string
}

export async function fetchHintaProduct(
  url: string
): Promise<HintaProduct> {
  const parsedUrl = new URL(url)

  if (
    parsedUrl.hostname !== "hinta.fi" &&
    parsedUrl.hostname !== "www.hinta.fi"
  ) {
    throw new Error("URL must be a Hinta.fi product URL.")
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },

    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(
      `Hinta.fi returned HTTP ${response.status}`
    )
  }

  const html = await response.text()

  const $ = cheerio.load(html)

  const name = $("h1").first().text().trim()

  if (!name) {
    throw new Error("Could not find product name.")
  }

  const pageText = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim()

  const priceMatch = pageText.match(
    /Halvin hinta\s+([\d\s]+,\d{2})\s*€/
  )

  if (!priceMatch) {
    throw new Error(
      "Could not find the lowest price on Hinta.fi."
    )
  }

  const price = Number(
    priceMatch[1]
      .replace(/\s/g, "")
      .replace(",", ".")
  )

  if (!Number.isFinite(price)) {
    throw new Error("Invalid price returned by Hinta.fi.")
  }

  return {
    name,
    price,
    url,
  }
}