# Opslag op TrueNAS

Depart heeft twee volumes op TrueNAS nodig:

| Volume             | Zvol                                  | Grootte | Waarvoor                                     |
| ------------------ | ------------------------------------- | ------- | -------------------------------------------- |
| `depart-db`        | `ssd/containers/k8s/depart-db`        | 5 GiB   | Postgres-data van `depart-postgresql`        |
| `depart-documents` | `ssd/containers/k8s/depart-documents` | 5 GiB   | Geüploade reisdocumenten (paspoortscans e.d.) |

Beide worden als iSCSI uitgedeeld, want dat is in deze omgeving de gebruikelijke
manier: elk bestaand PersistentVolume in de gitops-repo gebruikt
`freenas-iscsi-manual-csi` met de democratic-csi `node-manual` driver. iSCSI is
hier ook veiliger dan NFS: het volume is `ReadWriteOnce` en wordt alleen door de
`depart-api`-pod gemount, en de rechten op het bestandssysteem worden door
Kubernetes gezet (`fsGroup: 3001`) in plaats van door een export-configuratie.
Er staat dus nergens een wereldleesbare share met paspoortscans.

## Er is geen apart depart-playbook

De TrueNAS-configuratie hoort niet in deze repo maar in
[`x-real-ip/ansible`](https://github.com/x-real-ip/ansible). Daar staat al een
`truenas`-role die precies dit doet, declaratief en idempotent, via de TrueNAS
middleware (`midclt`) over SSH. Een tweede playbook hiernaast zou dezelfde
logica dubbel onderhouden. De depart-specifieke waarden zijn daarom toegevoegd
aan de bestaande variabelenbestanden van die role.

### Wat er is toegevoegd

In `roles/truenas/vars/shares.yaml`:

- twee zvols onder `shares.iscsi.zvols` (`depart-db`, `depart-documents`),
  16K volblocksize, sparse
- twee targets onder `shares.iscsi.targets` (`depart-db`, `depart-documents`)
- twee extents onder `shares.iscsi.extents`, die naar de zvols wijzen

De role koppelt targets en extents zelf aan elkaar op naam, dus meer is er niet
nodig. De portal (`0.0.0.0:3260`) bestaat al en wordt hergebruikt.

In `roles/truenas/vars/snapshots.yaml`:

- een snapshot-taak op `ssd/containers/k8s/depart-documents`: dagelijks om
  03:00, veertien dagen bewaren. De pool-brede taken op `ssd` snapshotten deze
  dataset ook al, maar bewaren maar een week; paspoortscans zijn niet opnieuw
  te maken, dus die krijgen een ruimere termijn.

### Uitvoeren

Vanuit de root van de `ansible`-repo:

```bash
# Eerst kijken wat er zou gebeuren
ansible-playbook --check playbooks/truenas_shares.yaml

# Zvols, targets en extents aanmaken
ansible-playbook playbooks/truenas_shares.yaml

# Snapshot-taken herschrijven (verwijdert eerst alle taken en zet ze
# opnieuw uit vars/snapshots.yaml — dat is bewust declaratief)
ansible-playbook --ask-vault-pass playbooks/truenas_snapshot-tasks.yaml
```

Beide playbooks zijn idempotent: ze vragen eerst de huidige staat op
(`midclt call ...query`) en maken alleen aan wat nog niet bestaat. Twee keer
draaien verandert niets extra's.

### Vereisten

- SSH-toegang als `admin` naar de hosts in de `truenas`-groep van
  `inventory/hosts.yaml` (`truenas-a` 10.0.100.11, `truenas-b` 10.0.100.12).
  De role draait op beide helften van het HA-paar.
- De pool `ssd` en de dataset `ssd/containers/k8s` bestaan al.
- Geen API-token nodig: de role gebruikt `midclt` op de TrueNAS zelf. Er staan
  dus ook geen credentials in deze repo.

### Waarden die de deployment overneemt

Deze komen terug in `manifests/depart/base/` in de gitops-repo:

```
portal: truenas-master.lan.stamx.nl:3260
iqn:    iqn.2005-10.org.freenas.ctl:depart-db
        iqn.2005-10.org.freenas.ctl:depart-documents
```

## Documenten terugzetten uit een snapshot

De bestanden staan **niet** in de database. Ze staan op het
`depart-documents`-volume, dat in de `depart-api`-container onder
`/data/documents` hangt (`DOCUMENTS_PATH`). Op TrueNAS is dat het zvol
`ssd/containers/k8s/depart-documents`; het is een blokapparaat met een
xfs-bestandssysteem, dus je ziet de losse bestanden niet op de TrueNAS zelf.

Terugzetten van een snapshot:

1. Schaal `depart-api` naar nul, zodat niemand het volume nog gebruikt:
   `kubectl -n tools scale deployment/depart-api --replicas=0`
2. Rol de snapshot terug op TrueNAS (Datasets → `depart-documents` →
   Snapshots → de gewenste `auto-depart-...` → Rollback), of via de shell:
   `zfs rollback ssd/containers/k8s/depart-documents@auto-depart-2026-07-25_03-00-00`
3. Schaal `depart-api` weer op: `kubectl -n tools scale deployment/depart-api --replicas=1`

Wil je één bestand terug in plaats van alles, kloon dan de snapshot naar een
tweede zvol, deel die tijdelijk uit en mount hem read-only ergens anders. De
database blijft dan ongemoeid; het pad in de `document`-tabel verwijst nog naar
hetzelfde bestand.

Let op: de database heeft een eigen volume (`depart-db`) met een eigen snapshot.
Zet je alleen de documenten terug, dan kan de database naar een bestand
verwijzen dat in die oudere snapshot nog niet bestond. De api geeft dat weer als
status **ontbreekt** — dat is te herstellen door het document opnieuw te
uploaden.
