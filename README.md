# Santé Québec – Validation Inventaire

Portail web MVP (API NestJS + UI React/Vite) dans **une seule image Docker** compatible OpenShift, avec **PostgreSQL**.

## Architecture
- `api/`: NestJS + Prisma + PostgreSQL + import/export Excel.
- `web/`: React/Vite pages `/login`, `/org`, `/admin`.
- `openshift/`: PVC, Deployment, Service, Route.

## Variables d'environnement
- `PORT=8080`
- `DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<db>?schema=public`
- `JWT_SECRET=...`
- `ADMIN_USER=...`
- `ADMIN_PASS_HASH=...` (hash argon2 **ou** mot de passe en clair pour bootstrap local)
- `POSTGRES_DB=...`
- `POSTGRES_USER=...`
- `POSTGRES_PASSWORD=...`

## Quickstart local
```bash
cd api
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed

cd ../web
npm install
npm run build

cd ../api
mkdir -p public
cp -r ../web/dist/* ./public/
PORT=8080 DATABASE_URL='postgresql://postgres:postgres@localhost:5432/santequebec?schema=public' JWT_SECRET=dev-secret ADMIN_USER=admin ADMIN_PASS_HASH='Admin123!' npm run start:dev
```

## Commandes exactes demandées
```bash
# npm install
cd api && npm install
cd web && npm install

# prisma migrate
cd api && npx prisma migrate dev --name init

# prisma db seed
cd api && npm run seed

# docker build/run
docker build -t santequebec:latest .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL='postgresql://postgres:postgres@host.docker.internal:5432/santequebec?schema=public' \
  -e JWT_SECRET='change-me' \
  -e ADMIN_USER='admin' \
  -e ADMIN_PASS_HASH='admin123!' \
  santequebec:latest

# oc apply
oc apply -f openshift/
```

## Déploiement OpenShift
L'application est maintenant prévue pour tourner avec **2 conteneurs dans le même pod**:
1. `santequebec` (app NestJS/React)
2. `postgres` (base PostgreSQL)

Secrets attendus dans **un secret unique** `santequebec-env` (les clés doivent être les noms de variables d'environnement):
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_USER`
- `ADMIN_PASS_HASH`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Exemple de création du secret:
```bash
oc create secret generic santequebec-env -n santequebec \
  --from-literal=POSTGRES_DB=santequebecDB \
  --from-literal=POSTGRES_USER=postgresUser \
  --from-literal=POSTGRES_PASSWORD='B|_8rEj9Dd' \
  --from-literal=DATABASE_URL='postgresql://postgresUser:B|_8rEj9Dd@localhost:5432/santequebecDB?schema=public' \
  --from-literal=JWT_SECRET='change-me' \
  --from-literal=ADMIN_USER=admin \
  --from-literal=ADMIN_PASS_HASH='admin123!'
```

> Important: dans un manifeste, `secretKeyRef.key` doit contenir **le nom de la clé** (ex: `DATABASE_URL`), jamais la valeur secrète.

Appliquer les manifests:
```bash
oc apply -f openshift/all.yaml -n santequebec
```

## Notes MVP
- Auth org par `orgCode + PIN + name + email`; JWT role `ORG_USER`.
- Auth admin via env + hash argon2.
- Audit log pour login org, changement items, soumission.
- Import Excel via `/api/admin/batches/:batchId/orgs/:orgId/import-excel` (multipart `file`).
- Export Excel via `/api/admin/batches/:batchId/orgs/:orgId/export-excel`.
- Export PDF: stub 501.

## Compte admin initial
- Identifiant par défaut: `admin`
- Mot de passe par défaut: `Admin123!`
- Vous pouvez ajouter un compte admin via `ADMIN_USER` et `ADMIN_PASS_HASH` (le compte par défaut reste disponible pour le premier accès).
