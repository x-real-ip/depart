# Deployment

De manifests van depart staan **niet** in deze repo maar in
[`x-real-ip/gitops`](https://github.com/x-real-ip/gitops), onder
`manifests/depart/`. Dat is waar Argo CD naar kijkt; manifests hier zouden een
tweede plek zijn om hetzelfde bij te houden.

```
gitops/
├── argocd/apps/depart.yaml            Argo CD Application (namespace tools)
└── manifests/depart/
    ├── base/
    │   ├── postgresql/kustomization.yaml   hergebruikt ../../postgres/base
    │   ├── configmap.yaml
    │   ├── sealedsecret.yaml
    │   ├── persistentvolume.yaml           documentenvolume (iSCSI, RWO)
    │   ├── deployment.yaml                 depart-api + depart-web
    │   ├── service.yaml
    │   └── httproute.yaml                  depart.lan.stamx.nl
    └── overlay/kustomization.yaml           namespace + image-tags
```

## Wat waar draait

| Onderdeel          | Wat het is                                    | Volume                                    |
| ------------------ | --------------------------------------------- | ----------------------------------------- |
| `depart-web`       | nginx met de gebouwde frontend                | geen                                      |
| `depart-api`       | Fastify, 1 replica, strategy `Recreate`       | `pvc-iscsi-depart-documents` op `/data/documents` |
| `depart-postgresql`| StatefulSet uit de gedeelde `postgres/base`   | `depart-pv-iscsi-postgresql-db`           |

`depart-web` is het enige onderdeel dat van buiten bereikbaar is, via de
`private` gateway op `depart.lan.stamx.nl`. De api heeft een ClusterIP-service
die alleen binnen het cluster bestaat; alle verkeer loopt via nginx in
`depart-web`. Het documentenvolume wordt alleen door de api gemount.

## Migraties

De migraties draaien als **initContainer** `migrate` in `depart-api`, uit
dezelfde image als de api zelf:

```
node_modules/.bin/node-pg-migrate --migrations-dir migrations up
```

Omdat het een initContainer is in een deployment met één replica en
`strategy: Recreate`, kan er nooit meer dan één migratie tegelijk lopen, en
start de api pas als de migratie geslaagd is. Mislukt de migratie, dan komt de
pod niet omhoog en blijft de vorige versie staan.

## Rechten op het documentenvolume

De api draait als uid/gid 3001 (aangemaakt in `apps/api/Dockerfile`). De
`securityContext` van de pod zet `runAsUser`, `runAsGroup` en `fsGroup` op 3001,
dus Kubernetes zet de eigenaar van het volume goed bij het mounten. Uploads
worden met mode `0600` weggeschreven. Er is geen wereldleesbare share.

## Eerste keer uitrollen

1. Zvols, targets en extents op TrueNAS aanmaken — zie [`../ansible/README.md`](../ansible/README.md).
   Vanuit de root van de `ansible`-repo:
   ```bash
   ansible-playbook playbooks/truenas_shares.yaml
   ```
2. De images laten bouwen door de workflow (push naar `main` geeft `latest`).
3. De Argo CD Application aanzetten:
   ```bash
   kubectl apply -f gitops/argocd/apps/depart.yaml
   ```
4. Controleren:
   ```bash
   kubectl -n tools get pods -l app=depart-api
   kubectl -n tools port-forward deploy/depart-api 8080:8080
   curl -s localhost:8080/healthz    # {"status":"ok","database":"ok"}
   ```

## Secrets

`depart-secrets` bevat `DATABASE_URL` en `API_TOKEN`, `depart-postgresql-secret`
bevat `POSTGRES_PASSWORD`. Beide zijn SealedSecrets met scope `cluster-wide`. De
platte waardes staan nergens in een repo. Een nieuwe waarde zetten:

```bash
printf '%s' 'de-nieuwe-waarde' > /tmp/w
kubeseal --cert sealed-secret-tls-2.crt --scope cluster-wide --raw --from-file=/tmp/w
rm /tmp/w
```

Let op: `printf '%s'` en niet `echo`, anders komt er een newline in de waarde
terecht en klopt het wachtwoord niet meer.

Wijzig je `POSTGRES_PASSWORD`, dan moet `DATABASE_URL` mee: daar staat hetzelfde
wachtwoord in.
