FROM node:20-bookworm AS web-build
WORKDIR /opt/app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:20-bookworm AS api-build
WORKDIR /opt/app/api
COPY api/package.json api/package-lock.json* ./
RUN npm install
COPY api/ ./
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /opt/app
ENV NODE_ENV=production
ENV PORT=8080
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=api-build /opt/app/api/package.json /opt/app/api/package.json
COPY --from=api-build /opt/app/api/node_modules /opt/app/api/node_modules
COPY --from=api-build /opt/app/api/dist /opt/app/api/dist
COPY --from=api-build /opt/app/api/prisma /opt/app/api/prisma
COPY --from=web-build /opt/app/web/dist /opt/app/public
RUN chgrp -R 0 /opt/app && chmod -R g=u /opt/app
EXPOSE 8080
WORKDIR /opt/app/api
CMD ["sh","-c","npx prisma migrate deploy && node dist/main.js"]
