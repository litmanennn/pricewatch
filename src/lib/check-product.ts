import {
  eq,
} from "drizzle-orm"

import {
  db,
  ensureDatabaseInitialized,
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
  product:
    typeof products.$inferSelect

  previousPrice:
    number

  newPrice:
    number

  priceDropped:
    boolean

  priceIncreased:
    boolean

  priceChanged:
    boolean

  discord: {
    configured:
      boolean

    sent:
      boolean
  }
}


export async function checkProduct(
  productId: number
): Promise<CheckProductResult> {

  ensureDatabaseInitialized()


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


  let discord = {
    configured:
      Boolean(
        process.env
          .DISCORD_WEBHOOK_URL
      ),

    sent:
      false,
  }


  if (
    priceDropped
  ) {

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


  if (
    !updatedProduct
  ) {

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