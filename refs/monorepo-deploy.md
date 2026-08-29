# Monorepo — Deploy (CD)

> **Status:** stable · **Reviewed:** 2026-08-27 · **Source:** monorepo-boilerplate@fix/cd-render-hook-diagnostics

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Tag-only production deploy

Production deploys are owned by `.github/workflows/cd.yml`. A merge to `main` alone does **not**
deploy. PR CI stays PR-only (`monorepo-ci.md`); image check workflows still build with `push: false`.

| Event | CD runs? |
|---|---|
| `push` of a git tag matching `v*` | yes — if the tagged commit is on `origin/main` |
| `workflow_dispatch` with an existing `v*` tag | yes — re-deploy / debug of that tag |
| `workflow_dispatch` with a non-`v*` value | no — fails in Resolve tag |
| Tag whose commit is **not** on `origin/main` | no — fails closed before mutate |
| Merge / push to `main` without a tag | **no** |

CD concurrency serializes the same tag (`cancel-in-progress: false`) so a second run cannot kill a
migrate / half-rolled deploy.

**A provider's own git integration is a second deploy path.** The table above governs `cd.yml` only; it
says nothing about what a provider does on its own when it sees a push. Vercel's GitHub app is the one
wired to this repo, and it is off for `main` via `git.deploymentEnabled.main = false` in
`apps/web/vercel.json` — see the Vercel table for what that covers and what it does not. Render has no
git integration pointed at this repo; it moves only when `cd.yml` calls its deploy hook.

## Pipeline order

Each stage is its own **job**, chained with `needs:`, so the run page draws the pipeline as a graph and
names the stage that failed. Stages run on separate runners: anything one stage passes to the next
travels through job `outputs` or GHCR, never the workspace.

**The two apps ship on independent tracks.** They fan out from `resolve` and join at `release`:

```
resolve ┬─ image → migrate → deploy-api → verify-api ─┬─ release
        └─ deploy-web → verify-web ──────────────┘
```

| Job | Track | What |
|---|---|---|
| `resolve` | shared | Resolve tag + short SHA; assert commit ⊆ `origin/main` |
| `image` | API 1 | Build & push API image to GHCR |
| `migrate` | API 2 | One-shot `prisma migrate deploy` from that image against Neon |
| `deploy-api` | API 3 | Render deploy hook with `imgURL` = GHCR tag, **then poll the deploy to `live`** |
| `verify-api` | API 4 | Smoke API (`/v1/health`, `/v1/health/ready`) with retries — cold start |
| `deploy-web` | Web 1 | Vercel production deploy of web (native Next build) |
| `verify-web` | Web 2 | Smoke web home |
| `release` | join | Nothing but a summary; cannot go green unless **both** tracks did |

Order is load-bearing **within** the API track — migrate before the roll, rollout proven `live` before
the smoke — and absent **between** the tracks. `deploy-web` needs only `resolve`: Vercel builds from
source, and `NEXT_PUBLIC_API_URL` is built from `RENDER_API_URL`, a stable public URL that does not
name anything this run produced.

**The trade the parallel graph makes.** While the API is still rolling, the new web is already serving
against the **previous** API. A tag that changes the HTTP contract is therefore visible to users for
the length of the Render rollout (minutes). Releases have to keep the contract back-compatible; a
release that cannot must re-serialize the tracks by giving `deploy-web` a `needs: verify-api` again.

`release` is the only leaf of the graph. Every stage fails closed on its own, so the run is red if any
stage fails; `release` exists so that one node answers "did this tag actually ship, both halves of it".

Migrate is **never** the container `CMD` / startup — same contract as `monorepo-docker-images.md`.

### Knowing whether the API actually rolled out

The deploy hook is fire-and-forget: it returns as soon as Render accepts the request, so on its own a
failed rollout and a healthy one look identical. `deploy-api` therefore reads the deploy id out of the hook
response (`.deploy.id`) and polls `GET /v1/services/{service}/deploys/{deploy}` until it reports
`live`, failing on `build_failed`, `update_failed`, `pre_deploy_failed`, `canceled` or `deactivated`.

