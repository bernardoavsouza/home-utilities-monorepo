# syntax=docker/dockerfile:1

# Image for apps/web. One Dockerfile per app; apps/api has its own.
#
# The build context is the REPO ROOT, not this folder — the lockfile, the
# workspace manifest and packages/contracts all live above it:
#
#   docker build -f apps/web/Dockerfile -t <tag> .
#
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time, so the API
# URL is a --build-arg, not a runtime env var. Passing it to `docker run` does
# nothing; a new URL means a new image:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/v1 -t <tag> .

FROM node:24.19-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node 24 still bundles Corepack, but npm installs a pinned copy anyway: both
# images must resolve pnpm identically, and Node 25+ drops the bundled one.
# Keep this pin in lockstep with apps/api/Dockerfile — see
# refs/monorepo-docker-images.md. pnpm still comes from Corepack at the
# `packageManager` version — the pnpm version is never spelled out here.
RUN npm install --global corepack@0.35.0 && corepack enable
WORKDIR /app

# Only the manifests, so a source-only change does not re-resolve dependencies.
# Every workspace manifest is copied, apps/api's included: --frozen-lockfile
# validates every importer in the lockfile, so a missing one fails the install.
# Only `--filter web...` is actually installed.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --filter web...
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Opts next.config.ts into `output: 'standalone'`; the default build is what the
# e2e job serves with `next start`.
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter web build

# The standalone output is a self-contained server with a traced, pruned
# node_modules — so this stage needs neither pnpm nor an install step. It mirrors
# the monorepo layout, hence apps/web/server.js.
FROM node:24.19-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
