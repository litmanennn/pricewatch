import {
  eq,
} from "drizzle-orm"

import {
  db,
  ensureDatabaseInitialized,
} from "@/db"

import {
  products,
} from "@/db/schema"

import {
  checkProduct,
} from "@/lib/check-product"


export async function checkAllProducts() {

  ensureDatabaseInitialized()


  const startedAt =
    new Date()


  console.log(
    `[PriceWatch] Automaattinen tarkistus alkoi ${startedAt.toLocaleString(
      "fi-FI"
    )}`
  )


  const activeProducts =
    await db
      .select()
      .from(products)
      .where(
        eq(
          products.active,
          true
        )
      )


  console.log(
    `[PriceWatch] Tarkistetaan ${activeProducts.length} tuotetta.`
  )


  let succeeded =
    0


  let failed =
    0


  let priceDrops =
    0


  for (
    const product
    of activeProducts
  ) {

    try {

      console.log(
        `[PriceWatch] Tarkistetaan: ${product.name}`
      )


      const result =
        await checkProduct(
          product.id
        )


      succeeded++


      if (
        result.priceDropped
      ) {

        priceDrops++


        console.log(
          `[PriceWatch] Hinta laski: ${product.name} | ${result.previousPrice} € -> ${result.newPrice} €`
        )

      } else if (
        result.priceIncreased
      ) {

        console.log(
          `[PriceWatch] Hinta nousi: ${product.name} | ${result.previousPrice} € -> ${result.newPrice} €`
        )

      } else {

        console.log(
          `[PriceWatch] Ei muutosta: ${product.name}`
        )

      }

    } catch (error) {

      failed++


      console.error(
        `[PriceWatch] Tuotteen tarkistus epäonnistui: ${product.name}`,
        error
      )

    }
  }


  console.log(
    `[PriceWatch] Tarkistus valmis. Onnistui: ${succeeded}, epäonnistui: ${failed}, hinnanlaskuja: ${priceDrops}.`
  )


  return {
    checked:
      activeProducts.length,

    succeeded,

    failed,

    priceDrops,
  }
}