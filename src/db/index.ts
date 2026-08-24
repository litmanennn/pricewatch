import { drizzle } from "drizzle-orm/node-sqlite"


const databaseFile =
  process.env.DB_FILE_NAME ??
  "./data/pricewatch.db"


export const db =
  drizzle(databaseFile)