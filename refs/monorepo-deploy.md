# Monorepo — Deploy (CD)

> **Status:** stable · **Reviewed:** 2026-08-29 · **Source:** monorepo-boilerplate@worktree-cd-parallel-app-tracks

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Tag-only production deploy

Production deploys are owned by two workflows, one per app: `.github/workflows/cd.api.yml` and
`.github/workflows/cd.web.yml`. Both carry the same trigger, so one tag push ships both. A merge to
`main` alone does **not** deploy. PR CI stays PR-only (`monorepo-ci.md`); image check workflows still build with `push: false`.

| Event | CD runs? |
|---|---|
| `push` of a git tag matching `v*` | yes — if the tagged commit is on the default branch |
| `workflow_dispatch` with an existing `v*` tag | yes — re-deploy / debug of that tag |
| `workflow_dispatch` with a non-`v*` value | no — fails in Resolve tag |
| Tag whose commit is **not** on the default branch | no — fails closed before mutate |
| Merge / push to `main` without a tag | **no** |

CD concurrency is a **fixed per-app group** — `cd-api` and `cd-web`, with no tag in the key — so
every deploy of an app serializes behind the one before it. The key deliberately carries no tag: a
per-tag key let `v1.2.3` and `v1.2.4` run in parallel, and Render's hook has no ordering, so the
older run could fire last and leave production on the older image with both runs green.

With `cancel-in-progress: false` GitHub queues at most **one** pending run per group and cancels the
previously-pending one. A superseded run is therefore dropped rather than queued behind: the newest
tag wins, and a run already in flight is never killed mid-migrate.

**A provider's own git integration is a second deploy path.** The table above governs the two CD
workflows only; it says nothing about what a provider does on its own when it sees a push. Vercel's GitHub app is the one
wired to this repo, and it is off for `main` via `git.deploymentEnabled.main = false` in
`apps/web/vercel.json` — see the Vercel table for what that covers and what it does not. Render has no
git integration pointed at this repo; it moves only when `cd.api.yml` calls its deploy hook.

## Pipeline order

**One workflow per app**, both fired by the same tag. Each stage inside a workflow is its own
**job**, chained with `needs:`, so the run page draws that app's pipeline as a graph and names the
stage that failed. Stages run on separate runners: anything one stage passes to the next travels
through job `outputs` or GHCR, never the workspace.

```
cd.api.yml   resolve → image → migrate → deploy → verify
cd.web.yml   resolve → deploy → verify
```

| Workflow | Job | What |
|---|---|---|
| `cd.api.yml` | `resolve` | Resolve tag + short SHA; assert commit ⊆ default branch; name the GHCR tags |
| `cd.api.yml` | `image` | Build & push API image to GHCR |
| `cd.api.yml` | `migrate` | One-shot `prisma migrate deploy` from that image against Neon |
| `cd.api.yml` | `deploy` | Render deploy hook with `imgURL` = GHCR tag, **then poll the deploy to `live`** |
| `cd.api.yml` | `verify` | Smoke API (`/v1/health`, `/v1/health/ready`) with retries — cold start |
| `cd.web.yml` | `resolve` | Same tag resolution |
| `cd.web.yml` | `deploy` | Preflight the Vercel scope, then Vercel production deploy (native Next build) |
| `cd.web.yml` | `verify` | Smoke **this deployment's** URL and the production alias |

`resolve` appears in both workflows as a **job** but exists once as **logic**: its body is the
composite action `.github/actions/resolve-tag`. It has to stay a job because `image`, `migrate` and
`deploy` read its outputs through `needs`. That action decides which tag is being deployed, turns it
into a commit so every job checks out that exact tree instead of whatever the default branch holds
at the time, and refuses a tag that is not an ancestor of it.

Order is load-bearing **within** the API pipeline — migrate before the roll, rollout proven `live`
before the smoke — and absent **between** the two apps. Web needs nothing the API run produces:
Vercel builds from source, and `NEXT_PUBLIC_API_URL` is derived from `RENDER_API_URL`, a stable
public URL that does not name anything this run produced.

### There is no cross-app release gate

The two apps already shipped on independent tracks before they were split into separate files. What
the split removed is the `release` join — the single node that meant "both halves of this tag went
out".

**That job was load-bearing, and nothing replaces it.** While the API rolls, the new web already
serves against the **previous** API. That was true before the split too, but it was *bounded*:
`release` could not go green unless the API track did, so a partial release was one red node on one
run page. Now, if `CD · Web` passes and `CD · API` fails at `migrate` or the rollout poll,
production serves the new frontend against the old API **indefinitely**, and no job anywhere reports
that the tag only half-shipped. The only signal is that one of two separately-named checks on the
tag is red.

