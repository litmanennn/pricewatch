export async function register() {

  /*
   * Scheduler saa käynnistyä vain
   * Node.js-runtimeympäristössä.
   */

  if (
    process.env.NEXT_RUNTIME ===
    "nodejs"
  ) {

    const {
      startPriceScheduler,
    } =
      await import(
        "@/lib/price-scheduler"
      )


    startPriceScheduler()
  }
}