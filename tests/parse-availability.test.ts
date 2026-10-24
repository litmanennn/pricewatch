import assert from "node:assert/strict"
import { test } from "node:test"

import { parseAvailability } from "../src/lib/parse-availability"

const name = "Nintendo Switch 2 The Legend of Zelda 40th Anniversary Edition"
const product = (availability: string) => ({
  "@type": "Product", name,
  offers: { "@type": "Offer", availability: `https://schema.org/${availability}` },
})
const page = (body: string, data?: unknown) => `<html><head><title>${name}</title>
  ${data ? `<script type="application/ld+json">${JSON.stringify(data)}</script>` : ""}
  </head><body><main><h1>${name}</h1>${body}</main></body></html>`

for (const [schema, expected] of [
  ["InStock", "in_stock"], ["LimitedAvailability", "in_stock"],
  ["PreOrder", "preorder"], ["PreSale", "preorder"],
  ["OutOfStock", "out_of_stock"], ["SoldOut", "out_of_stock"],
  ["BackOrder", "unknown"], ["InStoreOnly", "unknown"],
] as const) {
  test(`Product JSON-LD ${schema} maps to ${expected}`, () => {
    assert.equal(parseAvailability(page("", { "@graph": [product(schema)] }), "power").status, expected)
  })
}

test("DNA sold-out preorder overrides stale in-stock JSON-LD", () => {
  const html = page('<p data-testid="webshop-availability-text">Ennakkomyynnissä, tuote toistaiseksi loppunut.</p><button>Lisää ostoskoriin</button>', product("PreOrder"))
  assert.equal(parseAvailability(html, "dna").status, "out_of_stock")
})

test("Verkkokauppa online delivery unavailability overrides a cart button", () => {
  const html = page('<label for="delivery-availability-button">Toimitettuna Ei saatavilla</label><button>Lisää ostoskoriin</button>')
  assert.equal(parseAvailability(html, "verkkokauppa").status, "out_of_stock")
})

test("preorder label and generic cart button do not prove availability", () => {
  assert.equal(parseAvailability(page("Ennakkomyynnissä <button>Lisää ostoskoriin</button>"), "dna").status, "unknown")
})

test("disabled preorder button does not prove availability", () => {
  assert.equal(parseAvailability(page('<button disabled>Pre-order</button>'), "nintendo").status, "unknown")
  assert.equal(parseAvailability(page('<button aria-disabled="true">Ennakkotilaa</button>'), "nintendo").status, "unknown")
})

test("enabled explicit preorder button confirms a preorder", () => {
  assert.equal(parseAvailability(page('<button>Pre-order now</button>'), "nintendo").status, "preorder")
})

test("unrelated products and malformed JSON-LD are ignored", () => {
  const html = page('<script type="application/ld+json">invalid</script>', { ...product("InStock"), name: "Nintendo Switch 2 Mario Kart" })
  assert.equal(parseAvailability(html, "power").status, "unknown")
})

test("conflicting offers do not confirm availability", () => {
  assert.equal(parseAvailability(page("", [product("InStock"), product("OutOfStock")]), "power").status, "unknown")
})

test("an unrelated page cannot report this edition as in stock", () => {
  const html = `<html><title>Other product</title><script type="application/ld+json">${JSON.stringify(product("InStock"))}</script></html>`
  assert.equal(parseAvailability(html, "power").status, "unknown")
})

test("Amazon uses the product's availability area, excluding recommendations", () => {
  assert.equal(parseAvailability(page('<div id="availability">Auf Lager</div><aside>Out of stock</aside>'), "amazon").status, "in_stock")
  assert.equal(parseAvailability(page('<div id="availability">Derzeit nicht verfügbar.</div>'), "amazon").status, "out_of_stock")
})

test("negated Amazon stock labels cannot produce an in-stock result", () => {
  for (const text of ["Nicht auf Lager", "Not in stock", "Zurzeit nicht verfügbar"]) {
    assert.equal(parseAvailability(page(`<div id="availability">${text}</div>`), "amazon").status, "out_of_stock")
  }
})

test("another Switch 2 Zelda game does not qualify as the anniversary edition", () => {
  const otherName = "Nintendo Switch 2 The Legend of Zelda Tears of the Kingdom"
  const html = page("", { ...product("InStock"), name: otherName }).replaceAll(name, otherName)
  assert.equal(parseAvailability(html, "amazon").status, "unknown")
})

test("Amazon's short title is accepted only with the exact tracked ASIN", () => {
  const shortName = "Nintendo Switch 2 - The Legend of Zelda-Edition"
  const html = page('<input id="ASIN" value="B0F2TN43GH"><div id="availability">Derzeit nicht verfügbar.</div>').replaceAll(name, shortName)
  assert.equal(parseAvailability(html, "amazon").status, "out_of_stock")
  assert.equal(parseAvailability(html.replace("B0F2TN43GH", "B000000000"), "amazon").status, "unknown")
  assert.equal(parseAvailability(html.replaceAll(shortName, "Mario Kart"), "amazon").status, "unknown")
})

test("stock phrases in product descriptions do not override the product offer", () => {
  assert.equal(parseAvailability(page('<p>Other editions were sold out.</p>', product("InStock")), "power").status, "in_stock")
})

test("CAPTCHA and JavaScript challenges are errors, never sold-out states", () => {
  assert.equal(parseAvailability('<title>Robot Check</title>', "amazon").status, "error")
  assert.equal(parseAvailability('<title>Amazon.de</title><form action="/errors/validateCaptcha"></form>', "amazon").status, "error")
  assert.equal(parseAvailability('<noscript>The site requires JavaScript to be enabled!</noscript>', "nintendo").status, "error")
})

function teliaPage(status: string, stock: object, sku = "220006") {
  const data = ["$", "$L20", null, { product: {
    name, sku, variants: [{ sku, status, availability: [stock] }],
  } }]
  const record = `1f:${JSON.stringify(data)}\n`
  // Split the streamed record across scripts just as the transport may do.
  return page(`Ennakkomyynnissä <p>Selvitetään verkkosaatavuutta...</p>${[record.slice(0, 50), record.slice(50)].map((part) =>
    `<script>self.__next_f.push(${JSON.stringify([1, part])})</script>`).join("")}`)
}

test("Telia uses matching product stock from streamed JSON despite the loading placeholder", () => {
  assert.equal(parseAvailability(teliaPage("SOLD_OUT", { state: "NOT_AVAILABLE", noPurch: true }), "telia").status, "out_of_stock")
  assert.equal(parseAvailability(teliaPage("", { state: "AVAILABLE", noPurch: false }), "telia").status, "preorder")
  assert.equal(parseAvailability(teliaPage("SOLD_OUT", {}, "unrelated"), "telia").status, "unknown")
})
