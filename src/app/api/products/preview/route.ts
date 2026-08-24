import { NextResponse } from "next/server"
import { z } from "zod"

import { fetchHintaProduct } from "@/lib/hinta"

const requestSchema = z.object({
  url: z.url(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = requestSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Please enter a valid URL.",
        },
        {
          status: 400,
        }
      )
    }

    const product = await fetchHintaProduct(
      result.data.url
    )

    return NextResponse.json(product)
  } catch (error) {
    console.error(error)

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error"

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    )
  }
}