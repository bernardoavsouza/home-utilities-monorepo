---
contract: cienty-spec-v1
ticket: PP-13
title: "[Infra] CD: deploy por tag (Vercel + Render + Neon)"
repo: home-utilities-monorepo
status: ready
owner: unknown
created_at: 2026-08-22T13:11:36Z
updated_at: 2026-08-22T13:14:39Z
base: origin/main @ 2026-08-22
parent: unknown
follow_ups: []
siblings: []
approved_by: "spec-plan-reviewer 2026-08-22 (iter 1)"
spec_mode: standard
source_links:
  - https://bernardoavsouza.atlassian.net/browse/PP-13
---

# PP-13 — [Infra] CD: deploy por tag (Vercel + Render + Neon)

## Context

Personal Home Utilities needs a **repeatable production deploy** of web + API + DB schema when a semver tag is cut. Today the monorepo has Dockerfiles and PR-only CI that *builds* images but never pushes or deploys; there is no CD workflow and no provider wiring documented as living truth.

**Baseline verified on `origin/main` @ `229cd8b`:**

| Fact | Anchor |
|---|---|
| Six PR-only workflows; no `push` trigger; base `main` only | `.github/workflows/*.yml`, `refs/monorepo-ci.md` |
| API/Web image workflows build with `push: false` | `.github/workflows/api-image.yml`, `web-image.yml` |
| CI explicitly lists Deploy/release as a gap | `refs/monorepo-ci.md` → “Not covered by CI” |
| API image: migrate is a **separate** one-shot (`prisma migrate deploy`), never on start | `apps/api/Dockerfile`, `refs/monorepo-docker-images.md` |
| Web production path for this ticket is **Vercel native Next build**, not the web Docker image | locked decision #7; `apps/web/Dockerfile` remains for CI rot-check only |
| `NEXT_PUBLIC_API_URL` is build-time only (inlined by `next build`) | `refs/monorepo-env-secrets.md`, `refs/monorepo-docker-images.md` |
| API runtime env has no `.env` in the image; `DATABASE_URL` / `CORS_ORIGIN` at deploy | `refs/monorepo-env-secrets.md`, `refs/monorepo-docker-images.md` |
| Health: `GET /v1/health` (liveness), `GET /v1/health/ready` (DB) | `configure-app.ts` (`setGlobalPrefix('v1')`), health/readiness controllers |
| No `vercel.json` today | repo root |
| No root `.env`; secrets must not enter git | `refs/monorepo-env-secrets.md`, `AGENTS.md` |

Gap: there is no tag-triggered CD that pushes GHCR, migrates Neon, rolls Render, deploys Vercel, and smokes the public URLs.

## Objective

Deliver a **tag-gated continuous deployment pipeline** that, for a semver git tag `v*`, deploys the API (GHCR → Render) and web (Vercel) against Neon Postgres and proves the public endpoints are healthy — without deploying on ordinary merges to `main`.

Operational unit: the **CD workflow run** (one deploy of a tagged commit).

## Task classification

- Classification: `Complex`
- Rationale:
  - Cross-provider integration (GHCR + Neon + Render + Vercel) with silent-failure risk if migrate/rollout order is wrong
  - Schema migration against production Neon before API rollout — irreversible operational step
  - Multiple failure/idempotency branches (tag not on main, re-dispatch, smoke fail, deploy hook)
  - Wrong config (auto-deploy still on, wrong `NEXT_PUBLIC_API_URL`, CORS mismatch) can look “green” while broken in prod

## Decisões alinhadas (locked with the user)

1. CD **fails** if the tagged commit is **not** an ancestor of / contained in `origin/main`.
2. Triggers: `push` tags `v*` **and** `workflow_dispatch` (re-deploy/debug). `workflow_dispatch` inputs: optional tag/ref to deploy (existing tag; do not create a tag).
3. Domains MVP: `*.vercel.app` + `*.onrender.com` — **no** custom domain in this ticket.
4. Render: deploy via **deploy hook** with `imgURL` query param — **not** Render REST API.
5. GHCR image: `ghcr.io/bernardoavsouza/home-utilities-api:<git-tag>` **and** short-sha tag; **no** floating `:latest`.
6. Post-deploy smoke: HTTP GET `/v1/health` + `/v1/health/ready` on API public URL; GET home on Vercel URL. **No** full e2e suite in CD.
7. Web = Vercel native Next build (not Docker). API = Render Docker from GHCR. DB = Neon.
8. Migrate: one-shot `prisma migrate deploy` from the API image **BEFORE** Render rollout — never on container start.
9. CI PR workflows stay PR-only; CD is a **new** separate workflow.
10. Auto-deploy on Vercel Git and Render Git must be documented as **disabled / CD-owned**.
11. Update refs in the same PR (`refs/monorepo-ci.md`; create `refs/monorepo-deploy.md` if rules warrant a new subject; update `AGENTS.md` routing if new ref).

## Scope

