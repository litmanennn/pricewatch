import { config } from "dotenv"

import { sendAvailabilityNotification } from "../src/lib/discord"
import { zeldaStores } from "../src/lib/zelda-stores"

config({ quiet: true })

async function main() {
  const store = zeldaStores[0]
  const result = await sendAvailabilityNotification({
    storeName: store.name,
    storeUrl: store.url,
    status: "preorder",
    test: true,
  })
  console.log(JSON.stringify({
    configured: result.configured,
    sent: result.sent,
    confirmedByDiscord: Boolean(result.messageId),
  }))
  if (!result.sent) process.exitCode = 1
}

void main().catch(() => {
  console.error("Discord-testin suorittaminen epäonnistui.")
  process.exitCode = 1
})
