# Depart

Voorbereidings-app voor een kampeervakantie met de auto. Eén vraag, één antwoord:
**ben ik klaar om te vertrekken?**

Geen boekingssite en geen reisdagboek. Wel: documenten met een geldigheidsstatus,
inpaklijsten die je afvinkt, de etappes van de rit en de noodnummers die je
onderweg nodig hebt.

## Wat er in zit

| Scherm         | Wat je er doet                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| **Overzicht**  | Vertrekbord met split-flap aftelklok, de kampeerplek, het weer en de route     |
| **Documenten** | Paspoorten en verzekeringen uploaden, geldigheid zien, bekijken en verwijderen |
| **Inpaklijst** | Uitrusting en een koffer per reiziger, met voortgangsbalk en standaardlijst    |
| **Onderweg**   | Etappes en overnachtingen (versleepbaar), verplicht in de auto, noodnummers    |

Meerdere reizen kunnen naast elkaar bestaan; bovenin wissel je ertussen.

## Actuele reisinformatie

Drie dingen komen van buiten, van diensten die geen sleutel nodig hebben:

- **Weer** — de dag- en nachttemperatuur, windkracht en regenkans voor elke dag
  van het verblijf, zowel op de bestemming als thuis (Open-Meteo). Ligt de reis
  verder weg dan zestien dagen, dan laat het scherm de komende week zien en zegt
  het dat erbij.
- **Route en kaart** — de rijafstand en rijtijd van thuis, via elke
  overnachting onderweg, naar de eindbestemming (OSRM), met een kaart
  (OpenStreetMap) waarop het vertrekpunt, elke overnachting en de bestemming
  als gekleurde stippen staan, verbonden met de echte weg. Een tussenstop
  zonder overnachting telt niet mee: die ligt op de route en zou de etappes
  onnodig opdelen.
- **Adres-autocomplete** — bij het thuisadres, de bestemming (bijvoorbeeld de
  camping) en een overnachting kun je typen en uit suggesties kiezen (Photon,
  gebouwd op OpenStreetMap). Kies je een suggestie, dan is het adres
  **bevestigd**: er zijn coördinaten bekend, die de route en de kaart
  nauwkeuriger maken dan het middelpunt van een stad. Typ je verder zonder te
  kiezen, dan geldt het weer als onbevestigd, en zoekt de app bij de volgende
  weer- of route-aanvraag de plaatsnaam zelf op — precies zoals wanneer je de
  autocomplete niet gebruikt.

Coördinaten worden bij de reis of de etappe bewaard, niet elke keer opnieuw
opgezocht. Wijzig je een plaatsnaam of adres zonder een nieuwe suggestie te
kiezen, dan vervallen de oude coördinaten en wordt er later opnieuw gezocht.

Een dienst die eruit ligt kan de app niet stukmaken: de endpoints geven altijd
een antwoord, met daarin waarom er geen gegevens zijn — en dat is nadrukkelijk
iets anders dan "deze plaatsnaam bestaat niet". Er gaat nooit meer naar buiten
dan een plaatsnaam, adres of coördinaat — geen reisnamen, reizigers of
documenten, en de zoekterm van de autocomplete wordt zelfs nergens gelogd
(die kan een thuisadres zijn).

## Opbouw

```
apps/api/     Fastify + TypeScript, Postgres, migraties met node-pg-migrate
apps/web/     React + Vite + TypeScript + Tailwind
ansible/      Hoe de opslag op TrueNAS wordt aangemaakt (hergebruikt de ansible-repo)
deploy/       Hoe de deployment eruitziet (manifests staan in de gitops-repo)
```

De frontend praat uitsluitend via `apps/web/src/lib/api.ts` met de server; de
rest van de app raakt `fetch` nooit aan. nginx (productie) of de Vite-proxy
(lokaal) stuurt `/api` door naar de api, dus er staat nergens een hostnaam in de
code.

