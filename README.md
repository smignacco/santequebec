# Santé Québec – Validation Inventaire

Portail web MVP (API NestJS + UI React/Vite) dans **une seule image Docker** compatible OpenShift, avec SQLite persistant sur `/data`.

## Architecture
- `api/`: NestJS + Prisma + SQLite + import/export Excel.
- `web/`: React/Vite pages `/login`, `/org`, `/admin`.
- `openshift/`: PVC, Deployment, Service, Route.

## Variables d'environnement
- `PORT=8080`
- `DATABASE_URL=file:/data/app.db`
- `JWT_SECRET=...`
- `ADMIN_USER=...`
- `ADMIN_PASS_HASH=...` (hash argon2 **ou** mot de passe en clair pour bootstrap local)

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
PORT=8080 DATABASE_URL="file:./dev.db" JWT_SECRET=dev-secret ADMIN_USER=admin ADMIN_PASS_HASH='$argon2id$v=19$m=65536,t=3,p=4$...' npm run start:dev
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
  -e DATABASE_URL='file:/data/app.db' \
  -e JWT_SECRET='change-me' \
  -e ADMIN_USER='admin' \
  -e ADMIN_PASS_HASH='admin123!' \
  -v $(pwd)/.data:/data santequebec:latest

# oc apply
oc apply -f openshift/
```

## Déploiement OpenShift
1. Créer un secret `santequebec-secret` contenant `jwtSecret`, `adminUser`, `adminPassHash`.
2. Appliquer manifests:
   ```bash
   oc apply -f openshift/pvc.yaml
   oc apply -f openshift/deployment.yaml
   oc apply -f openshift/service.yaml
   oc apply -f openshift/route.yaml
   ```
3. Garder `replicas: 1` (SQLite + volume RWO).

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