There is no automatic rollback and nothing reverts web on its own. Recovery is manual:

1. Read **both** checks on the tag. A green `CD · Web` alone does **not** mean the tag shipped.
2. Either fix forward — re-dispatch the tag on `cd.api.yml` once the cause is fixed — or roll web
   back by promoting the previous production deployment in the Vercel dashboard. `cd.web.yml` has
   no rollback path of its own; a redeploy of the older tag is the closest equivalent.

Releases therefore **have** to keep the HTTP contract back-compatible. A release that cannot must not
rely on the tag push: ship the API first and dispatch `cd.web.yml` by hand once `CD · API` is green.

Migrate is **never** the container `CMD` / startup — same contract as `monorepo-docker-images.md`.

### Knowing whether the API actually rolled out

The deploy hook is fire-and-forget: it returns as soon as Render accepts the request, so on its own a
failed rollout and a healthy one look identical. `deploy` therefore reads the deploy id out of the hook
response (`.deploy.id`) and polls `GET /v1/services/{service}/deploys/{deploy}` until it reports
`live`, failing on `build_failed`, `update_failed`, `pre_deploy_failed`, `canceled` or `deactivated`.

The service id is parsed from the `srv-…` segment of `RENDER_DEPLOY_HOOK_URL`, so it needs no secret of
its own. `RENDER_API_KEY` is used twice in that job: once **before** the hook, to describe the
service (`GET /v1/services/{id}`), and then for the rollout poll.

**That first read is a gate, not a diagnostic.** A non-2xx there fails the step *before* the hook
fires, naming the secret at fault — `401`/`403` → `RENDER_API_KEY`, `404` → the `srv-…` segment of
`RENDER_DEPLOY_HOOK_URL`. It has to be a gate rather than a warning: the hook carries its own key in
its URL, so a dead `RENDER_API_KEY` does not stop Render from rolling out, it only blinds the poll
that follows. Reported and ignored, a rotated key produced a real production change that CD then
called `status: unknown`.

The poll tolerates a **missing** answer far more than a bad one — 20 consecutive empty reads (~5
min) before it gives up, against the 30 minutes the rollout itself is allowed. A short
`api.render.com` incident must not fail a deploy that is rolling out fine; the case a tight ceiling
would exist for is a `401`, which never recovers and is now caught by the gate above before the hook
ever fires.

**Read the status, not the body.** `jq` exits 0 on an error payload and on empty input alike, so a
`401` parsed blind renders as `type=?` — which reads exactly like a correctly-authenticated look at
a misconfigured service. The describe call therefore branches on its HTTP code. The rollout poll
cannot: it only knows that `.status` came back empty, which is why a bad key has to be caught by the
gate before the hook rather than inferred from the poll's silence. Likewise the hook's status is captured
with `|| true`, never `|| echo 000`: `curl -w '%{http_code}'` writes no trailing newline, so a fallback
`echo` is glued onto the real status instead of replacing it (`200` + `000` = `200000`, which tests as
`>= 300` and would call an accepted deploy a refusal).

`verify` is **not** redundant with this. `deploy` answers "did Render finish rolling this deploy
out"; `verify` answers "does the app respond". A smoke test alone cannot tell a new version from the previous
one still serving traffic, which is why the rollout gate comes first.

## GHCR (API image)

| Tag | Example |
|---|---|
| git semver tag | `ghcr.io/bernardoavsouza/home-utilities-api:v1.2.3` |
| short SHA | `ghcr.io/bernardoavsouza/home-utilities-api:sha-abc1234` |

**No floating `:latest`.** Push auth in Actions is `GITHUB_TOKEN` with `packages: write`.

## GitHub Actions secrets

These are **environment** secrets on the `production` environment, not repo-level ones, so
every job that reads one declares `environment: production` — `migrate`, `deploy` and `verify` in
both workflows. The rest do not: `resolve` reads no secret, and `image` uses only `GITHUB_TOKEN`,
which needs no environment.

**A job that omits the key does not fail.** GitHub resolves `secrets.X` to an empty string for a
secret the job cannot see — no error, no warning — and the blank value surfaces later as an error
from whatever consumed it. Moving a secret between repo and environment scope is therefore a
workflow change, not just a dashboard change.

