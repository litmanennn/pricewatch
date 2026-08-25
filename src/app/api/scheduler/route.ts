import { NextResponse } from "next/server"

import {
  getPriceSchedulerStatus,
  runPriceCheck,
} from "@/lib/price-scheduler"


export const dynamic = "force-dynamic"


export function GET() {
  return NextResponse.json(
    getPriceSchedulerStatus()
  )
}


export async function POST() {
  try {
    const result = await runPriceCheck()

    if (!result) {
      return NextResponse.json(
        {
          error: "Hintojen tarkistus on jo käynnissä.",
        },
        {
          status: 409,
        }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        error: "Hintojen tarkistus epäonnistui.",
      },
      {
        status: 500,
      }
    )
  }
}