De kaart gebruikt [Leaflet](https://leafletjs.com/) met OpenStreetMap-tegels —
geen sleutel nodig, maar wel een merkbare toevoeging aan de bundelgrootte
(~125 kB gzipped, was ~75 kB). Dat is de prijs van een kaart zonder sleutel of
eigen tegelserver.

## Lokaal draaien

```bash
cp .env.example .env
docker compose up --build
```

De app staat dan op <http://localhost:8080>. De migraties draaien als eigen stap
voordat de api start, precies zoals in Kubernetes.

Alleen aan de frontend werken, met de api uit compose:

```bash
cd apps/web && npm install && npm run dev
```

## Omgevingsvariabelen

De api leest alles uit de omgeving; niets is hardcoded.

| Variabele              | Verplicht | Waarvoor                                                        |
| ---------------------- | --------- | --------------------------------------------------------------- |
| `DATABASE_URL`         | ja        | Verbinding met Postgres. Wordt nooit gelogd.                    |
| `DOCUMENTS_PATH`       | ja        | Map op het gemounte volume waar de bestanden staan              |
| `PORT`                 | nee       | Standaard 8080                                                  |
| `API_TOKEN`            | nee       | Bearer-token op `/api/*`. Leeg = open api.                      |
| `LOG_LEVEL`            | nee       | `debug`, `info` (standaard), `warn` of `error`                   |
| `EXTERN_ENABLED`       | nee       | `false` schakelt weer en route uit; de app blijft werken        |
| `GEOCODING_URL`        | nee       | Open-Meteo geocoding; overschrijf voor een eigen instantie      |
| `WEATHER_URL`          | nee       | Open-Meteo forecast                                             |
| `ROUTING_URL`          | nee       | OSRM; overschrijf voor een eigen router                         |
| `ADDRESS_AUTOCOMPLETE_URL` | nee   | Photon; adres-autocomplete voor thuisadres, bestemming en overnachtingen |
| `EXTERN_CACHE_MINUTES` | nee       | Hoe lang een antwoord in het geheugen blijft (standaard 30)      |

De frontend krijgt `API_TOKEN` en `APP_TITLE` bij het opstarten van de container
in `env.js` gerenderd, dus dezelfde image werkt in elke omgeving.

## Datamodel

`trip` is de wortel; alles hangt eraan met een foreign key en
`on delete cascade`. Verwijder je een reis, dan gaan de reizigers, documenten,
inpaklijsten, etappes en noodnummers mee — en de api haalt daarna ook de map met
bestanden van schijf.

`traveler_id` mag leeg zijn. Dat betekent: hoort bij het hele gezin of bij de
auto, zoals de groene kaart of de gasfles.

Een `stop` is een tussenstop van een paar uur, óf een overnachting onderweg
(`overnachting = true`, met een adres en een aantal nachten). Alleen
overnachtingen zijn punten in de route.

Naast `thuisplaats`/`bestemming` (stad, verplicht, voor het weer en de
koptekst) is er `thuisadres`/`bestemming_adres` (optioneel, preciezer — voor de
route en de kaart). Coördinaten (`thuis_lat`/`thuis_lon`,
`bestemming_lat`/`bestemming_lon`, en `lat`/`lon` op `stop`) komen op twee
manieren tot stand: **geverifieerd**, via een gekozen suggestie uit de
adres-autocomplete, of **lazy**, doordat de api de stad zelf opzoekt zodra het
weer of de route nodig is. Beide leveren dezelfde kolommen op; het verschil zit
in de `*Geverifieerd`-vlag die de api teruggeeft, puur informatief voor de
interface.

De **status van een document** staat niet in de database maar wordt berekend:

- **ontbreekt** — er is geen bestand geüpload
- **let op** — `geldig_tot` valt binnen zes maanden na de terugdatum
- **geldig** — al het andere

## Documenten: waar staan ze en hoe zet je ze terug

De bestanden staan **niet** in de database. In de database staat alleen het
relatieve pad, de oorspronkelijke bestandsnaam, het mimetype en de grootte.

Fysiek:

| Waar            | Wat                                                            |
| --------------- | -------------------------------------------------------------- |
| TrueNAS         | zvol `ssd/containers/k8s/depart-documents`, via iSCSI           |
| Kubernetes      | `pvc-iscsi-depart-documents`, alleen door `depart-api` gemount  |
| In de container | `/data/documents/<tripId>/<documentId>.<ext>`, mode `0600`      |

Snapshots: dagelijks om 03:00, veertien dagen bewaren. Terugzetten staat stap
voor stap in [`ansible/README.md`](ansible/README.md).

## Beveiliging

Er staan paspoortscans in deze app. Daarom:

- **Niet publiek.** `depart-web` hangt aan de `private` gateway op
  `vakantie.lan.stamx.nl` en is alleen binnen het eigen netwerk bereikbaar. De api
  heeft daarbovenop een optionele bearer-token.
- **Documenten gaan altijd via de api**, op `/api/documents/:id/bestand`. Er is
  geen statisch bestand met een raadbare URL. De response krijgt
  `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` en
  `Content-Security-Policy: default-src 'none'; sandbox`.
- **Bestandstype wordt op de inhoud gecontroleerd**, niet op de extensie of de
  meegestuurde content-type. Alleen pdf, jpeg, png en heic, maximaal 20 MB. Een
  tekstbestand dat `paspoort.pdf` heet komt er niet door.
- **De naam op schijf komt niet van de gebruiker.** Bestanden heten
  `<documentId>.<ext>`; de naam die jij zag is alleen een label in de database.
- **Er worden geen bestandsnamen, documentinhoud, adres-zoektermen of de
  volledige `DATABASE_URL` gelogd.** De `Authorization`- en `Cookie`-headers
  worden uit de logs geweerd, en van elke aanvraag alleen het pad — nooit de
  querystring, want `/api/adressen?q=...` kan een thuisadres bevatten.
- **Alleen de app kan bij de bestanden.** De api draait als uid/gid 3001 en het
  volume krijgt via `fsGroup` dezelfde eigenaar.

## Infrastructuur

- **Opslag op TrueNAS** — [`ansible/README.md`](ansible/README.md)
- **Deployment in Kubernetes** — [`deploy/README.md`](deploy/README.md)

## CI/CD

| Workflow               | Wanneer                   | Wat                                                                                                 |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `build.yaml`           | elke push, PR's naar main | typecheck + build, migraties tegen een echte Postgres met `/healthz`-controle, dan images naar GHCR |
| `yamllint.yaml`        | elke push, PR's naar main | hergebruikt de yamllint-workflow uit `x-real-ip/github-actions`                                     |
| `labeler.yaml`         | bij een PR                | labels op basis van gewijzigde bestanden                                                            |
| `release-drafter.yaml` | push naar main            | houdt de release-notes bij                                                                          |

De images heten `ghcr.io/x-real-ip/depart-web` en `ghcr.io/x-real-ip/depart-api`.
`main` levert `latest`, elke commit ook een `sha-`-tag om op vast te pinnen.

## Nog niet gebouwd

- Landreisadvies van Buitenlandse Zaken
- Offline gebruik onderweg als PWA
