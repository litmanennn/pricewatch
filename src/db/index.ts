import {
  mkdirSync,
} from "node:fs"

import {
  dirname,
} from "node:path"

import {
  DatabaseSync,
} from "node:sqlite"

import {
  drizzle,
} from "drizzle-orm/node-sqlite"


const databaseFile =
  process.env.DB_FILE_NAME ??
  "./data/pricewatch.db"


const databaseDirectory =
  dirname(databaseFile)


/*
 * Hakemiston luominen on turvallista
 * myös build-vaiheessa.
 *
 * Varsinaisia SQL-komentoja EI kuitenkaan
 * ajeta ennen kuin sovellus oikeasti
 * tarvitsee tietokantaa.
 */

mkdirSync(
  databaseDirectory,
  {
    recursive: true,
  }
)


export const db =
  drizzle(
    databaseFile
  )


type PriceWatchDatabaseGlobal = {
  priceWatchDatabaseInitialized?: boolean
}


const globalForDatabase =
  globalThis as typeof globalThis &
    PriceWatchDatabaseGlobal


/*
 * Tätä kutsutaan vasta runtime-tilassa
 * ennen tietokannan käyttöä.
 *
 * Näin Next.js build-workerit eivät
 * kilpaile samasta SQLite-tiedostosta.
 */

export function ensureDatabaseInitialized() {

  if (
    globalForDatabase
      .priceWatchDatabaseInitialized
  ) {
    return
  }


  const sqlite =
    new DatabaseSync(
      databaseFile
    )


  try {

    /*
     * Jos tietokanta olisi hetkellisesti
     * lukittu, SQLite odottaa enintään
     * viisi sekuntia.
     */

    sqlite.exec(`
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT NOT NULL,

        url TEXT NOT NULL UNIQUE,

        initial_price REAL NOT NULL,

        current_price REAL NOT NULL,

        lowest_price REAL NOT NULL,

        active INTEGER NOT NULL DEFAULT 1,

        created_at INTEGER NOT NULL,

        last_checked_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        product_id INTEGER NOT NULL,

        price REAL NOT NULL,

        checked_at INTEGER NOT NULL,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS price_history_product_id_idx
        ON price_history(product_id);

      CREATE INDEX IF NOT EXISTS price_history_checked_at_idx
        ON price_history(checked_at);
    `)


    globalForDatabase
      .priceWatchDatabaseInitialized =
        true


    console.log(
      "[PriceWatch] SQLite-tietokanta valmis."
    )

  } finally {

    sqlite.close()

  }
}