The service id is parsed from the `srv-…` segment of `RENDER_DEPLOY_HOOK_URL`, so it needs no secret of
its own. `RENDER_API_KEY` is used twice in that job: once **before** the hook, to describe the service
(`GET /v1/services/{id}`) so a refusal can name what it was pointed at, and then for the rollout poll.

Both of those reads check the HTTP status rather than trusting the body. `jq` exits 0 on an error
payload and on empty input alike, so a `401` parsed blind renders as `type=?` — which reads exactly
like a correctly-authenticated look at a misconfigured service. Likewise the hook's status is captured
with `|| true`, never `|| echo 000`: `curl -w '%{http_code}'` writes no trailing newline, so a fallback
`echo` is glued onto the real status instead of replacing it (`200` + `000` = `200000`, which tests as
`>= 300` and would call an accepted deploy a refusal).

`verify-api` is **not** redundant with this. `deploy-api` answers "did Render finish rolling this deploy
out"; `verify-api` answers "does the app respond". A smoke test alone cannot tell a new version from the previous
one still serving traffic, which is why the rollout gate comes first.

## GHCR (API image)

| Tag | Example |
|---|---|
| git semver tag | `ghcr.io/bernardoavsouza/home-utilities-api:v1.2.3` |
| short SHA | `ghcr.io/bernardoavsouza/home-utilities-api:sha-abc1234` |

**No floating `:latest`.** Push auth in Actions is `GITHUB_TOKEN` with `packages: write`.

## GitHub Actions secrets

These are **environment** secrets on the `production` environment, not repo-level ones, so
every job that reads one declares `environment: production` — `migrate`, `deploy-api`, `verify-api`,
`deploy-web` and `verify-web`. The other three do not: `resolve` and `release` read no secret, and
`image` uses only `GITHUB_TOKEN`, which needs no environment.

**A job that omits the key does not fail.** GitHub resolves `secrets.X` to an empty string for a
secret the job cannot see — no error, no warning — and the blank value surfaces later as an error
from whatever consumed it. Moving a secret between repo and environment scope is therefore a
workflow change, not just a dashboard change.

| Secret | Used for |
|---|---|
| `DATABASE_URL` | Neon URL for the migrate step in GHA |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook (CD appends `imgURL`); the `srv-…` segment is also the service id |
| `RENDER_API_KEY` | Render REST API — describes the service before the hook, then polls the triggered deploy until `live` (`deploy-api`) |
| `RENDER_API_URL` | Public API base (`*.onrender.com`) — smoke + build `NEXT_PUBLIC_API_URL` |
| `VERCEL_TOKEN` | Vercel CLI deploy |
| `VERCEL_ORG_ID` | Vercel CLI |
| `VERCEL_PROJECT_ID` | Vercel CLI |
| `VERCEL_WEB_URL` | Public web base (`*.vercel.app`) — smoke + document as Render `CORS_ORIGIN` |

Do not commit secret values. Names only live here and in provider dashboards.

The `production` environment carries no protection rules and no deployment branch policy. That is
load-bearing: CD is triggered by a tag, and a branch policy would reject `refs/tags/v*` outright.

## Render (API)

| Setting | Rule |
|---|---|
| Service type | Image-backed (pull from GHCR), not “build from repo Dockerfile” for prod CD |
| Default image URL | Must match `ghcr.io/bernardoavsouza/home-utilities-api` (tag/digest may vary via `imgURL`) |
| Deploy hook | CD `POST`s the hook with URL-encoded `imgURL` |
| Git auto-deploy | **Disabled** — CD-owned. Dashboard-only setting: nothing in this repo can enforce it, so it has to be verified by hand when the service is created |
| Runtime env | `DATABASE_URL` (Neon), `CORS_ORIGIN` (= `VERCEL_WEB_URL`) |
| Registry credential | Required for **private** GHCR: Render dashboard credential for `ghcr.io` with a token that can `read:packages` |

