This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Zelda-saatavuusvahti

Etusivun oma osio seuraa Nintendo Switch 2 The Legend of Zelda 40th Anniversary Edition
-juhlaversiota kuudessa kaupassa: My Nintendo Store, Verkkokauppa.com, Amazon.de,
POWER, Telia ja DNA. Voit tarkistaa kaikki kaupat kerralla tai yhden kaupan erikseen.
Viimeisin tulos ja tarkistusaika tallennetaan SQLite-tietokantaan.

Automaattinen hinta- ja saatavuustarkistus tehdään oletuksena **tunnin välein**
palvelimen ollessa käynnissä. Tarkistusvälin voi muuttaa ympäristömuuttujalla
`PRICE_CHECK_INTERVAL_HOURS`. Ensimmäinen automaattitarkistus tehdään tunnin kuluttua
käynnistyksestä; heti tarkistuksen saa painikkeesta **Tarkista saatavuus**.

Selain päivittää tallennetut saatavuustiedot minuutin välein. Epäselvä tieto tai
kaupan estämä automaattitarkistus näytetään erikseen. Kauppalinkit toimivat myös
silloin, kun automaattista saatavuutta ei voida vahvistaa.

Saatavuuden tulkinnan testit: `npm test`.

Zelda-saatavuusvahti käyttää samaa `DISCORD_WEBHOOK_URL`-asetusta kuin hintavahti.
Lyhyt Discord-ilmoitus lähetetään kauppakohtaisesti, kun tuote havaitaan ensimmäisen
kerran ennakkotilattavana tai varastossa, tai kun saatavuustila muuttuu. Sama tila
ei aiheuta uutta ilmoitusta joka tunti. Vahvistettu loppuminen mahdollistaa uuden
hälytyksen seuraavasta saatavuudesta. Tarkistusvirhe ei nollaa ilmoitustietoa.
Epäonnistunutta lähetystä yritetään uudelleen seuraavalla saatavuustarkistuksella.

`npm run test:discord` lähettää yhden selvästi merkityn testiviestin määritettyyn
webhookiin. Tavallinen `npm test` käyttää testitietokantaa ja simuloitua Discordia.

Amazon ja Nintendo Store tarkistetaan Playwrightilla sekä tunnin automaattiajossa
että käsin tarkistettaessa. Chromium käynnistetään erikseen kutakin kauppaa varten
ja suljetaan aina tarkistuksen lopuksi, myös virhetilanteessa. Selainajoja on
kerrallaan enintään yksi. Käynnistys aikakatkaistaan 15 sekunnissa ja itse
tarkistus viimeistään 60 sekunnissa. Tarkistusten välillä selain ei jää käyntiin.

Erillinen koe samalla selainkoodilla:

```bash
npx playwright install chromium
npm run test:stores
# Vain yksi kauppa:
npm run test:stores -- nintendo
```

Selain säilyttää vain oman profiilinsa levyllä tietokannan vieressä sijaitsevassa
`playwright/`-hakemistossa (oletuksena `data/playwright/`). Profiilien hakemiston voi
halutessaan määrittää muuttujalla `AVAILABILITY_BROWSER_PROFILE_DIR`.
Kokeen raportti tallennetaan hakemistoon `data/browser-checks/`. Nintendo-koe
tallentaa `nintendo.png`-kuvakaappauksen ja `nintendo.json`-raportin, josta näet
sivun osoitteen, otsikon, sivulta luetun saatavuustiedon, tarkistusajan ja
vahvistuksen selaimen sulkemisesta. Amazonille syntyvät vastaavat tiedostot.
Näitä hakemistoja
ei lisätä versionhallintaan. Erillinen koe ei muuta tuotannon saatavuustietoja
eikä lähetä Discord-viestejä.

Docker-image sisältää Chromiumin ja sen Linux-riippuvuudet. Compose käyttää
Playwrightin [virallista seccomp-profiilia](https://github.com/microsoft/playwright/blob/v1.64.0/utils/docker/seccomp_profile.json),
jotta selain voi toimia omalla suojaeristyksellään. Säilytä
`docker/playwright-seccomp.json` compose-tiedoston rinnalla samalla polulla.
`init: true` huolehtii päättyneiden lapsiprosessien siivouksesta.

PR:n GitHub Actions tarkistaa lintin, testit ja ARM64-Docker-buildin ennen
yhdistämistä. Docker-image julkaistaan vasta `main`-haaraan yhdistämisen jälkeen.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
