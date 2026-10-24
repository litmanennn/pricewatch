import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

import type { AvailabilityStatus } from "@/lib/zelda-stores"

export const availabilityChecks = sqliteTable("availability_checks", {
  storeId: text("store_id").primaryKey(),
  status: text("status").$type<AvailabilityStatus>().notNull(),
  detail: text("detail").notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
})

export const availabilityNotifications = sqliteTable("availability_notifications", {
  storeId: text("store_id").primaryKey(),
  status: text("status").$type<"preorder" | "in_stock" | "out_of_stock">().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})


export const products =
  sqliteTable(
    "products",
    {
      id: integer("id")
        .primaryKey({
          autoIncrement: true,
        }),

      name: text("name")
        .notNull(),

      url: text("url")
        .notNull()
        .unique(),

      // Hinta silloin, kun tuote lisättiin seurantaan.
      initialPrice:
        real("initial_price")
          .notNull(),

      // Viimeisimmällä tarkistuksella havaittu hinta.
      currentPrice:
        real("current_price")
          .notNull(),

      // Alin PriceWatchin koskaan havaitsema hinta.
      lowestPrice:
        real("lowest_price")
          .notNull(),

      active:
        integer(
          "active",
          {
            mode: "boolean",
          }
        )
          .notNull()
          .default(true),

      createdAt:
        integer(
          "created_at",
          {
            mode: "timestamp_ms",
          }
        )
          .notNull(),

      lastCheckedAt:
        integer(
          "last_checked_at",
          {
            mode: "timestamp_ms",
          }
        )
          .notNull(),
    }
  )


export const priceHistory =
  sqliteTable(
    "price_history",
    {
      id: integer("id")
        .primaryKey({
          autoIncrement: true,
        }),

      productId:
        integer("product_id")
          .notNull()
          .references(
            () => products.id,
            {
              onDelete:
                "cascade",
            }
          ),

      price:
        real("price")
          .notNull(),

      checkedAt:
        integer(
          "checked_at",
          {
            mode: "timestamp_ms",
          }
        )
          .notNull(),
    }
  )
