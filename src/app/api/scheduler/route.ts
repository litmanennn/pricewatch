import {
  desc,
} from "drizzle-orm"

import {
  NextResponse,
} from "next/server"

import {
  z,
} from "zod"

import {
  db,
  ensureDatabaseInitialized,
} from "@/db"

import {
  priceHistory,
  products,
} from "@/db/schema"

import {
  fetchHintaProduct,
} from "@/lib/hinta"


const createProductSchema =
  z.object({
    url:
      z.url(),
  })


export async function GET() {

  try {

    ensureDatabaseInitialized()


    const result =
      await db
        .select()
        .from(products)
        .orderBy(
          desc(
            products.createdAt
          )
        )


    return NextResponse.json(
      result
    )

  } catch (error) {

    console.error(
      error
    )


    return NextResponse.json(
      {
        error:
          "Tuotteiden lataaminen epäonnistui.",
      },
      {
        status: 500,
      }
    )
  }
}


export async function POST(
  request: Request
) {

  try {

    ensureDatabaseInitialized()


    const body =
      await request.json()


    const result =
      createProductSchema
        .safeParse(
          body
        )


    if (
      !result.success
    ) {

      return NextResponse.json(
        {
          error:
            "Virheellinen Hinta.fi-linkki.",
        },
        {
          status: 400,
        }
      )
    }


    const hintaProduct =
      await fetchHintaProduct(
        result.data.url
      )


    const now =
      new Date()


    const insertedProducts =
      await db
        .insert(
          products
        )
        .values({
          name:
            hintaProduct.name,

          url:
            hintaProduct.url,

          initialPrice:
            hintaProduct.price,

          currentPrice:
            hintaProduct.price,

          lowestPrice:
            hintaProduct.price,

          active:
            true,

          createdAt:
            now,

          lastCheckedAt:
            now,
        })
        .returning()


    const product =
      insertedProducts[0]


    await db
      .insert(
        priceHistory
      )
      .values({
        productId:
          product.id,

        price:
          hintaProduct.price,

        checkedAt:
          now,
      })


    return NextResponse.json(
      product,
      {
        status: 201,
      }
    )

  } catch (error) {

    console.error(
      error
    )


    if (
      error instanceof Error &&
      error.message
        .toUpperCase()
        .includes(
          "UNIQUE"
        )
    ) {

      return NextResponse.json(
        {
          error:
            "Tämä tuote on jo seurannassa.",
        },
        {
          status: 409,
        }
      )
    }


    const message =
      error instanceof Error
        ? error.message
        : "Tuntematon virhe."


    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status: 500,
      }
    )
  }
}