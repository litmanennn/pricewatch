import {
  eq,
} from "drizzle-orm"

import {
  NextResponse,
} from "next/server"

import {
  db,
} from "@/db"

import {
  priceHistory,
  products,
} from "@/db/schema"


type RouteContext = {
  params: Promise<{
    id: string
  }>
}


export async function DELETE(
  request: Request,
  context: RouteContext
) {
  void request


  try {
    const {
      id,
    } =
      await context.params


    const productId =
      Number(id)


    if (
      !Number.isInteger(
        productId
      ) ||
      productId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Virheellinen tuotteen tunniste.",
        },
        {
          status: 400,
        }
      )
    }


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
      return NextResponse.json(
        {
          error:
            "Tuotetta ei löytynyt.",
        },
        {
          status: 404,
        }
      )
    }


    /*
     * Poistetaan ensin hintahistoria.
     */

    await db
      .delete(
        priceHistory
      )
      .where(
        eq(
          priceHistory.productId,
          productId
        )
      )


    /*
     * Sitten itse tuote.
     */

    await db
      .delete(
        products
      )
      .where(
        eq(
          products.id,
          productId
        )
      )


    console.log(
      `[PriceWatch] Tuote poistettu: ${product.name}`
    )


    return NextResponse.json({
      success:
        true,

      id:
        productId,
    })

  } catch (error) {
    console.error(
      "Tuotteen poistaminen epäonnistui:",
      error
    )


    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Tuntematon virhe.",
      },
      {
        status: 500,
      }
    )
  }
}