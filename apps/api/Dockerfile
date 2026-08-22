# syntax=docker/dockerfile:1

# Image for apps/api. One Dockerfile per app; apps/web has its own.
#
# The build context is the REPO ROOT, not this folder — the lockfile, the
# workspace manifest and packages/contracts all live above it:
#
#   docker build -f apps/api/Dockerfile -t <tag> .
#
# Migrations are NOT run on start. They are a separate deploy step against the same
# image, so N containers starting at once never race on the schema:
#
#   docker run --rm -e DATABASE_URL=... <image> ./node_modules/.bin/prisma migrate deploy
#
# The binary is called directly, not through `pnpm exec`: pnpm would try to verify
# the workspace and reinstall as a non-root user. Nothing at runtime needs pnpm.
#
# That step is why `prisma` is a runtime dependency and not a devDependency — it
# costs ~120MB of image, and it is also what lets `prisma generate` run in the
# stage that actually ships.

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Node 25+ images no longer bundle Corepack, so npm installs Corepack itself
# (pinned). Keep this pin in lockstep with apps/web/Dockerfile — see
# refs/monorepo-docker-images.md. pnpm still comes from Corepack at the
# `packageManager` version — the pnpm version is never spelled out here.
RUN npm install --global corepack@0.35.0 && corepack enable
WORKDIR /app

# Only the manifests, so a source-only change does not re-resolve dependencies.
# Every workspace manifest is copied, apps/web's included: --frozen-lockfile
# validates every importer in the lockfile, so a missing one fails the install.
# Only `--filter api...` is actually installed.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter api...
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
# Prisma client is generated with the `prisma` version in the lockfile — never a
# floating `npx prisma@x.y.z`.
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter api...
COPY packages/contracts ./packages/contracts
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter api prisma:generate

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001
COPY --from=prod-deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages ./packages
COPY --from=prod-deps /app/apps/api ./apps/api
COPY --from=build /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
