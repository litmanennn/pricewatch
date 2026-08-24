import {
  eq,
} from "drizzle-orm"

import {
  db,
} from "@/db"

import {
  priceHistory,
  products,
} from "@/db/schema"

import {
  sendPriceDropNotification,
} from "@/lib/discord"

import {
  fetchHintaProduct,
} from "@/lib/hinta"


export type CheckProductResult = {
  product: typeof products.$inferSelect

  previousPrice: number

  newPrice: number

  priceDropped: boolean

  priceIncreased: boolean

  priceChanged: boolean

  discord: {
    configured: boolean
    sent: boolean
  }
}


export async function checkProduct(
  productId: number
): Promise<CheckProductResult> {

  /*
   * Haetaan nykyinen tuote tietokannasta.
   */

  const existingProducts =
    await db
      .select()
      .from(products)
      .where(
        eq(
          products.id,
          productId
        )
      )
      .limit(1)


  const product =
    existingProducts[0]


  if (!product) {

    throw new Error(
      "Tuotetta ei löytynyt."
    )
  }


  if (!product.active) {

    throw new Error(
      "Tuotteen seuranta ei ole aktiivinen."
    )
  }


  /*
   * Haetaan tämänhetkinen Hinta.fi-hinta.
   */

  const hintaProduct =
    await fetchHintaProduct(
      product.url
    )


  const previousPrice =
    product.currentPrice


  const newPrice =
    hintaProduct.price


  const priceDropped =
    newPrice <
    previousPrice


  const priceIncreased =
    newPrice >
    previousPrice


  const newLowestPrice =
    Math.min(
      product.lowestPrice,
      newPrice
    )


  const now =
    new Date()


  /*
   * Tallennetaan jokainen onnistunut
   * tarkistus hintahistoriaan.
   */

  await db
    .insert(
      priceHistory
    )
    .values({
      productId:
        product.id,

      price:
        newPrice,

      checkedAt:
        now,
    })


  /*
   * Päivitetään tuotteen nykyinen tila.
   */

  await db
    .update(
      products
    )
    .set({
      name:
        hintaProduct.name,

      currentPrice:
        newPrice,

      lowestPrice:
        newLowestPrice,

      lastCheckedAt:
        now,
    })
    .where(
      eq(
        products.id,
        product.id
      )
    )


  /*
   * Discord-hälytys vain hinnan laskiessa.
   */

  let discord = {
    configured:
      Boolean(
        process.env
          .DISCORD_WEBHOOK_URL
      ),

    sent:
      false,
  }


  if (priceDropped) {

    discord =
      await sendPriceDropNotification({
        productName:
          hintaProduct.name,

        productUrl:
          product.url,

        previousPrice,

        newPrice,

        lowestPrice:
          newLowestPrice,
      })
  }


  /*
   * Haetaan päivitetty rivi takaisin.
   */

  const updatedProducts =
    await db
      .select()
      .from(products)
      .where(
        eq(
          products.id,
          product.id
        )
      )
      .limit(1)


  const updatedProduct =
    updatedProducts[0]


  if (!updatedProduct) {

    throw new Error(
      "Päivitetyn tuotteen lukeminen epäonnistui."
    )
  }


  return {
    product:
      updatedProduct,

    previousPrice,

    newPrice,

    priceDropped,

    priceIncreased,

    priceChanged:
      newPrice !==
      previousPrice,

    discord,
  }
}