GHA `packages:write` covers **push** only. Provider **pull** auth is a separate human setup step.

## Vercel (web)

| Setting | Rule |
|---|---|
| Root Directory (dashboard) | **`apps/web`** — required; `next.config.ts` and the Next app live there |
| Config file | `apps/web/vercel.json` (not repo root) |
| Node.js Version (dashboard) | **`24.x`** — Vercel builds/Functions support 20/22/24 only (default 24); now the same major the repo pins |
| `engines.node` (web) | `24.x` in `apps/web/package.json` — selects the Vercel runtime; overrides a mismatched Project Setting |
| Install | `corepack enable && cd ../.. && pnpm install --frozen-lockfile --filter web...` |
| Build | package `build` (`next build`) — no custom `outputDirectory` (Next owns the output) |
| `NEXT_PUBLIC_API_URL` | Build-time: `${RENDER_API_URL}/v1` (trailing slash stripped from the API base) |
| Production git auto-deploy | **Off for `main`** — `git.deploymentEnabled.main = false` in `apps/web/vercel.json`. Production is CD-owned, tag-only |
| What that switch depends on | Two dashboard values, so it is **not** self-enforcing: Production Branch must be named `main` (the key is a literal branch name, and a rename silently re-enables deploys) and Root Directory must be `apps/web` (or `vercel.json` is never read at all) |
| What that switch does **not** cover | Commit-triggered deploys only. A manual "Promote to Production" and any Vercel Deploy Hook still reach production, and neither is visible from this repo |
| PR previews | **Kept.** Pushing to a PR branch still builds a preview — previews touch no production URL and are not a release |
| Domains MVP | `*.vercel.app` (no custom domain in this ticket) |

Local, CI, Docker and Vercel all sit on Node **24** now (`.nvmrc` → `24.19.0`, root `engines.node` → `>=24.19 <25`).
Vercel is no longer an exception, so the install command no longer passes `--config.engine-strict=false`: that flag
existed only because the root demanded Node 26 while Vercel's platform ceiling was 24, and the root pin is now inside
Vercel's supported range. Keeping it would have left `engine-strict` disabled on the one install that most needs it.

`engines.node` in `apps/web` stays the looser `24.x` on purpose — Vercel reads it to select a runtime **major**, so it
is a platform selector, not a version gate. The `>=24.19` floor is enforced by the root `engines` and
`scripts/bootstrap.mjs`.

Web production is the **native** Vercel Next build. The `apps/web/Dockerfile` remains for PR rot-checks only (`monorepo-docker-images.md`).

## Neon (DB)

CD runs:

```bash
docker run --rm -e DATABASE_URL=... <api-image> ./node_modules/.bin/prisma migrate deploy
```

against the production Neon URL **before** Render rolls the new image. Idempotent re-run is OK;
CD does not roll back schema on later step failure — operator re-dispatches the tag.

## Smoke

| Check | Expect |
|---|---|
| `GET ${RENDER_API_URL}/v1/health` | `200` (retries up to ~6 min — no fixed sleep before smoke) |
| `GET ${RENDER_API_URL}/v1/health/ready` | `200` (not `503`) |
| `GET ${VERCEL_WEB_URL}/` | `200` |

No full Playwright suite in CD. Residual: home GET may not call the API, so it does not fully
prove `NEXT_PUBLIC_API_URL`; the value is still set from `RENDER_API_URL` in the deploy step.

## Domains MVP

`*.onrender.com` (API) and `*.vercel.app` (web). Custom DNS is out of scope for this ticket.

## Anchors

- `.github/workflows/cd.yml`
- `apps/web/vercel.json`
- `apps/api/Dockerfile` (migrate command; runtime image)
- `refs/monorepo-ci.md` (PR CI vs CD)
- `refs/monorepo-docker-images.md` (migrate separate from start; `NEXT_PUBLIC_*` build-time)
- `refs/monorepo-env-secrets.md` (no root `.env`; per-app vars)
