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


## Éviter l'écrasement de la base SQLite lors des mises à jour OpenShift
- **Toujours** conserver `DATABASE_URL=file:/data/app.db` dans le Deployment (la base doit rester sur le PVC monté sur `/data`).
- Ne changez pas le nom du `PersistentVolumeClaim` (`santequebec-data`) ni le `mountPath` (`/data`) entre deux déploiements.
- Ne supprimez pas le PVC lors d'un update de code (`oc delete pvc santequebec-data` supprimerait les données).
- Le conteneur refuse maintenant de démarrer si `DATABASE_URL` ne pointe pas vers `/data`, pour éviter une base éphémère dans l'image.

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

### Dépannage build d'image (clusters sans registre intégré)
Sur certains clusters, le registre intégré OpenShift n'est pas configuré pour les projets applicatifs. Dans ce cas, un build binaire avec sortie vers `ImageStreamTag` échoue avec une erreur du type:

- `InvalidOutputReference`
- `an image stream cannot be used as build output because the integrated container image registry is not configured`

#### Procédure recommandée (push vers registre externe Docker Hub/Quay)
1. Créer le build binaire Docker:
   ```bash
   oc project santequebec
   oc new-build --name=santequebec --binary --strategy=docker
   ```
2. Créer un secret docker pour pousser l'image:
   ```bash
   oc create secret docker-registry regcred \
     --docker-server=docker.io \
     --docker-username=<USER> \
     --docker-password=<TOKEN_OU_PASSWORD> \
     --docker-email=<EMAIL>
   ```
3. Configurer la sortie du BuildConfig vers une image externe:
   ```bash
   oc patch bc santequebec --type=merge -p \
   '{"spec":{"output":{"to":{"kind":"DockerImage","name":"docker.io/<USER>/santequebec:latest"}}}}'
   oc set build-secret --push bc/santequebec regcred
   ```
4. Lancer le build puis suivre les logs:
   ```bash
   oc start-build santequebec --from-dir=. --follow
   oc get builds -w
   ```
5. Mettre à jour le deployment pour utiliser l'image externe:
   ```bash
   oc set image deployment/santequebec app=docker.io/<USER>/santequebec:latest
   oc rollout status deployment/santequebec
   ```

#### Diagnostic rapide si `--follow` time out
```bash
oc describe build santequebec-<N>
oc get events --sort-by=.lastTimestamp | tail -n 100
oc get bc santequebec -o yaml
oc get resourcequota,limitrange -n santequebec
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
