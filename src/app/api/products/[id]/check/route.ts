import {
  NextResponse,
} from "next/server"

import {
  checkProduct,
} from "@/lib/check-product"


type RouteContext = {
  params: Promise<{
    id: string
  }>
}


export async function POST(
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


    const result =
      await checkProduct(
        productId
      )


    return NextResponse.json(
      result
    )

  } catch (error) {

    console.error(
      "Hintatarkistus epäonnistui:",
      error
    )


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