In scope:
- New GitHub Actions CD workflow (e.g. `.github/workflows/cd.yml`) on tag `v*` + `workflow_dispatch`
- Assert tagged commit ⊆ `origin/main`; fail closed otherwise
- Build & push API image to GHCR (`:vX.Y.Z` + short SHA); no `:latest`
- One-shot migrate: `docker run … ./node_modules/.bin/prisma migrate deploy` with Neon `DATABASE_URL` **before** Render
- Trigger Render deploy hook with `imgURL` pointing at the pushed GHCR image
- Vercel production deploy of `apps/web` with `NEXT_PUBLIC_API_URL` set from the public API URL (+ `/v1`)
- Smoke curls: API health + ready; web home
- Document required GitHub secrets, Render service env, Vercel project env/build settings, and “disable provider auto-deploy”
- Living refs: create `refs/monorepo-deploy.md`, update Deploy gap in `refs/monorepo-ci.md`, route from `AGENTS.md`
- Prefer committed `vercel.json` (or documented dashboard-equivalent) so monorepo install/build is deterministic — pick one approach and stick to it

Out of scope:
- Auto-deploy on every merge to `main`
- Staging environment / multi-env matrix
- Non-GHCR registries
- Paid custom domains / DNS
- Auth, seed of production data
- Changing existing PR CI workflows’ triggers or making them push images
- Full Playwright/e2e in the CD path
- Provisioning live Neon/Render/Vercel accounts or setting GitHub secrets from this environment (human follow-up after merge)

## Business rules / invariants

- **Tag-only release:** a merge to `main` alone must **not** deploy.
- **Main containment:** a `v*` tag whose commit is not on `origin/main` must fail the workflow before mutate steps (push/migrate/deploy).
- **Order:** build+push → migrate Neon → Render hook → Vercel prod → smoke. Migrate never runs as container `CMD`/startup.
- **No `:latest`:** only explicit tag + short-sha on GHCR.
- **Smoke is the gate:** CD fails if health/ready/home do not return success (API ready must be `200`, not `503`).
- **Secrets stay out of git:** document secret *names* in refs; values only in GitHub / provider dashboards.
- **CI/CD separation:** existing PR checks remain PR-only; CD does not replace them.
- Assumption: Render service already exists and exposes a deploy hook that accepts `imgURL`; Vercel project exists and Git auto-deploy is (or will be) disabled — wiring secrets is a human post-merge step.
- Assumption: Render can **pull** from GHCR (private package → Render registry credential / deploy key documented in the deploy ref). GHA `packages:write` covers push only; provider pull auth is a separate human setup step.

## Technical contracts

Backend/API:
- No new HTTP endpoints. Smoke targets existing `GET /v1/health` and `GET /v1/health/ready` on `RENDER_API_URL`.

Data/model/migrations:
- CD runs existing Prisma migrations via `prisma migrate deploy` against Neon (`DATABASE_URL` secret). No new migration files in this ticket.

Frontend:
- Vercel builds Next from the monorepo (root install, filter/build web). `NEXT_PUBLIC_API_URL` must be `${RENDER_API_URL}/v1` (or equivalent already including `/v1`) at **build** time.
- Smoke: GET `${VERCEL_WEB_URL}/` (or documented home path) expects success (`2xx`).

Integrations/side effects:
| System | Role in CD |
|---|---|
| GHCR | store API image; auth via `GITHUB_TOKEN` `packages:write` |
| Neon | target of migrate (`DATABASE_URL`) |
| Render | pull image via deploy hook `imgURL`; runtime `DATABASE_URL`, `CORS_ORIGIN` (= Vercel URL) |
| Vercel | native web deploy; build env `NEXT_PUBLIC_API_URL` |
| GitHub Actions | orchestrates assert → push → migrate → Render → Vercel → smoke |

Required GitHub Actions secrets (names):
- `DATABASE_URL`
- `RENDER_DEPLOY_HOOK_URL`
- `RENDER_API_URL`
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `VERCEL_WEB_URL`

Security/privacy:
- Production DB URL and deploy tokens are secrets; never echo values in logs.
- No auth product feature in scope; smoke endpoints are public health/home only.

## Candidate files

- `.github/workflows/cd.yml` — new CD workflow (primary deliverable)
- `vercel.json` — monorepo install/build for Vercel (if committed approach chosen)
- `refs/monorepo-deploy.md` — new living truth for deploy (secrets, order, providers, disable auto-deploy)
- `refs/monorepo-ci.md` — close/replace the “Deploy / release” gap row; point to deploy ref
- `AGENTS.md` — routing row for deploy ref
- `refs/monorepo-docker-images.md` — inspect; only touch if CD changes image push rules beyond “CI builds, CD pushes”
- `refs/monorepo-env-secrets.md` — inspect; document prod secret *names* in deploy ref primarily to avoid duplicating runtime tables
- Existing `.github/workflows/api-image.yml` / `web-*.yml` — **must not** gain push/deploy triggers

## Acceptance criteria

