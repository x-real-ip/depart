# Opdracht: bouw "Depart" — kampeervakantie-app

Plak deze opdracht in een codetool (Claude Code, Cursor, of een gewoon Claude-gesprek). Pas de onderdelen aan die voor jou anders zijn.

---

## Wat ik wil laten bouwen

Bouw een webapp met de naam **Depart**: een persoonlijke voorbereidings-app voor één geplande kampeervakantie met de auto. Alles wat je vóór en tijdens de reis nodig hebt op één plek. De app is voor mijn eigen gezin, maar moet zo opgezet zijn dat meerdere reizen en meerdere reizigers mogelijk zijn.

**De app is geen boekingssite en geen reisdagboek.** Het doel is één vraag beantwoorden: *ben ik klaar om te vertrekken?*

## Techniek

**Frontend**
- React met Vite, TypeScript
- Tailwind CSS voor styling
- Responsive, mobiel eerst (max breedte ± 480 px, gecentreerd op desktop)
- Alle serveraanroepen via één laag in `src/lib/api.ts`; de rest van de app praat nooit rechtstreeks met `fetch`

**Backend**
- Node met Fastify (of Express), TypeScript
- PostgreSQL als database — gebruik de bestaande Postgres uit de gitops-repo, geen eigen database-instantie
- Migraties met een migratietool (bijvoorbeeld `node-pg-migrate` of Drizzle), versiebeheerd in de repo, uitgevoerd bij het opstarten van de app
- Geüploade documenten worden **niet** in de database opgeslagen, maar als bestand op een gemount volume (zie *Infrastructuur*); in de database staat alleen het pad, de bestandsnaam en het type
- Configuratie uitsluitend via environment-variabelen, nooit hardcoded

**Repository**
- De app-repo `depart` staat al gecloned in de gitops-repo; bouw daarin verder
- Structuur: `apps/web` (frontend), `apps/api` (backend), `deploy/` (manifests), `ansible/` (playbooks)

## Datamodel

Dit is het schema in Postgres. Alle tabellen krijgen `created_at` en `updated_at`, en verwijzingen zijn echte foreign keys met `on delete cascade` vanuit `trip`.

```ts
Trip        { id, naam, bestemming, land, regio, vertrekdatum, terugdatum,
              campingNaam, plaatsnummer, plaatsInfo, afstandKm, rijtijdMin, tolKosten }
Traveler    { id, tripId, naam, geboortejaar }
Document    { id, tripId, travelerId | null, type, omschrijving,
              geldigTot | null, bestandspad, bestandsnaam, mimetype, grootte }
PackItem    { id, tripId, travelerId | null, groep, label, afgevinkt }
Stop        { id, tripId, plaats, tijd, opmerking, volgorde }
Contact     { id, tripId, label, telefoonnummer }
```

- `travelerId = null` betekent: hoort bij het hele gezin of bij de auto (bijvoorbeeld gasfles, groene kaart).
- `groep` op PackItem: `"uitrusting"` (gezamenlijk kampeermateriaal) of `"koffer"` (per persoon).
- `status` op Document wordt berekend, niet opgeslagen: **ontbreekt** (geen bestand), **let op** (geldigTot binnen 6 maanden na terugdatum), **geldig** (rest).

## Schermen

**1. Overzicht**
- Header met vertrekbord-uitstraling: van-plaats → naar-plaats, afstand, en een aftelklok in split-flap stijl (aantal dagen tot vertrek, twee losse tegels)
- Kaart met de kampeerplek: campingnaam, regio, plaatsnummer, aantal nachten
- Weer naast elkaar: bestemming en thuis, met dag- en nachttemperatuur, windkracht en regenkans
- Statusblok met vier regels: documenten, uitrusting (%), koffers (%), reisadvies. Elke regel klikbaar naar het bijbehorende tabblad.