**`set -u` does not catch this**, which is why every step that consumes a secret opens with a
`: "${SECRET:?…}"` guard. A secret declared in a step's `env:` block is *defined and empty*, not
unset, so `set -u` passes it straight through and the failure surfaces minutes later wearing a
different name — an empty `RENDER_API_URL` became six minutes of smoke retries, an empty
`RENDER_API_KEY` a rollout reported as `unknown`. The guard fails on the first line and names the
secret.

| Secret | Used for |
|---|---|
| `DATABASE_URL` | Neon URL for the migrate step in GHA |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook (CD appends `imgURL`); the `srv-…` segment is also the service id |
| `RENDER_API_KEY` | Render REST API — gates on describing the service **before** the hook fires, then polls the triggered deploy until `live` |
| `RENDER_API_URL` | Public API base (`*.onrender.com`) — smoke + build `NEXT_PUBLIC_API_URL` |
| `VERCEL_TOKEN` | Vercel scope preflight (REST) + CLI deploy — passed by env, never as `--token=` |
| `VERCEL_ORG_ID` | Vercel scope preflight + CLI — must be the **team** id (`team_…`), not the personal user id |
| `VERCEL_PROJECT_ID` | Vercel scope preflight + CLI |
| `VERCEL_WEB_URL` | Production alias (`*.vercel.app`) — smoke + document as Render `CORS_ORIGIN` |

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

### The scope preflight

`cd.web.yml` asserts the Vercel scope over the REST API **before** installing the CLI, because the
CLI reports a bad token, a wrong org and a wrong project with one identical line — `Could not
retrieve Project Settings` — which sends every investigation at the token first.

Two calls gate the deploy: `GET /v2/user` (is the token usable at all) and `GET
/v9/projects/{project}?teamId={org}` (does *this* project resolve under *this* org). On success the
step prints the project name and stops there — no account enumeration on a passing deploy. Only the
failure branch lists the teams the token can reach, to say which account actually owns the project
and whether `VERCEL_ORG_ID` is that id truncated. Secret **values** are never printed; the failure
path prints the id to *set*, which is the point of the step.

The CLI is pinned to a **major** (`vercel@59`), not to an exact version and not left floating.
Exact would rot — Vercel began refusing anything below `47.2.2` server-side, which is how the old
`vercel@41` pin broke with no commit here, and this repo has no Renovate or Dependabot to raise a
pin. Floating `@latest` moves a production deploy under you with no diff. A major pin takes patches
and minors, and when it does eventually rot it rots at `npm install`, before anything touches
production.

Web production is the **native** Vercel Next build. The `apps/web/Dockerfile` remains for PR rot-checks only (`monorepo-docker-images.md`).

## Neon (DB)

CD runs:

```bash
docker run --rm -e DATABASE_URL=... <api-image> ./node_modules/.bin/prisma migrate deploy
```

against the production Neon URL **before** Render rolls the new image. Idempotent re-run is OK;
CD does not roll back schema on later step failure — operator re-dispatches the tag.

## Smoke

| Workflow | Check | Expect |
|---|---|---|
| `cd.api.yml` | `GET ${RENDER_API_URL}/v1/health` | `200` (retries up to ~6 min — no fixed sleep before smoke) |
| `cd.api.yml` | `GET ${RENDER_API_URL}/v1/health/ready` | `200` (not `503`) |
| `cd.web.yml` | `GET <this deployment's URL>/` | `200` |
| `cd.web.yml` | `GET ${VERCEL_WEB_URL}/` | `200` |

Web smokes **two** URLs on purpose. The alias alone answers "the site responds", which stays true
when the production alias is still pointed at the previous build; the deployment URL captured from
`vercel deploy`'s stdout is what proves *this* deploy is the one serving.

No full Playwright suite in CD. Residual: home GET may not call the API, so it does not fully
prove `NEXT_PUBLIC_API_URL`; the value is still set from `RENDER_API_URL` in the deploy step.

## Domains MVP

`*.onrender.com` (API) and `*.vercel.app` (web). Custom DNS is out of scope for this ticket.

## Anchors

- `.github/workflows/cd.api.yml`
- `.github/workflows/cd.web.yml`
- `.github/actions/resolve-tag/action.yml` (tag → commit, ancestry gate; shared by both)
- `apps/web/vercel.json`
- `apps/api/Dockerfile` (migrate command; runtime image)
- `refs/monorepo-ci.md` (PR CI vs CD)
- `refs/monorepo-docker-images.md` (migrate separate from start; `NEXT_PUBLIC_*` build-time)
- `refs/monorepo-env-secrets.md` (no root `.env`; per-app vars)
