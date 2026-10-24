type SendPriceDropNotificationInput = {
  productName: string
  productUrl: string
  previousPrice: number
  newPrice: number
  lowestPrice: number
}


type DiscordNotificationResult = {
  configured: boolean
  sent: boolean
  messageId?: string
}

export async function sendAvailabilityNotification(input: {
  storeName: string
  storeUrl: string
  status: "preorder" | "in_stock"
  test?: boolean
}): Promise<DiscordNotificationResult> {
  const configuredUrl = process.env.DISCORD_WEBHOOK_URL?.trim()
  if (!configuredUrl) return { configured: false, sent: false }

  try {
    const webhookUrl = new URL(configuredUrl)
    // Ask Discord to confirm that the message was actually saved.
    webhookUrl.searchParams.set("wait", "true")
    const content = input.test
      ? "🧪 **PriceWatch – Zelda-saatavuusvahdin testiviesti**\nDiscord-yhteys toimii. Tämä on testi, ei saatavuushavainto."
      : `🎮 **Zelda-juhlaversio ${input.status === "preorder" ? "ennakkotilattavissa" : "varastossa"}!**\nNintendo Switch 2 · The Legend of Zelda 40th Anniversary Edition\n**${input.storeName}**\n${input.storeUrl}`

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "PriceWatch", content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error(`[PriceWatch] Saatavuusilmoituksen lähetys epäonnistui (HTTP ${response.status}).`)
      return { configured: true, sent: false }
    }
    const message = await response.json().catch(() => null)
    if (typeof message?.id !== "string") {
      console.error("[PriceWatch] Discord ei vahvistanut saatavuusilmoituksen tallennusta.")
      return { configured: true, sent: false }
    }
    return { configured: true, sent: true, messageId: message.id }
  } catch {
    // Never log the error object: it may contain the secret webhook URL.
    console.error("[PriceWatch] Saatavuusilmoituksen Discord-yhteys epäonnistui.")
    return { configured: true, sent: false }
  }
}


const euroFormatter =
  new Intl.NumberFormat(
    "fi-FI",
    {
      style: "currency",
      currency: "EUR",
    }
  )


export async function sendPriceDropNotification(
  input: SendPriceDropNotificationInput
): Promise<DiscordNotificationResult> {

  const webhookUrl =
    process.env.DISCORD_WEBHOOK_URL?.trim()


  if (!webhookUrl) {

    console.log(
      "Discord webhookia ei ole määritetty."
    )

    return {
      configured: false,
      sent: false,
    }
  }


  const dropAmount =
    input.previousPrice -
    input.newPrice


  const dropPercent =
    input.previousPrice > 0
      ? (
          dropAmount /
          input.previousPrice
        ) * 100
      : 0


  try {

    const response =
      await fetch(
        webhookUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            username:
              "PriceWatch",

            allowed_mentions: {
              parse: [],
            },

            embeds: [
              {
                title:
                  "📉 Hinta laski!",

                description:
                  `**${input.productName}**`,

                url:
                  input.productUrl,

                color:
                  0x16a34a,

                fields: [
                  {
                    name:
                      "Uusi hinta",

                    value:
                      `**${euroFormatter.format(
                        input.newPrice
                      )}**`,

                    inline:
                      true,
                  },

                  {
                    name:
                      "Edellinen hinta",

                    value:
                      euroFormatter.format(
                        input.previousPrice
                      ),

                    inline:
                      true,
                  },

                  {
                    name:
                      "Hinnanlasku",

                    value:
                      `−${euroFormatter.format(
                        dropAmount
                      )} (−${dropPercent.toFixed(
                        1
                      )} %)`,

                    inline:
                      true,
                  },

                  {
                    name:
                      "Alin havaittu",

                    value:
                      euroFormatter.format(
                        input.lowestPrice
                      ),

                    inline:
                      true,
                  },
                ],

                footer: {
                  text:
                    "PriceWatch",
                },

                timestamp:
                  new Date()
                    .toISOString(),
              },
            ],
          }),
        }
      )


    if (!response.ok) {

      const responseText =
        await response.text()

      console.error(
        "Discord webhook epäonnistui:",
        response.status,
        responseText
      )

      return {
        configured: true,
        sent: false,
      }
    }


    return {
      configured: true,
      sent: true,
    }

  } catch (error) {

    console.error(
      "Discord webhook -virhe:",
      error
    )

    return {
      configured: true,
      sent: false,
    }
  }
}
