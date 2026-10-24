"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Check, CircleHelp, Clock3, Gamepad2, PackageCheck, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { availabilityLabels, zeldaStores, type StoreAvailability, type ZeldaStoreId } from "@/lib/zelda-stores"

function formatDate(value: string) {
  return new Date(value).toLocaleString("fi-FI", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  })
}

export function ZeldaAvailability({ scheduler }: {
  scheduler: { intervalHours: number; nextCheckAt: string | null; running: boolean } | null
}) {
  const [stores, setStores] = useState<StoreAvailability[]>(() => zeldaStores.map((store) => ({
    ...store,
    status: "unchecked",
    detail: "Tarkista ennakkotilaus- ja varastotilanne.",
    checkedAt: null,
  })))
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState<"all" | ZeldaStoreId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const requestVersion = useRef(0)
  const checkingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      if (checkingRef.current) return
      const version = requestVersion.current
      try {
        const response = await fetch("/api/availability", { cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new Error("Saatavuustietojen lataaminen epäonnistui. Voit yrittää tarkistusta uudelleen.")
        const data: StoreAvailability[] = await response.json()
        if (version === requestVersion.current) {
          setStores(data)
          setError(null)
        }
      } catch (error) {
        if (!controller.signal.aborted && version === requestVersion.current) {
          setError(error instanceof Error ? error.message : "Saatavuustietojen lataaminen epäonnistui.")
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  async function check(storeId?: ZeldaStoreId) {
    if (checkingRef.current) return
    checkingRef.current = true
    requestVersion.current++
    setChecking(storeId ?? "all")
    setError(null)
    setMessage("")
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storeId ? { storeId } : {}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Saatavuuden tarkistus epäonnistui.")
      setStores(data)
      setMessage(storeId ? "Kaupan tarkistus valmis." : "Kaikkien kuuden kaupan tarkistus valmis.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Saatavuuden tarkistus epäonnistui.")
    } finally {
      checkingRef.current = false
      setChecking(null)
    }
  }

  const availableCount = stores.filter((store) => store.status === "in_stock" || store.status === "preorder").length

  return (
    <section id="zelda-saatavuus" aria-labelledby="zelda-title" className="mb-10 scroll-mt-6">
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
        <div className="flex flex-col gap-5 border-b border-primary/10 bg-primary/5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:flex">
              <Gamepad2 className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Zelda · Saatavuusvahti</p>
              <h2 id="zelda-title" className="text-xl font-semibold tracking-tight sm:text-2xl">The Legend of Zelda 40th Anniversary Edition</h2>
              <p className="mt-2 text-sm text-muted-foreground">Nintendo Switch 2 · Ennakkotilaus ja verkkokauppojen varastotilanne</p>
            </div>
          </div>
          <Button size="lg" className="self-start lg:shrink-0" disabled={loading || checking !== null} onClick={() => void check()}>
            <RefreshCw className={cn("size-4", checking === "all" && "animate-spin")} aria-hidden="true" />
            {checking === "all" ? "Tarkistetaan kauppoja..." : "Tarkista saatavuus"}
          </Button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              {availableCount > 0 ? <PackageCheck className="size-4 text-primary" aria-hidden="true" /> : <CircleHelp className="size-4 text-muted-foreground" aria-hidden="true" />}
              {loading ? "Ladataan saatavuustietoja..." : availableCount > 0
                ? `Saatavilla tai ennakkotilattavissa ${availableCount} / ${stores.length} kaupassa`
                : "Saatavuutta ei ole vielä vahvistettu yhdessäkään kaupassa"}
            </p>
            {scheduler && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />Automaattisesti {scheduler.intervalHours} h välein</span>
                <span>{scheduler.running ? "Tarkistus käynnissä" : scheduler.nextCheckAt ? `· Seuraava ${formatDate(scheduler.nextCheckAt)}` : ""}</span>
              </p>
            )}
          </div>

          {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
          <p role="status" className="sr-only">{checking ? "Saatavuutta tarkistetaan." : message}</p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stores.map((store) => {
              const busy = checking === "all" || checking === store.id
              const available = store.status === "in_stock" || store.status === "preorder"
              return (
                <Card key={store.id} aria-busy={busy} className={cn("gap-0 py-0 shadow-none", available && "border-primary/30")}>
                  <CardContent className="flex h-full flex-col p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{store.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{store.region}</p>
                      </div>
                      <Badge variant="secondary" className={cn("shrink-0", available && "bg-primary/10 text-primary", store.status === "error" && "bg-destructive/10 text-destructive")}>
                        {busy ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : available ? <Check className="size-3" aria-hidden="true" /> : null}
                        {busy ? "Tarkistetaan" : availabilityLabels[store.status]}
                      </Badge>
                    </div>
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{store.detail}</p>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {store.checkedAt ? <>Tarkistettu <time dateTime={store.checkedAt}>{formatDate(store.checkedAt)}</time></> : "Ei aiempaa tarkistusta"}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a href={store.url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: available ? "default" : "outline", size: "sm" }), "flex-1")}>
                        Avaa kauppa <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">: {store.name} (avautuu uuteen välilehteen)</span>
                      </a>
                      <Button variant="ghost" size="sm" disabled={loading || checking !== null} onClick={() => void check(store.id)} aria-label={`Tarkista ${store.name} saatavuus`}>
                        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden="true" />
                        Tarkista
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Tilat kuvaavat viimeisintä tarkistusta. Saatavuus voi muuttua nopeasti. Vahvista tilausmahdollisuus kaupan sivulta.</p>
        </div>
      </div>
    </section>
  )
}
