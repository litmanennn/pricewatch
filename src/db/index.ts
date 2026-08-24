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


/*
 * Varmistetaan, että tietokannan
 * hakemisto on olemassa.
 */

const databaseDirectory =
  dirname(databaseFile)


mkdirSync(
  databaseDirectory,
  {
    recursive: true,
  }
)


/*
 * Avataan SQLite hetkeksi suoraan
 * Node.js:n omalla sqlite-moduulilla.
 *
 * Tällä alustetaan tietokanta ja
 * tarvittavat taulut automaattisesti.
 */

const sqlite =
  new DatabaseSync(
    databaseFile
  )


sqlite.exec(`
  PRAGMA foreign_keys = ON;

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


/*
 * Alustuksen jälkeen suora SQLite-yhteys
 * voidaan sulkea.
 */

sqlite.close()


/*
 * Varsinainen sovellus käyttää Drizzleä.
 *
 * Tämä tapa toimii nykyisen
 * drizzle-orm/node-sqlite-version kanssa.
 */

export const db =
  drizzle(
    databaseFile
  )