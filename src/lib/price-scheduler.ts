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

  priceWatchIntervalHours?: number
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


export async function runPriceCheck() {
  if (
    globalForPriceWatch
      .priceWatchSchedulerRunning
  ) {
    return null
  }


  globalForPriceWatch
    .priceWatchSchedulerRunning =
      true


  try {
    const result =
      await checkAllProducts()

    globalForPriceWatch
      .priceWatchLastCheckAt =
        new Date().toISOString()

    return result

  } finally {
    globalForPriceWatch
      .priceWatchSchedulerRunning =
        false
  }
}


async function runScheduledCheck() {
  globalForPriceWatch
    .priceWatchNextCheckAt =
      null


  try {
    await runPriceCheck()

  } catch (error) {
    console.error(
      "[PriceWatch] Automaattinen tarkistus epäonnistui:",
      error
    )
  } finally {

    scheduleNextCheck()
  }
}


function scheduleNextCheck() {
  const intervalHours =
    getIntervalHours()

  const intervalMilliseconds =
    intervalHours *
    60 *
    60 *
    1000


  globalForPriceWatch
    .priceWatchIntervalHours =
      intervalHours


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
    syncSchedulerInterval()
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


function syncSchedulerInterval() {
  const intervalHours =
    getIntervalHours()


  if (
    !globalForPriceWatch
      .priceWatchSchedulerStarted ||
    globalForPriceWatch
      .priceWatchSchedulerRunning ||
    globalForPriceWatch
      .priceWatchIntervalHours ===
        intervalHours
  ) {
    return
  }


  if (
    globalForPriceWatch
      .priceWatchTimer
  ) {
    clearTimeout(
      globalForPriceWatch
        .priceWatchTimer
    )
  }


  console.log(
    `[PriceWatch] Tarkistusväli muuttui: ${intervalHours} h.`
  )


  scheduleNextCheck()
}


export function getPriceSchedulerStatus() {
  syncSchedulerInterval()

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
