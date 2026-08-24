import {
  checkAllProducts,
} from "@/lib/check-all-products"


const DEFAULT_INTERVAL_HOURS =
  6


type PriceSchedulerGlobal = {
  priceWatchSchedulerStarted?: boolean

  priceWatchTimer?: ReturnType<
    typeof setTimeout
  >

  priceWatchNextCheckAt?: string | null

  priceWatchLastCheckAt?: string | null

  priceWatchSchedulerRunning?: boolean
}


const globalForPriceWatch =
  globalThis as typeof globalThis &
    PriceSchedulerGlobal


function getIntervalHours() {
  const rawValue =
    process.env
      .PRICE_CHECK_INTERVAL_HOURS


  const parsedValue =
    Number(
      rawValue ??
        DEFAULT_INTERVAL_HOURS
    )


  if (
    !Number.isFinite(parsedValue) ||
    parsedValue <= 0
  ) {
    return DEFAULT_INTERVAL_HOURS
  }


  return parsedValue
}


function getIntervalMilliseconds() {
  return (
    getIntervalHours() *
    60 *
    60 *
    1000
  )
}


async function runScheduledCheck() {
  globalForPriceWatch
    .priceWatchSchedulerRunning =
      true

  globalForPriceWatch
    .priceWatchNextCheckAt =
      null


  try {
    await checkAllProducts()

    globalForPriceWatch
      .priceWatchLastCheckAt =
        new Date().toISOString()

  } catch (error) {
    console.error(
      "[PriceWatch] Automaattinen tarkistus epäonnistui:",
      error
    )
  } finally {
    globalForPriceWatch
      .priceWatchSchedulerRunning =
        false

    scheduleNextCheck()
  }
}


function scheduleNextCheck() {
  const intervalMilliseconds =
    getIntervalMilliseconds()


  const nextCheck =
    new Date(
      Date.now() +
        intervalMilliseconds
    )


  globalForPriceWatch
    .priceWatchNextCheckAt =
      nextCheck.toISOString()


  console.log(
    `[PriceWatch] Seuraava automaattinen tarkistus: ${nextCheck.toLocaleString(
      "fi-FI"
    )}`
  )


  globalForPriceWatch
    .priceWatchTimer =
      setTimeout(
        runScheduledCheck,
        intervalMilliseconds
      )
}


export function startPriceScheduler() {
  if (
    globalForPriceWatch
      .priceWatchSchedulerStarted
  ) {
    return
  }


  globalForPriceWatch
    .priceWatchSchedulerStarted =
      true


  globalForPriceWatch
    .priceWatchSchedulerRunning =
      false


  console.log(
    "[PriceWatch] Automaattinen hintaseuranta käynnistyy."
  )


  scheduleNextCheck()
}


export function getPriceSchedulerStatus() {
  return {
    started:
      Boolean(
        globalForPriceWatch
          .priceWatchSchedulerStarted
      ),

    running:
      Boolean(
        globalForPriceWatch
          .priceWatchSchedulerRunning
      ),

    intervalHours:
      getIntervalHours(),

    nextCheckAt:
      globalForPriceWatch
        .priceWatchNextCheckAt ??
      null,

    lastCheckAt:
      globalForPriceWatch
        .priceWatchLastCheckAt ??
      null,
  }
}