# Monorepo — Docker images

> **Status:** stable · **Reviewed:** 2026-08-22 · **Source:** monorepo-boilerplate@feat/PP-13-cd-deploy-tag-vercel-render-neon

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## One Dockerfile per app

| Image | Dockerfile | Serves | Port |
|---|---|---|---|
| API | `apps/api/Dockerfile` | NestJS, `node dist/main` | 3001 |
| Web | `apps/web/Dockerfile` | Next.js standalone server | 3000 |

A new app gets its own `apps/<app>/Dockerfile`. There is no shared/root Dockerfile and no
Compose service that runs either app — Compose is Postgres only
(`monorepo-infra-local.md`). The images exist for deploy, not for local dev.

## The build context is the repo root

Both are built with `-f`, from the root:

```bash
docker build -f apps/api/Dockerfile -t api .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/v1 -t web .
```

Never `cd apps/api && docker build .` — the lockfile, `pnpm-workspace.yaml`, the root
`package.json` and `packages/contracts` all live above the app folder.

`.dockerignore` is read from the **context root**, so there is exactly one, and it must stay
**app-agnostic**: it excludes what no image ever wants (`node_modules`, build output, `.git`,
env files, docs, e2e). Never put an app-specific exclusion in it — each Dockerfile copies only
what it ships.

Both Dockerfiles copy **every** workspace manifest before installing, including the other app's,
because `--frozen-lockfile` validates every importer in the lockfile; a missing manifest fails the
install. Only `--filter <app>...` is actually installed.

## Rules both images keep

| Rule | Why |
|---|---|
| pnpm comes from **Corepack**, at the `packageManager` version | the pnpm version is pinned in `package.json` and the CI action — a third copy in a Dockerfile would drift |
| `npm` is used **only** to install Corepack itself, pinned | Node 24 still bundles Corepack, but the pin keeps both images identical and survives Node 25+, which drops it; npm never installs project dependencies |
| Corepack pin is the **same** in both Dockerfiles (`corepack@0.35.0` today) | there is no shared base image; bump both together or they drift |
| a manifests-only layer precedes the source copy | a source-only change must not re-resolve dependencies |
| `USER node`, `NODE_ENV=production`, no shell wrapper in `CMD` | not root, and no init script to debug |
| runtime `COPY` uses `--chown=node:node` wherever the process writes | `next/image` and ISR need a writable `.next/cache`; root-owned files + `USER node` = EACCES in production |
| `HEALTHCHECK` uses `node -e` + `fetch` | there is no `curl` in the Alpine images |
| no `.env` file is read at runtime | every var comes from the environment — see `monorepo-env-secrets.md` |

## API image

| Stage | Does |
|---|---|
| `base` | `node:24.19-alpine` + Corepack/pnpm |
| `manifests` | manifests + lockfile + `.npmrc` |
| `build` | full install, `prisma generate`, `nest build` |
| `prod-deps` | `--prod` install, `prisma generate` — the node_modules that ships |
| `runtime` | `prod-deps` node_modules + `dist/` from `build` |

`prisma generate` runs from the **lockfile** version, never `npx prisma@x.y.z` — a floating version
silently generates a mismatched client.

### Migrations are a separate step

```bash
docker run --rm -e DATABASE_URL=... <image> ./node_modules/.bin/prisma migrate deploy
```

Same image, different command, run **once** before rolling the API containers. The image never
migrates on start: N containers starting together would race on the schema.

The Prisma binary is invoked **directly**, not via `pnpm exec` / `pnpm run`: pnpm verifies the
workspace before running and tries to reinstall, which fails as the non-root `node` user on a
`--prod` tree. Nothing in the running image needs pnpm — `CMD` is plain `node dist/main` for the
same reason.

This step is why `prisma` is a runtime dependency rather than a devDependency — it costs roughly
120MB of image (CLI + TypeScript + `effect`), and it is also what lets `prisma generate` run in the
stage that ships. See `../apps/api/refs/api-persistence.md`.

### Runtime env

`NODE_ENV=production` and `PORT=3001` are baked in; everything else is supplied at
`docker run` / deploy time. `DATABASE_URL` is required; `CORS_ORIGIN` and `SWAGGER_ENABLED` are
optional. `NODE_ENV=production` is what keeps Swagger off unless `SWAGGER_ENABLED=true` is passed
explicitly (`../apps/api/refs/api-http-contract.md`).

The container `HEALTHCHECK` hits **liveness** (`/v1/health`) on purpose: readiness
(`/v1/health/ready`) reports the database, and a container should not be killed and restarted
because Postgres blinked. An orchestrator's readiness probe points at `/v1/health/ready`; the
container healthcheck stays on `/v1/health`.

## Web image

| Stage | Does |
|---|---|
| `base` | `node:24.19-alpine` + Corepack/pnpm |
| `build` | manifests, `--filter web...` install, `next build` |
| `runtime` | plain `node:24.19-alpine` — the standalone output only, **no pnpm, no install** |

The standalone output is what makes that runtime stage possible: Next emits a self-contained server
with a traced, pruned `node_modules`. `outputFileTracingRoot` must point at the **monorepo root**, or
tracing misses everything hoisted above `apps/web` (including `@packages/contracts`). The standalone
tree mirrors the monorepo, which is why the entrypoint is `apps/web/server.js`. `.next/static` and
`public/` are copied next to it — the standalone server does not carry either.

It is **opt-in**: `next.config.ts` only sets `output: 'standalone'` when `NEXT_OUTPUT=standalone`,
and the Dockerfile sets it. The reason is that `next start` refuses to serve a standalone build, and
the Playwright e2e job serves the app with `next start` (`monorepo-ci.md`). So the default build
stays startable and the image gets standalone; both come from the same source.

`HOSTNAME=0.0.0.0` is set because the standalone server otherwise may not bind outside the
container.

The three runtime `COPY`s use `--chown=node:node`: the process runs as `node`, and
`next/image` / ISR write under `.next/cache`. Root-owned files here surface as `EACCES` only in
the image, not in local `next dev`. `public/` is kept in the tree (`.gitkeep` today) so the COPY
path exists before the first real asset lands — the e2e job serves via `next start` and would not
catch a missing image copy.

### `NEXT_PUBLIC_*` is baked at build time, not run time

| | Where it is set | Changing it |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `--build-arg` on `docker build` | requires a **new image** |
| `PORT` | runtime env | just restart |

Next inlines `NEXT_PUBLIC_*` into the client bundle during `next build`, so passing
`NEXT_PUBLIC_API_URL` to `docker run` does nothing at all. One image per environment, or a
build per environment — there is no way around it while the value is browser-visible. A var that
must vary at runtime cannot be `NEXT_PUBLIC_`; it has to be read server-side.

## CI builds both

One workflow per image — `.github/workflows/api-image.yml` and `web-image.yml` — on every PR. They
need no host toolchain setup (skip the shared setup action) and build via Buildx with
`cache-from` / `cache-to: type=gha` so install layers survive across PRs. A Dockerfile that is never
built rots; the first one in this repo did, which is why it was deleted before these were written.
Keep the workflows.

PR image workflows still build with `push: false`. **CD** (`.github/workflows/cd.yml`) pushes the
API image to GHCR on tag `v*` — see `monorepo-deploy.md`. Web production deploys via Vercel’s
native Next build, not the web Docker image.
