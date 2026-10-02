FROM node:22-trixie-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
FROM node:22-trixie-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
ENV HOST=0.0.0.0 PORT=3080 DATA_DIR=/data
# Le volume hérite du propriétaire du dossier : sans ça, /data appartient à root et SQLite ne peut pas créer sa base
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3080
# Le runtime lance `node` seul : npm/corepack retires avec les CVE qu'ils embarquent
# (brace-expansion, sigstore, pacote, picomatch... scan Trivy 2026-10-01).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
USER node
CMD ["node", "src/server.js"]