- [ ] CD workflow exists and triggers on `push` tags `v*` and on `workflow_dispatch` with optional existing tag/ref
- [ ] Workflow fails closed when the deploy commit is not contained in `origin/main`
- [ ] On success path: GHCR receives `:v*` and short-sha tags (no `:latest`); Neon is migrated from that image; Render is hooked with that `imgURL`; Vercel prod deploys with correct `NEXT_PUBLIC_API_URL`; smokes return success for API health, API ready, and web home
- [ ] Merge to `main` without a tag does **not** run CD
- [ ] Existing PR CI workflows remain PR-only (`push: false` on image builds)
- [ ] `refs/monorepo-deploy.md` created; `refs/monorepo-ci.md` + `AGENTS.md` updated in the same PR; required secrets and “disable auto-deploy” documented
- [ ] No out-of-scope behavior changed

## Validation plan

Automated (repo scripts / static):
- `pnpm typecheck` (and lint if CI would cover touched app areas) — expect no app code churn; still run to confirm nothing broke
- YAML validity: `actionlint` if available, else careful structural review of `cd.yml`
- Do **not** run migrate/deploy against production from the agent environment; do **not** use a production `DATABASE_URL` locally

Manual/smoke (post-merge human, once secrets + providers exist):
- Cut or dispatch a `v*` tag whose commit is on `main` → workflow green → curl health/ready/home
- Negative: tag commit not on `main` → workflow fails before mutate
- Negative: merge to `main` without tag → no CD run

Regression checks:
- PR open against `main` still runs the six existing check workflows
- API image PR workflow still `push: false`
- Local Docker migrate contract unchanged (still separate from container start)

### Detail expected when the risk justifies it

- **Cenários principais de comportamento:**
  1. Happy path: push tag `vX.Y.Z` on a commit reachable from `origin/main` → assert → push GHCR → migrate → Render → Vercel → smokes pass
  2. Re-deploy: `workflow_dispatch` with an existing tag → same mutate path without creating a new tag
  3. Reject off-main: tag (or dispatch ref) whose commit is not on `origin/main` → fail before push/migrate/deploy
  4. Smoke failure: provider deploy “succeeds” but health/ready/home not OK → workflow fails (no silent green)
- **Variações de entrada:** missing optional dispatch tag (default to selected ref); malformed/non-`v*` tag on dispatch; empty/missing required secrets (Actions fail the step)
- **Bordas relevantes:** tag equals short-sha edge; concurrent CD runs (document concurrency group); Render still on old image if hook fails after migrate (known risk — see Risks)
- **Transições de estado:** schema migrate is forward-only `migrate deploy` (idempotent re-run OK; no rollback in CD). Deploy is not a product state machine.
- **Invariantes de domínio:** no `:latest`; migrate before Render; tag-only release; secrets not in git; PR CI unchanged
- **Riscos cobertos por teste:**
  - off-main tag → assert step fails (scenario 3)
  - bad rollout → smoke fails (scenario 4)
  - accidental main-merge deploy → no CD trigger (acceptance + scenario in docs)
  - workflow YAML mistakes → actionlint / review
- **Compatibilidade / legado / integração:** GHCR naming `bernardoavsouza/home-utilities-api`; Render hook `imgURL`; Vercel monorepo root; CORS_ORIGIN = Vercel URL on Render (documented, not set by GHA unless already chosen)

## Refs afetadas / verdade viva

- `refs/monorepo-deploy.md` — **create** (CD triggers, order, secrets table, provider setup, disable auto-deploy, smoke, GHCR tags)
- `refs/monorepo-ci.md` — update “Deploy / release” gap to point at CD / deploy ref; bump `Reviewed:`
- `AGENTS.md` — add routing row for deploy ref
- `refs/monorepo-docker-images.md` — only if image-push story must change beyond “CI builds; CD pushes” (likely a short cross-link; avoid duplicating deploy rules)
- `refs/monorepo-env-secrets.md` — optional cross-link; prod secret catalog lives in deploy ref

## Risks, assumptions, and open decisions

Risks:
- Migrate succeeds then Render/Vercel fails → Neon schema ahead of running API — mitigate with smoke fail + operator re-dispatch; no automatic rollback in this ticket
- Provider auto-deploy left enabled → double deploys / wrong image — mitigate by documenting disable as required setup
- `NEXT_PUBLIC_API_URL` wrong → web talks to wrong API with green Vercel build — mitigate by constructing from `RENDER_API_URL` in CD and smoking web home (home may not call API yet; document residual risk)
- Secrets not provisioned → first real tag fails — acceptable; PR lands workflow+docs; human sets secrets

Assumptions:
- Neon / Render / Vercel projects will be provisioned by a human; agent does not need live accounts to land the PR
- Deploy hook URL includes whatever Render requires; CD appends/sets `imgURL` to the GHCR image reference
- `RENDER_API_URL` / `VERCEL_WEB_URL` are stable public base URLs (`*.onrender.com` / `*.vercel.app`) for MVP

Open decisions (close in the plan):
- Exact Vercel monorepo wiring: committed `vercel.json` vs dashboard-only settings — **prefer `vercel.json` in-repo** unless blocked
- How long to wait / poll after Render hook before smoke (sleep vs hook response) — plan must pick a concrete, simple approach
- Whether CD concurrency cancels in-progress runs for the same tag/ref
)
