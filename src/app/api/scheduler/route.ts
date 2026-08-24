import {
  NextResponse,
} from "next/server"

import {
  getPriceSchedulerStatus,
} from "@/lib/price-scheduler"


export async function GET() {
  return NextResponse.json(
    getPriceSchedulerStatus()
  )
}