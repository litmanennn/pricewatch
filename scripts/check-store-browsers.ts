import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { checkBrowserAvailability } from "../src/lib/browser-availability"
import { zeldaStores } from "../src/lib/zelda-stores"

async function main() {
  const selectedStore = process.argv[2]
  const stores = zeldaStores.filter((store) =>
    ["amazon", "nintendo"].includes(store.id) && (!selectedStore || store.id === selectedStore)
  )
  if (!stores.length) throw new Error("Usage: npm run test:stores -- [amazon|nintendo]")
  const outputDirectory = path.resolve("data/browser-checks")
  const results = []
  for (const store of stores) {
    try {
      const availability = await checkBrowserAvailability(store, outputDirectory)
      const result = { store: store.id, checkedAt: new Date().toISOString(), availability }
      results.push(result)
      console.log(JSON.stringify(result))
    } catch (error) {
      const result = { store: store.id, error: error instanceof Error ? error.message : "Browser check failed" }
      results.push(result)
      console.error(JSON.stringify(result))
    }
  }
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(results, null, 2))
  if (results.some((result) => !("availability" in result) || !["in_stock", "preorder", "out_of_stock"].includes(result.availability.status))) {
    process.exitCode = 1
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Browser check failed")
  process.exitCode = 1
})
