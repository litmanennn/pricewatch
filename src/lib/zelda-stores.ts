export const zeldaStores = [
  {
    id: "nintendo",
    name: "My Nintendo Store",
    region: "Irlanti",
    url: "https://store.nintendo.com/en-ie/nintendo-switch-2-the-legend-of-zelda-40th-anniversary-edition-P00211",
  },
  {
    id: "verkkokauppa",
    name: "Verkkokauppa.com",
    region: "Suomi",
    url: "https://www.verkkokauppa.com/fi/product/1075085/Nintendo-Switch-2-The-Legend-of-Zelda-Ocarina-of-Time-40th-A",
  },
  {
    id: "amazon",
    name: "Amazon.de",
    region: "Saksa",
    url: "https://www.amazon.de/dp/B0F2TN43GH?th=1",
  },
  {
    id: "power",
    name: "POWER",
    region: "Suomi",
    url: "https://www.power.fi/pelaaminen/nintendo/nintendo-konsolit/nintendo-switch-2-the-legend-of-zelda-40th-anniversary-edition-kannettava-pelikonsoli/p-4531714/",
  },
  {
    id: "telia",
    name: "Telia",
    region: "Suomi",
    url: "https://www.telia.fi/kauppa/tuote/nintendo-switch-2-the-legend-of-zelda-pelikonsoli",
  },
  {
    id: "dna",
    name: "DNA",
    region: "Suomi",
    url: "https://kauppa.dna.fi/tuote/p/nintendo-switch-2-the-legend-of-zelda-40th-anniversary-edition-pelikonsoli",
  },
] as const

export type ZeldaStore = (typeof zeldaStores)[number]
export type ZeldaStoreId = ZeldaStore["id"]
export type AvailabilityStatus =
  | "unchecked"
  | "in_stock"
  | "preorder"
  | "out_of_stock"
  | "unknown"
  | "error"

export type StoreAvailability = ZeldaStore & {
  status: AvailabilityStatus
  detail: string
  checkedAt: string | null
}

export const availabilityLabels: Record<AvailabilityStatus, string> = {
  unchecked: "Ei vielä tarkistettu",
  in_stock: "Varastossa",
  preorder: "Ennakkotilattavissa",
  out_of_stock: "Ei saatavilla",
  unknown: "Ei vahvistettavissa",
  error: "Tarkistus epäonnistui",
}
