import { eq } from "drizzle-orm"

import { db, ensureDatabaseInitialized } from "@/db"
import { availabilityNotifications } from "@/db/schema"
import { sendAvailabilityNotification } from "@/lib/discord"
import type { AvailabilityStatus, ZeldaStore } from "@/lib/zelda-stores"

export async function notifyAvailability(store: ZeldaStore, status: AvailabilityStatus) {
  // An unsuccessful check must not reset the last notification.
  if (status !== "preorder" && status !== "in_stock" && status !== "out_of_stock") return
  ensureDatabaseInitialized()

  const [previous] = await db.select().from(availabilityNotifications)
    .where(eq(availabilityNotifications.storeId, store.id)).limit(1)
  if (previous?.status === status) return

  if (status === "preorder" || status === "in_stock") {
    const notification = await sendAvailabilityNotification({
      storeName: store.name,
      storeUrl: store.url,
      status,
    })
    // Retry on the next check if the webhook is missing or delivery failed.
    if (!notification.sent) return
  }

  // A confirmed sold-out state rearms the alert for the next restock.
  const values = {
    status,
    updatedAt: new Date(),
  }
  await db.insert(availabilityNotifications).values({ storeId: store.id, ...values })
    .onConflictDoUpdate({ target: availabilityNotifications.storeId, set: values })
}
