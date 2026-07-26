# Depart

Voorbereidings-app voor een kampeervakantie met de auto. Eén vraag, één antwoord:
**ben ik klaar om te vertrekken?**

Geen boekingssite en geen reisdagboek. Wel: documenten met een geldigheidsstatus,
inpaklijsten die je afvinkt, de etappes van de rit en de noodnummers die je
onderweg nodig hebt.

## Wat er in zit

| Scherm         | Wat je er doet                                                                |
| -------------- | ----------------------------------------------------------------------------- |
| **Overzicht**  | Vertrekbord met split-flap aftelklok, de kampeerplek, en vier statusregels     |
| **Documenten** | Paspoorten en verzekeringen uploaden, geldigheid zien, bekijken en verwijderen |
| **Inpaklijst** | Uitrusting en een koffer per reiziger, met voortgangsbalk en standaardlijst    |
| **Onderweg**   | Etappes met tijden (versleepbaar), verplicht in de auto per land, noodnummers  |

Meerdere reizen kunnen naast elkaar bestaan; bovenin wissel je ertussen.

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

| Variabele        | Verplicht | Waarvoor                                            |
| ---------------- | --------- | --------------------------------------------------- |
| `DATABASE_URL`   | ja        | Verbinding met Postgres. Wordt nooit gelogd.        |
| `DOCUMENTS_PATH` | ja        | Map op het gemounte volume waar de bestanden staan  |
| `PORT`           | nee       | Standaard 8080                                      |
| `API_TOKEN`      | nee       | Bearer-token op `/api/*`. Leeg = open api.          |
| `LOG_LEVEL`      | nee       | `debug`, `info` (standaard), `warn` of `error`      |

De frontend krijgt `API_TOKEN` en `APP_TITLE` bij het opstarten van de container
in `env.js` gerenderd, dus dezelfde image werkt in elke omgeving.

## Datamodel

`trip` is de wortel; alles hangt eraan met een foreign key en
`on delete cascade`. Verwijder je een reis, dan gaan de reizigers, documenten,
inpaklijsten, etappes en noodnummers mee — en de api haalt daarna ook de map met
bestanden van schijf.

`traveler_id` mag leeg zijn. Dat betekent: hoort bij het hele gezin of bij de
auto, zoals de groene kaart of de gasfles.

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
  `depart.lan.stamx.nl` en is alleen binnen het eigen netwerk bereikbaar. De api
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
- **Er worden geen bestandsnamen, documentinhoud of de volledige `DATABASE_URL`
  gelogd.** De `Authorization`- en `Cookie`-headers worden uit de logs geweerd.
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

- Weer via Open-Meteo (het weerblok op het overzicht staat er al, zonder gegevens)
- Route en rijtijd via OpenRouteService
- Landreisadvies van Buitenlandse Zaken
- Offline gebruik onderweg als PWA
