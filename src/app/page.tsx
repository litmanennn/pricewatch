"use client"

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  Clock3,
  ExternalLink,
  Gauge,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"

import {
  Button,
  buttonVariants,
} from "@/components/ui/button"

import {
  Card,
  CardContent,
} from "@/components/ui/card"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"


type Product = {
  id: number
  name: string
  url: string
  initialPrice: number
  currentPrice: number
  lowestPrice: number
  active: boolean
  createdAt: string
  lastCheckedAt: string
}


type CheckResult = {
  product: Product
  previousPrice: number
  newPrice: number
  priceDropped: boolean
  priceIncreased: boolean
  priceChanged: boolean

  discord: {
    configured: boolean
    sent: boolean
  }
}


type SchedulerStatus = {
  started: boolean
  running: boolean
  intervalHours: number
  nextCheckAt: string | null
  lastCheckAt: string | null
}


const euroFormatter =
  new Intl.NumberFormat(
    "fi-FI",
    {
      style: "currency",
      currency: "EUR",
    }
  )


function formatDate(
  value: string
) {
  return new Date(
    value
  ).toLocaleString(
    "fi-FI",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  )
}


function formatCheckTime(
  value: string
) {
  return new Date(
    value
  ).toLocaleString(
    "fi-FI",
    {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  )
}


export default function Home() {
  const [
    products,
    setProducts,
  ] =
    useState<Product[]>([])


  const [
    dialogOpen,
    setDialogOpen,
  ] =
    useState(false)


  const [
    url,
    setUrl,
  ] =
    useState("")


  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState("")


  const [
    loading,
    setLoading,
  ] =
    useState(false)


  const [
    productsLoading,
    setProductsLoading,
  ] =
    useState(true)


  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    )


  const [
    scheduler,
    setScheduler,
  ] =
    useState<SchedulerStatus | null>(
      null
    )


  const [
    checkingProducts,
    setCheckingProducts,
  ] =
    useState<Set<number>>(
      new Set()
    )


  const [
    deletingProducts,
    setDeletingProducts,
  ] =
    useState<Set<number>>(
      new Set()
    )


  const [
    checkMessages,
    setCheckMessages,
  ] =
    useState<
      Record<number, string>
    >({})


  /*
   * Tuotteiden lataus.
   *
   * Päivitetään myös automaattisesti
   * kerran minuutissa, jotta schedulerin
   * tekemät hintamuutokset tulevat UI:hin.
   */

  useEffect(() => {
    async function loadProducts(
      initialLoad = false
    ) {
      try {
        const response =
          await fetch(
            "/api/products",
            {
              cache: "no-store",
            }
          )


        if (!response.ok) {
          throw new Error(
            "Tuotteiden lataaminen epäonnistui."
          )
        }


        const data: Product[] =
          await response.json()


        setProducts(data)

      } catch (error) {
        console.error(error)

      } finally {
        if (initialLoad) {
          setProductsLoading(false)
        }
      }
    }


    loadProducts(true)


    const timer =
      window.setInterval(
        () => {
          loadProducts(false)
        },
        60_000
      )


    return () => {
      window.clearInterval(timer)
    }
  }, [])


  /*
   * Schedulerin tilan lataus.
   */

  useEffect(() => {
    async function loadScheduler() {
      try {
        const response =
          await fetch(
            "/api/scheduler",
            {
              cache: "no-store",
            }
          )


        if (!response.ok) {
          return
        }


        const data:
          SchedulerStatus =
          await response.json()


        setScheduler(data)

      } catch (error) {
        console.error(
          "Schedulerin tilan lataaminen epäonnistui:",
          error
        )
      }
    }


    loadScheduler()


    const timer =
      window.setInterval(
        loadScheduler,
        30_000
      )


    return () => {
      window.clearInterval(timer)
    }
  }, [])


  /*
   * TUOTTEEN LISÄYS
   */

  async function handleAddProduct(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setLoading(true)
    setError(null)


    try {
      const response =
        await fetch(
          "/api/products",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                url,
              }),
          }
        )


      const data =
        await response.json()


      if (!response.ok) {
        throw new Error(
          data.error ??
            "Tuotteen lisääminen epäonnistui."
        )
      }


      setProducts(
        (currentProducts) => [
          data,
          ...currentProducts,
        ]
      )


      setUrl("")
      setError(null)
      setDialogOpen(false)

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Jotain meni pieleen."
      )

    } finally {
      setLoading(false)
    }
  }


  /*
   * MANUAALINEN HINTATARKISTUS
   */

  async function handleCheckNow(
    productId: number
  ) {
    setCheckingProducts(
      (current) => {
        const next =
          new Set(current)

        next.add(productId)

        return next
      }
    )


    setCheckMessages(
      (current) => ({
        ...current,

        [productId]:
          "Tarkistetaan hintaa...",
      })
    )


    try {
      const response =
        await fetch(
          `/api/products/${productId}/check`,
          {
            method: "POST",
          }
        )


      const data =
        await response.json()


      if (!response.ok) {
        throw new Error(
          data.error ??
            "Hinnan tarkistus epäonnistui."
        )
      }


      const result =
        data as CheckResult


      setProducts(
        (currentProducts) =>
          currentProducts.map(
            (product) =>
              product.id === productId
                ? result.product
                : product
          )
      )


      if (
        result.priceDropped
      ) {
        const drop =
          result.previousPrice -
          result.newPrice


        if (
          result.discord.sent
        ) {
          setCheckMessages(
            (current) => ({
              ...current,

              [productId]:
                `Hinta laski ${euroFormatter.format(
                  drop
                )}. Discord-ilmoitus lähetettiin.`,
            })
          )

        } else if (
          !result.discord.configured
        ) {
          setCheckMessages(
            (current) => ({
              ...current,

              [productId]:
                `Hinta laski ${euroFormatter.format(
                  drop
                )}, mutta Discord-webhookia ei ole määritetty.`,
            })
          )

        } else {
          setCheckMessages(
            (current) => ({
              ...current,

              [productId]:
                `Hinta laski ${euroFormatter.format(
                  drop
                )}, mutta Discord-ilmoituksen lähetys epäonnistui.`,
            })
          )
        }

      } else if (
        result.priceIncreased
      ) {
        const increase =
          result.newPrice -
          result.previousPrice


        setCheckMessages(
          (current) => ({
            ...current,

            [productId]:
              `Hinta nousi ${euroFormatter.format(
                increase
              )}.`,
          })
        )

      } else {
        setCheckMessages(
          (current) => ({
            ...current,

            [productId]:
              "Hinta ei ole muuttunut.",
          })
        )
      }

    } catch (error) {
      setCheckMessages(
        (current) => ({
          ...current,

          [productId]:
            error instanceof Error
              ? error.message
              : "Hinnan tarkistus epäonnistui.",
        })
      )

    } finally {
      setCheckingProducts(
        (current) => {
          const next =
            new Set(current)

          next.delete(productId)

          return next
        }
      )
    }
  }


  /*
   * TUOTTEEN POISTO
   */

  async function handleDeleteProduct(
    product: Product
  ) {
    const confirmed =
      window.confirm(
        `Poistetaanko "${product.name}" seurannasta?\n\nMyös tuotteen hintahistoria poistetaan.`
      )


    if (!confirmed) {
      return
    }


    setDeletingProducts(
      (current) => {
        const next =
          new Set(current)

        next.add(product.id)

        return next
      }
    )


    try {
      const response =
        await fetch(
          `/api/products/${product.id}`,
          {
            method: "DELETE",
          }
        )


      const data =
        await response.json()


      if (!response.ok) {
        throw new Error(
          data.error ??
            "Tuotteen poistaminen epäonnistui."
        )
      }


      setProducts(
        (currentProducts) =>
          currentProducts.filter(
            (currentProduct) =>
              currentProduct.id !==
              product.id
          )
      )


      setCheckMessages(
        (current) => {
          const next = {
            ...current,
          }

          delete next[
            product.id
          ]

          return next
        }
      )

    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Tuotteen poistaminen epäonnistui."
      )

    } finally {
      setDeletingProducts(
        (current) => {
          const next =
            new Set(current)

          next.delete(
            product.id
          )

          return next
        }
      )
    }
  }


  const activeCount =
    products.filter(
      (product) =>
        product.active
    ).length


  const discountedCount =
    products.filter(
      (product) =>
        product.currentPrice <
        product.initialPrice
    ).length


  /*
   * Viimeisin onnistunut tarkistus
   * kaikista tuotteista.
   *
   * Tämä sisältää sekä manuaaliset että
   * automaattiset tarkistukset.
   */

  const latestCheckAt =
    products.length > 0
      ? products.reduce(
          (
            latest,
            product
          ) => {
            const current =
              new Date(
                product.lastCheckedAt
              ).getTime()

            return Math.max(
              latest,
              current
            )
          },
          0
        )
      : null


  const filteredProducts =
    useMemo(
      () => {
        const query =
          searchQuery
            .trim()
            .toLocaleLowerCase(
              "fi-FI"
            )


        if (!query) {
          return products
        }


        return products.filter(
          (product) =>
            product.name
              .toLocaleLowerCase(
                "fi-FI"
              )
              .includes(query)
        )
      },
      [
        products,
        searchQuery,
      ]
    )


  return (
    <main className="min-h-screen">

      {/* TOP BAR */}

      <div className="border-b bg-background/80 backdrop-blur-xl">

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">

          <div className="flex items-center gap-3">

            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">

              <TrendingDown className="size-5" />

            </div>


            <div>

              <div className="flex items-center gap-2">

                <h1 className="text-lg font-bold tracking-tight">
                  PriceWatch
                </h1>


                <Badge
                  variant="secondary"
                  className="hidden sm:inline-flex"
                >
                  Hinta.fi
                </Badge>

              </div>


              <p className="hidden text-xs text-muted-foreground sm:block">
                Oma hintavahti
              </p>

            </div>

          </div>


          <Dialog
            open={dialogOpen}

            onOpenChange={(open) => {
              setDialogOpen(open)

              if (!open) {
                setError(null)
              }
            }}
          >

            <DialogTrigger
              render={<Button />}
            >

              <Plus className="size-4" />

              Lisää tuote

            </DialogTrigger>


            <DialogContent className="sm:max-w-lg">

              <form
                onSubmit={
                  handleAddProduct
                }
              >

                <DialogHeader>

                  <DialogTitle className="text-xl">
                    Lisää seurattava tuote
                  </DialogTitle>


                  <DialogDescription>
                    Liitä Hinta.fi-tuotteen
                    osoite. PriceWatch hakee
                    nykyisen hinnan ja aloittaa
                    seurannan automaattisesti.
                  </DialogDescription>

                </DialogHeader>


                <div className="grid gap-6 py-6">

                  <div className="grid gap-2">

                    <Label htmlFor="url">
                      Hinta.fi-tuotelinkki
                    </Label>


                    <Input
                      id="url"
                      type="url"
                      placeholder="https://hinta.fi/..."
                      value={url}

                      onChange={(event) =>
                        setUrl(
                          event.target.value
                        )
                      }

                      required
                    />


                    <p className="text-xs leading-5 text-muted-foreground">
                      Nykyinen hinta tallennetaan
                      lähtöhinnaksi. PriceWatch
                      ilmoittaa Discordiin, jos
                      myöhemmässä tarkistuksessa
                      löytyy alempi hinta.
                    </p>

                  </div>


                  {error && (

                    <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">

                      {error}

                    </div>

                  )}

                </div>


                <DialogFooter>

                  <Button
                    type="button"
                    variant="outline"

                    onClick={() => {
                      setDialogOpen(false)
                      setError(null)
                    }}
                  >
                    Peruuta
                  </Button>


                  <Button
                    type="submit"
                    disabled={loading}
                  >

                    {loading ? (

                      <>
                        <RefreshCw className="size-4 animate-spin" />

                        Haetaan tuotetta...
                      </>

                    ) : (

                      <>
                        <Plus className="size-4" />

                        Lisää seurantaan
                      </>

                    )}

                  </Button>

                </DialogFooter>

              </form>

            </DialogContent>

          </Dialog>

        </div>

      </div>


      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">


        {/* HERO */}

        <section className="mb-8">

          <Badge
            variant="outline"
            className="mb-3 rounded-full bg-background/60 px-3 py-1"
          >

            <Sparkles className="mr-1 size-3.5" />

            Automaattinen hintaseuranta

          </Badge>


          <h2 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">

            Seuraa hintoja.

            <span className="text-muted-foreground">
              {" "}
              PriceWatch huomaa laskun.
            </span>

          </h2>


          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">

            Lisää Hinta.fi-tuote kerran.
            PriceWatch tallentaa lähtöhinnan
            ja seuraa hinnan muutoksia
            puolestasi.

          </p>

        </section>


        {/* STATS */}

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">


          <Card className="border-border/70 shadow-sm">

            <CardContent className="flex items-center gap-4 p-5">

              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">

                <PackageSearch className="size-5" />

              </div>


              <div>

                <p className="text-sm text-muted-foreground">
                  Seurannassa
                </p>

                <p className="mt-0.5 text-2xl font-bold tracking-tight">
                  {activeCount}
                </p>

                <p className="text-xs text-muted-foreground">
                  aktiivista tuotetta
                </p>

              </div>

            </CardContent>

          </Card>


          <Card className="border-border/70 shadow-sm">

            <CardContent className="flex items-center gap-4 p-5">

              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">

                <TrendingDown className="size-5 text-primary" />

              </div>


              <div>

                <p className="text-sm text-muted-foreground">
                  Hinta laskenut
                </p>

                <p className="mt-0.5 text-2xl font-bold tracking-tight">
                  {discountedCount}
                </p>

                <p className="text-xs text-muted-foreground">
                  tuotetta alle lähtöhinnan
                </p>

              </div>

            </CardContent>

          </Card>


          {/* VIIMEISIN TARKISTUS */}

          <Card className="border-border/70 shadow-sm">

            <CardContent className="flex items-center gap-4 p-5">

              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">

                <Clock3 className="size-5" />

              </div>


              <div className="min-w-0">

                <p className="text-sm text-muted-foreground">
                  Viimeisin tarkistus
                </p>

                <p className="mt-0.5 truncate text-lg font-bold tracking-tight">

                  {latestCheckAt
                    ? formatCheckTime(
                        new Date(
                          latestCheckAt
                        ).toISOString()
                      )
                    : "—"}

                </p>

                <p className="text-xs text-muted-foreground">
                  viimeisin hintahaku
                </p>

              </div>

            </CardContent>

          </Card>


          {/* SEURAAVA TARKISTUS */}

          <Card className="border-border/70 shadow-sm">

            <CardContent className="flex items-center gap-4 p-5">

              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">

                {scheduler?.running ? (

                  <RefreshCw className="size-5 animate-spin text-primary" />

                ) : (

                  <Clock3 className="size-5 text-primary" />

                )}

              </div>


              <div className="min-w-0">

                <p className="text-sm text-muted-foreground">
                  Seuraava tarkistus
                </p>


                <p className="mt-0.5 truncate text-lg font-bold tracking-tight">

                  {scheduler?.running

                    ? "Tarkistetaan nyt"

                    : scheduler?.nextCheckAt

                      ? formatCheckTime(
                          scheduler.nextCheckAt
                        )

                      : "—"}

                </p>


                <p className="text-xs text-muted-foreground">

                  {scheduler
                    ? `${scheduler.intervalHours} h välein`
                    : "Ladataan..."}

                </p>

              </div>

            </CardContent>

          </Card>

        </section>


        {/* PRODUCTS HEADER */}

        {!productsLoading &&
          products.length > 0 && (

          <section className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div>

              <h3 className="text-lg font-semibold">
                Seurattavat tuotteet
              </h3>


              <p className="text-sm text-muted-foreground">

                {products.length}{" "}

                {products.length === 1
                  ? "tuote"
                  : "tuotetta"}{" "}

                tallennettuna

              </p>

            </div>


            <div className="relative w-full sm:w-72">

              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />


              <Input
                value={searchQuery}

                onChange={(event) =>
                  setSearchQuery(
                    event.target.value
                  )
                }

                placeholder="Hae tuotteista..."

                className="bg-background pl-9"
              />

            </div>

          </section>

        )}


        {/* LOADING */}

        {productsLoading && (

          <Card className="border-dashed bg-background/60">

            <CardContent className="flex min-h-64 items-center justify-center">

              <div className="flex flex-col items-center gap-3 text-muted-foreground">

                <RefreshCw className="size-5 animate-spin" />

                <p className="text-sm">
                  Ladataan tuotteita...
                </p>

              </div>

            </CardContent>

          </Card>

        )}


        {/* EMPTY */}

        {!productsLoading &&
          products.length === 0 && (

          <Card className="overflow-hidden border-dashed bg-background/60">

            <CardContent className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center">

              <div className="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10">

                <PackageSearch className="size-7 text-primary" />

              </div>


              <h3 className="text-2xl font-semibold tracking-tight">
                Ei vielä seurattavia tuotteita
              </h3>


              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Lisää ensimmäinen
                Hinta.fi-tuote.
                PriceWatch tallentaa
                tämänhetkisen hinnan ja
                alkaa seurata muutoksia.
              </p>


              <Button
                size="lg"
                className="mt-7"

                onClick={() =>
                  setDialogOpen(true)
                }
              >

                <Plus className="size-4" />

                Lisää ensimmäinen tuote

              </Button>

            </CardContent>

          </Card>

        )}


        {/* NO SEARCH RESULTS */}

        {!productsLoading &&
          products.length > 0 &&
          filteredProducts.length === 0 && (

          <Card className="border-dashed bg-background/60">

            <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">

              <Search className="mb-3 size-6 text-muted-foreground" />

              <p className="font-medium">
                Tuotteita ei löytynyt
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Kokeile toista hakusanaa.
              </p>

            </CardContent>

          </Card>

        )}


        {/* PRODUCTS */}

        {!productsLoading &&
          filteredProducts.length > 0 && (

          <section className="grid gap-5">

            {filteredProducts.map(
              (product) => {

                const totalDifference =
                  product.currentPrice -
                  product.initialPrice


                const totalPercent =
                  product.initialPrice > 0

                    ? (
                        totalDifference /
                        product.initialPrice
                      ) * 100

                    : 0


                const priceDown =
                  totalDifference < 0


                const priceUp =
                  totalDifference > 0


                const checking =
                  checkingProducts.has(
                    product.id
                  )


                const deleting =
                  deletingProducts.has(
                    product.id
                  )


                const checkMessage =
                  checkMessages[
                    product.id
                  ]


                return (

                  <Card
                    key={product.id}

                    className={cn(
                      "overflow-hidden border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md",

                      priceDown &&
                        "border-primary/30"
                    )}
                  >

                    <CardContent className="p-0">

                      <div className="grid lg:grid-cols-[1fr_auto]">


                        <div className="p-5 sm:p-6">


                          <div className="flex flex-wrap items-center gap-2">

                            <Badge
                              variant="secondary"
                              className="rounded-full"
                            >
                              Hinta.fi
                            </Badge>


                            <Badge
                              variant="outline"
                              className="rounded-full"
                            >

                              <Gauge className="mr-1 size-3.5" />

                              Seurannassa

                            </Badge>


                            {priceDown && (

                              <Badge className="rounded-full bg-primary text-primary-foreground">

                                <TrendingDown className="mr-1 size-3.5" />

                                Hinta laskenut

                              </Badge>

                            )}

                          </div>


                          <h3 className="mt-4 max-w-3xl text-lg font-semibold leading-snug sm:text-xl">

                            {product.name}

                          </h3>


                          <div className="mt-6">

                            <p className="text-sm font-medium text-muted-foreground">
                              Nykyinen hinta
                            </p>


                            <div className="mt-1 flex flex-wrap items-end gap-3">


                              <p className="text-4xl font-bold tracking-tight sm:text-5xl">

                                {euroFormatter.format(
                                  product.currentPrice
                                )}

                              </p>


                              {priceDown && (

                                <div className="mb-1 flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">

                                  <TrendingDown className="size-3.5" />

                                  {euroFormatter.format(
                                    Math.abs(
                                      totalDifference
                                    )
                                  )}

                                  {" · "}

                                  {Math.abs(
                                    totalPercent
                                  ).toFixed(1)}

                                  %

                                </div>

                              )}


                              {priceUp && (

                                <div className="mb-1 flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">

                                  <TrendingUp className="size-3.5" />

                                  +

                                  {euroFormatter.format(
                                    totalDifference
                                  )}

                                </div>

                              )}

                            </div>

                          </div>


                          <div className="mt-6 grid gap-3 sm:grid-cols-3">


                            <div className="rounded-2xl border bg-muted/40 p-4">

                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Lähtöhinta
                              </p>

                              <p className="mt-1 text-lg font-semibold">

                                {euroFormatter.format(
                                  product.initialPrice
                                )}

                              </p>

                            </div>


                            <div className="rounded-2xl border bg-muted/40 p-4">

                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Alin havaittu
                              </p>

                              <p className="mt-1 text-lg font-semibold">

                                {euroFormatter.format(
                                  product.lowestPrice
                                )}

                              </p>

                            </div>


                            <div className="rounded-2xl border bg-muted/40 p-4">

                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Muutos alusta
                              </p>


                              <p
                                className={cn(
                                  "mt-1 text-lg font-semibold",

                                  priceDown &&
                                    "text-primary"
                                )}
                              >

                                {totalDifference === 0

                                  ? "Ei muutosta"

                                  : `${totalDifference > 0 ? "+" : "−"}${euroFormatter.format(
                                      Math.abs(
                                        totalDifference
                                      )
                                    )}`}

                              </p>

                            </div>

                          </div>


                          {checkMessage && (

                            <div
                              className={cn(
                                "mt-5 rounded-xl border px-4 py-3 text-sm",

                                checkMessage.includes(
                                  "Hinta laski"
                                )

                                  ? "border-primary/20 bg-primary/8 text-foreground"

                                  : "bg-muted/40 text-muted-foreground"
                              )}
                            >

                              {checkMessage}

                            </div>

                          )}


                          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">

                            <span>

                              Tarkistettu{" "}

                              {formatDate(
                                product.lastCheckedAt
                              )}

                            </span>


                            <span className="hidden size-1 rounded-full bg-border sm:block" />


                            <span>

                              Seuranta aloitettu{" "}

                              {formatDate(
                                product.createdAt
                              )}

                            </span>

                          </div>

                        </div>


                        {/* ACTIONS */}

                        <div className="flex items-center gap-2 border-t bg-muted/20 p-4 lg:flex-col lg:justify-start lg:border-l lg:border-t-0">


                          <Button
                            variant="outline"
                            className="flex-1 lg:w-36"

                            disabled={
                              checking ||
                              deleting
                            }

                            onClick={() =>
                              handleCheckNow(
                                product.id
                              )
                            }
                          >

                            <RefreshCw
                              className={cn(
                                "size-4",

                                checking &&
                                  "animate-spin"
                              )}
                            />

                            {checking
                              ? "Tarkistetaan..."
                              : "Tarkista nyt"}

                          </Button>


                          <a
                            href={product.url}

                            target="_blank"

                            rel="noreferrer"

                            aria-label="Avaa Hinta.fi"

                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "icon",
                              }),

                              deleting &&
                                "pointer-events-none opacity-50"
                            )}
                          >

                            <ExternalLink className="size-4" />

                          </a>


                          <Button
                            variant="outline"
                            size="icon"

                            disabled={
                              deleting ||
                              checking
                            }

                            aria-label="Poista tuote"

                            onClick={() =>
                              handleDeleteProduct(
                                product
                              )
                            }
                          >

                            {deleting ? (

                              <RefreshCw className="size-4 animate-spin" />

                            ) : (

                              <Trash2 className="size-4" />

                            )}

                          </Button>

                        </div>

                      </div>

                    </CardContent>

                  </Card>

                )
              }
            )}

          </section>

        )}

      </div>

    </main>
  )
}