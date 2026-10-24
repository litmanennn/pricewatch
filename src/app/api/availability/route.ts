import { NextResponse } from "next/server"
import { z } from "zod"

import { checkAvailability, getAvailability } from "@/lib/check-availability"
import { zeldaStores } from "@/lib/zelda-stores"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const checkSchema = z.object({
  storeId: z.enum(zeldaStores.map((store) => store.id)).optional(),
}).strict()

export async function GET() {
  try {
    return NextResponse.json(await getAvailability())
  } catch (error) {
    console.error("[PriceWatch] Saatavuuden lataaminen epäonnistui:", error)
    return NextResponse.json({ error: "Saatavuustietojen lataaminen epäonnistui." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = checkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Virheellinen kauppa tai tarkistuspyyntö." }, { status: 400 })
  }
  try {
    return NextResponse.json(await checkAvailability(parsed.data.storeId))
  } catch (error) {
    console.error("[PriceWatch] Saatavuuden tarkistus epäonnistui:", error)
    return NextResponse.json({ error: "Saatavuustietojen tallentaminen epäonnistui. Kokeile uudelleen." }, { status: 500 })
  }
}