**2. Documenten**
- Lijst per document met type, bij wie het hoort, geldigheid en statuslabel
- Uploaden via bestandskiezer naar de API; bestand belandt op het gemounte documentenvolume; geüpload bestand kunnen bekijken en verwijderen (bij verwijderen gaat ook het bestand van schijf)
- Alleen pdf, jpeg, png en heic toestaan, maximaal 20 MB per bestand; type controleren op de inhoud, niet op de extensie
- Nieuw document toevoegen met formulier (type, reiziger of gezin/auto, geldig tot)
- Standaardtypes voorstellen bij een nieuwe reis: paspoort of ID per persoon, camping card, campingreservering, groene kaart, kentekenbewijs, reisverzekering, milieuvignet

**3. Inpaklijst**
- Schakelaar bovenaan: Uitrusting + één knop per reiziger
- Per lijst een voortgangsbalk en afvinkbare items; afvinken direct opslaan
- Items toevoegen, herschrijven en verwijderen
- Knop "Standaardlijst toevoegen" die een kampeer-basislijst invult (tent, haringen en hamer, luifel, gasfles, gasslang, stroomkabel 25 m, adapter, koelbox, campingtafel, stoelen, grondzeil, zaklampen, EHBO-kit)
- Knop om alle vinkjes te wissen, met bevestiging

**4. Onderweg**
- Etappes van de rit: plaats, geplande tijd, opmerking; toevoegen, bewerken, verslepen om te sorteren
- Afstand, rijtijd en tolkosten bovenaan
- Blok "verplicht in de auto" per land dat je doorkruist (gevarendriehoek, veiligheidshesje, EHBO-kit, vignet)
- Noodnummers als grote knoppen met `tel:`-link, zelf aan te vullen

**Reisbeheer**
- Startscherm bij lege app: reis aanmaken (naam, bestemming, datums, camping, reizigers)
- Instellingen: reis bewerken, reizigers toevoegen of verwijderen, reis verwijderen met bevestiging
- Meerdere reizen kunnen bestaan; bovenin wisselen tussen reizen

## Vormgeving

Uitstraling: **vertrekbord op een vliegveld, gecombineerd met kampeergroen.** Rustig, veel witruimte, kaarten met afgeronde hoeken (16 px). Geen drukte — de app moet rust geven.

Kleuren:
- `navy #12283C` — header en donkere vlakken
- `navyDeep #0B1B2B` — split-flap tegels
- `amber #FFB703` — accent, actief tabblad, voortgang
- `forest #2F6B4F` — kampeerplek en afgevinkt
- `canvas #F5F2EC` — achtergrond
- `ink #1B2B36` en `slate #647585` — tekst
- `red #C94A3F` — ontbrekend document

Fonts via Google Fonts: **Bricolage Grotesque** (koppen, extrabold), **Archivo** (tekst), **IBM Plex Mono** (labels, cijfers, alles in kapitalen met ruime letterafstand).

Signature-element: de split-flap aftelklok. Houd de rest daaromheen stil.

## Kwaliteitseisen

- Werkt op een telefoonscherm zonder horizontaal scrollen
- Zichtbare focus bij toetsenbordnavigatie; alle interactieve elementen zijn echte buttons of links
- Respecteer `prefers-reduced-motion`
- Lege staten zijn een uitnodiging, geen mededeling: "Nog geen documenten. Voeg je paspoort toe om te beginnen."
- Interface in het Nederlands, tekst in gewone taal, actieve werkwoorden op knoppen
- Geen `<form>` met submit-navigatie; gebruik onClick-handlers

## Infrastructuur

### Opslag op TrueNAS via Ansible

Schrijf een Ansible-playbook dat extra opslag op TrueNAS aanmaakt voor de geüploade reisdocumenten. Het playbook staat in `ansible/truenas-depart-storage.yml` in de depart-repo en is **zelfstandig uit te voeren** — dus niet afhankelijk van de rest van de deployment, met een eigen inventory en eigen variabelen.

Eisen aan het playbook:

- **Idempotent**: twee keer draaien verandert niets extra's en geeft geen fouten
- Praat met de TrueNAS middleware-API (REST v2.0) via `ansible.builtin.uri`, of gebruik de `arensb.truenas` collection als die op de doelversie werkt — kies één aanpak en houd die vast
- Maakt een dataset aan onder de bestaande pool, met instelbare naam, quota, recordsize en compressie
- Zet eigenaar, groep en rechten zo dat alleen de applicatie erbij kan (geen wereldleesbare paspoortscans)
- Deelt het volume uit zodat de applicatie het kan mounten — NFS-export beperkt tot de nodes van het cluster, of iSCSI als dat in deze omgeving gebruikelijker is
- Schakelt snapshots in met een bewaarschema (bijvoorbeeld dagelijks, veertien dagen bewaren)
- Draait `--check` zonder fouten
- Alle instellingen in `ansible/group_vars/` of een `vars/depart-storage.yml`: hostnaam TrueNAS, poolnaam, datasetnaam, quota, toegestane cliënt-IP's
- Het API-token komt uit Ansible Vault of een environment-variabele, **nooit** als platte tekst in de repo
- Een `README.md` in `ansible/` met het commando om het playbook te draaien en welke variabelen verplicht zijn

Vraag mij naar de concrete waarden (hostnaam, pool, gewenste quota, IP-reeks) voordat je die zelf verzint — vul ze niet met plaatsvervangers die er echt uitzien.

### Database uit de gitops-repo

De applicatie krijgt **geen eigen Postgres**. Gebruik de bestaande Postgres-instantie die al in de gitops-repo gedefinieerd staat.

- Zoek eerst uit hoe die instantie in de repo is opgezet en volg dat patroon, in plaats van een nieuwe aanpak te introduceren
- Voeg een database `depart` en een eigen gebruiker toe volgens datzelfde patroon; die gebruiker heeft alleen rechten op de eigen database
- De verbindingsgegevens komen bij de app binnen als een secret, op de manier waarop dat in deze repo al gebeurt (secret-beheer nooit als platte tekst committen)
- De app leest `DATABASE_URL`, `DOCUMENTS_PATH` en `PORT` uit de omgeving

### Deployment

- De depart-repo staat al gecloned in de gitops-repo; voeg de deployment-manifests toe volgens de conventies die daar al gelden — bekijk hoe bestaande applicaties zijn opgezet en sluit daarop aan
- Twee workloads: `depart-web` en `depart-api`. Het documentenvolume wordt alleen door de api gemount
- Voeg een health-endpoint `/healthz` toe aan de api dat ook de databaseverbinding controleert
- Migraties draaien als aparte stap vóór de api start, niet parallel aan meerdere replicas

### Beveiliging

Er staan paspoortscans in deze app. Daarom:

- De app is niet publiek bereikbaar zonder authenticatie — regel toegang zoals dat in deze omgeving gebruikelijk is (reverse proxy met login, of alleen binnen het eigen netwerk)
- Documenten worden geserveerd via de api, nooit als statisch bestand met een raadbare URL
- Log nooit bestandsnamen, documentinhoud of de volledige `DATABASE_URL`
- Zet in de README kort neer waar de documenten fysiek staan en hoe je ze terugzet uit een snapshot

## Werkwijze

Bouw in deze volgorde en laat na elke stap iets werkends zien:

1. Ansible-playbook voor de TrueNAS-opslag — los te draaien en te testen, staat verder los van de app
2. Database aanmaken in de bestaande Postgres, migraties opzetten, api met `/healthz` die verbinding maakt
3. Projectopzet frontend, reis aanmaken en reizigers toevoegen, end-to-end tot in de database
4. Inpaklijst volledig werkend (toevoegen, afvinken, opslaan, standaardlijst)
5. Documenten met upload naar het volume en statusberekening
6. Onderweg met etappes en noodnummers
7. Overzicht dat de gegevens uit 4–6 samenvat
8. Deployment-manifests in de gitops-repo
9. Vormgeving nalopen en aanscherpen

Stel vragen als iets in deze opdracht onduidelijk is voordat je begint te bouwen.

---

## Later toevoegen (nog niet nu)

- Weer via een echte API (OpenWeatherMap of Open-Meteo — Open-Meteo werkt zonder sleutel)
- Route en rijtijd via OpenRouteService of Google Directions
- Landreisadvies van Buitenlandse Zaken
- Offline gebruik onderweg: de app als PWA met een lokale cache, zodat noodnummers en inpaklijst ook zonder bereik werken
