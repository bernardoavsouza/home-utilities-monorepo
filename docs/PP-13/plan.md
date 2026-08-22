# PP-13 CD deploy on semver tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tag-gated CD workflow that pushes the API image to GHCR, migrates Neon, rolls Render via deploy hook `imgURL`, deploys web on Vercel, smokes public URLs, and records living deploy truth in refs.

**Architecture:** One new workflow `.github/workflows/cd.yml` (separate from PR CI). Ordered jobs/steps: resolve tag → assert commit ⊆ `origin/main` → build/push GHCR → `prisma migrate deploy` via `docker run` → Render deploy hook → Vercel `--prod` with build-time `NEXT_PUBLIC_API_URL` → smoke with retries. Committed root `vercel.json` pins monorepo install/build. New `refs/monorepo-deploy.md` owns deploy rules; CI ref loses the “no deploy” gap.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Neon Postgres, Render deploy hooks, Vercel CLI, pnpm/Turbo, Prisma migrate.

**Spec:** `docs/PP-13/spec.md` (status: ready)

## Global Constraints

- Base branch is `main` (this repo has no `develop`)
- CD fails if deploy commit is not an ancestor of `origin/main`
- Triggers: `push` tags `v*` + `workflow_dispatch` (existing `v*` tag **required** on dispatch); non-`v*` tag → fail early
- No `:latest` on GHCR — only `:vX.Y.Z` and `:sha-<short>`
- Migrate **before** Render; never on container start
- Web = Vercel native (not Docker); API = Render from GHCR; DB = Neon
- Domains MVP: `*.vercel.app` + `*.onrender.com`
- PR CI workflows stay PR-only; do not change their `on:` or `push: false`
- Secrets names only in git; no production secrets in the agent environment
- No comments in code/YAML unless non-obvious intent requires them
- Unstage `docs/*/*-review.md` before commit
- Single commit at the end is fine for this infra ticket (optional mid-task commits OK)

## Closed decisions (from spec review ressalvas)

| Decision | Choice |
|---|---|
| Vercel monorepo wiring | Committed root `vercel.json`; Vercel project Root Directory = repo root |
| Wait after Render hook | Fixed `sleep 45`, then curl retry loop (18× / 10s) on `/v1/health` then `/v1/health/ready` |
| Concurrency | `group: cd-${{ github.workflow }}-${{ inputs.tag \|\| github.ref }}`, `cancel-in-progress: true` |
| `workflow_dispatch` non-`v*` | Fail in “Resolve tag” step if tag does not match `v*` |
| GHCR → Render pull | Document Render **Registry Credential** for `ghcr.io` (PAT/classic with `read:packages`) in deploy ref — not a GHA secret; human setup |
| Smoke web API coupling | Document residual: home GET does not prove `NEXT_PUBLIC_API_URL`; API URL still set from `RENDER_API_URL` |

## File map

| Path | Action |
|---|---|
| `.github/workflows/cd.yml` | Create |
| `vercel.json` | Create (root) |
| `refs/monorepo-deploy.md` | Create |
| `refs/monorepo-ci.md` | Modify — Deploy gap → point to deploy ref; bump Reviewed |
| `AGENTS.md` | Modify — routing row for deploy |
| `refs/monorepo-docker-images.md` | Modify — one-line cross-link that CD pushes; CI still `push: false`; bump Reviewed |
| `docs/PP-13/spec.md` / `plan.md` | Already present; ship in PR |

---

### Task 1: Root `vercel.json`

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Produces: deterministic Vercel install/build for monorepo web

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "corepack enable && pnpm install --frozen-lockfile",
  "buildCommand": "pnpm exec turbo run build --filter=web",
  "outputDirectory": "apps/web/.next"
}
```

- [ ] **Step 2: Sanity-check JSON**

Run: `python3 -c 'import json; json.load(open("vercel.json"))'`  
Expected: exit 0

---

### Task 2: CD workflow `.github/workflows/cd.yml`

**Files:**
- Create: `.github/workflows/cd.yml`

**Interfaces:**
- Consumes: secrets listed in spec; GHCR via `GITHUB_TOKEN`
- Produces: green/red CD run; image tags; side effects on Neon/Render/Vercel when secrets exist

- [ ] **Step 1: Create workflow skeleton**

```yaml
name: CD

on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      tag:
        description: Existing git tag to redeploy (e.g. v1.2.3). Required for dispatch.
        required: true
        type: string

concurrency:
  group: cd-${{ github.workflow }}-${{ github.event.inputs.tag || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/bernardoavsouza/home-utilities-api

jobs:
  deploy:
    name: deploy · tag → GHCR → Neon → Render → Vercel → smoke
    runs-on: ubuntu-latest
    steps:
      # steps below
```

- [ ] **Step 2: Checkout + resolve tag + assert on main**

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Resolve tag
        id: meta
        run: |
          set -euo pipefail
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            TAG="${{ github.event.inputs.tag }}"
          else
            TAG="${GITHUB_REF_NAME}"
          fi
          case "$TAG" in
            v*) ;;
            *)
              echo "Tag must match v* (got: $TAG)"
              exit 1
              ;;
          esac
          if ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
            git fetch origin "refs/tags/$TAG:refs/tags/$TAG"
          fi
          COMMIT="$(git rev-list -n 1 "$TAG")"
          SHORT_SHA="$(git rev-parse --short=7 "$COMMIT")"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "commit=$COMMIT" >> "$GITHUB_OUTPUT"
          echo "short_sha=$SHORT_SHA" >> "$GITHUB_OUTPUT"
          echo "image_tag=${{ env.IMAGE_NAME }}:$TAG" >> "$GITHUB_OUTPUT"
          echo "image_sha=${{ env.IMAGE_NAME }}:sha-$SHORT_SHA" >> "$GITHUB_OUTPUT"

      - name: Assert tag commit is on origin/main
        run: |
          set -euo pipefail
          git fetch origin main
          if ! git merge-base --is-ancestor "${{ steps.meta.outputs.commit }}" origin/main; then
            echo "Commit ${{ steps.meta.outputs.commit }} (tag ${{ steps.meta.outputs.tag }}) is not on origin/main"
            exit 1
          fi

      - name: Checkout tagged commit
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.meta.outputs.commit }}
          fetch-depth: 0
```

- [ ] **Step 3: Build and push API image (no `:latest`)**

```yaml
      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: |
            ${{ steps.meta.outputs.image_tag }}
            ${{ steps.meta.outputs.image_sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 4: Migrate Neon from the pushed image (before Render)**

```yaml
      - name: Migrate Neon (prisma migrate deploy)
        run: |
          set -euo pipefail
          docker run --rm \
            -e DATABASE_URL \
            "${{ steps.meta.outputs.image_tag }}" \
            ./node_modules/.bin/prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

- [ ] **Step 5: Trigger Render deploy hook with `imgURL`**

```yaml
      - name: Deploy Render (deploy hook + imgURL)
        run: |
          set -euo pipefail
          IMAGE_URL="${{ steps.meta.outputs.image_tag }}"
          ENCODED="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$IMAGE_URL")"
          HOOK="${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
          case "$HOOK" in
            *\?*) URL="${HOOK}&imgURL=${ENCODED}" ;;
            *) URL="${HOOK}?imgURL=${ENCODED}" ;;
          esac
          curl -fsS -X POST "$URL"
```

- [ ] **Step 6: Wait + smoke API**

```yaml
      - name: Wait for Render rollout
        run: sleep 45

      - name: Smoke API health + ready
        run: |
          set -euo pipefail
          BASE="${{ secrets.RENDER_API_URL }}"
          BASE="${BASE%/}"
          smoke() {
            local path="$1"
            local i=1
            while [ "$i" -le 18 ]; do
              code="$(curl -sS -o /tmp/smoke-body -w '%{http_code}' "$BASE$path" || true)"
              if [ "$code" = "200" ]; then
                echo "OK $path ($code)"
                return 0
              fi
              echo "attempt $i: $path → $code"
              i=$((i + 1))
              sleep 10
            done
            echo "Smoke failed for $path"
            cat /tmp/smoke-body || true
            exit 1
          }
          smoke /v1/health
          smoke /v1/health/ready
```

- [ ] **Step 7: Deploy Vercel prod + smoke web**

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Install Vercel CLI
        run: npm install --global vercel@41

      - name: Deploy Vercel (prod)
        run: |
          set -euo pipefail
          API_BASE="${{ secrets.RENDER_API_URL }}"
          API_BASE="${API_BASE%/}"
          export NEXT_PUBLIC_API_URL="${API_BASE}/v1"
          vercel deploy --prod --yes \
            --token="${{ secrets.VERCEL_TOKEN }}" \
            --build-env NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
            --env NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL"
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Smoke web home
        run: |
          set -euo pipefail
          WEB="${{ secrets.VERCEL_WEB_URL }}"
          WEB="${WEB%/}"
          i=1
          while [ "$i" -le 12 ]; do
            code="$(curl -sS -o /tmp/web-body -w '%{http_code}' "$WEB/" || true)"
            if [ "$code" = "200" ]; then
              echo "OK web home ($code)"
              exit 0
            fi
            echo "attempt $i: web → $code"
            i=$((i + 1))
            sleep 10
          done
          echo "Smoke failed for web home"
          cat /tmp/web-body || true
          exit 1
```

- [ ] **Step 8: Validate YAML locally**

Run: `python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/cd.yml"))'` if PyYAML present; else `actionlint .github/workflows/cd.yml` if installed; else visual review against this plan.  
Expected: parse OK / no errors.

---

### Task 3: Living refs + AGENTS routing

**Files:**
- Create: `refs/monorepo-deploy.md`
- Modify: `refs/monorepo-ci.md`
- Modify: `refs/monorepo-docker-images.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: deploy truth agents can route to; CI gap closed

- [ ] **Step 1: Create `refs/monorepo-deploy.md`**

Follow house stamp (`Status: stable`, `Reviewed: 2026-08-22`, Source branch). Cover tables for:

1. **When CD runs** — tag `v*` push + `workflow_dispatch`; merge to `main` alone does **not** deploy
2. **Pipeline order** — assert on main → GHCR push → Neon migrate → Render hook → Vercel → smoke
3. **GHCR tags** — `ghcr.io/bernardoavsouza/home-utilities-api:<git-tag>` + `:sha-<short>`; no `:latest`
4. **GitHub Actions secrets** — `DATABASE_URL`, `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_WEB_URL`; packages:write via `GITHUB_TOKEN`
5. **Render service env** — `DATABASE_URL`, `CORS_ORIGIN` (= `VERCEL_WEB_URL`); image-backed service; **Registry Credential** for private GHCR (`read:packages`); Git auto-deploy **disabled** (CD-owned)
6. **Vercel** — project Root Directory = repo root; uses `vercel.json`; build env `NEXT_PUBLIC_API_URL=${RENDER_API_URL}/v1`; Git auto-deploy **disabled**
7. **Smoke** — `GET /v1/health`, `GET /v1/health/ready` → 200; `GET ${VERCEL_WEB_URL}/` → 200; residual that home may not call API
8. **Domains MVP** — `*.onrender.com` / `*.vercel.app`
9. Anchor: `.github/workflows/cd.yml`, `vercel.json`, migrate command from `apps/api/Dockerfile`

- [ ] **Step 2: Update `refs/monorepo-ci.md`**

- Bump `Reviewed:` to `2026-08-22`
- In “Not covered by CI”, replace Deploy/release gap with: Deploy/release is owned by CD — see `monorepo-deploy.md` (tag `v*` only; PR image workflows still `push: false`)
- Optionally note in “When they run” that CD is a separate workflow with different triggers (do not add CD to the PR table)

- [ ] **Step 3: Update `refs/monorepo-docker-images.md`**

- Bump `Reviewed:`
- Change closing “Nothing pushes an image” / “no deploy workflow” to: PR image workflows still build with `push: false`; **CD** (`.github/workflows/cd.yml`) pushes the API image to GHCR on tag — see `monorepo-deploy.md`. Web production deploys via Vercel native build, not the web image.

- [ ] **Step 4: Update `AGENTS.md` routing**

Add row under repo-wide routing:

| Need… | Read |
|---|---|
| CD / production deploy (tag `v*`, Vercel + Render + Neon, secrets) | `refs/monorepo-deploy.md` |

---

### Task 4: Validation + commit prep

**Files:** none new

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`  
Expected: PASS (no app TS changes expected)

- [ ] **Step 2: Confirm PR CI workflows untouched**

Run: `git diff --name-only origin/main -- .github/workflows/api-*.yml .github/workflows/web-*.yml`  
Expected: empty

- [ ] **Step 3: Stage excluding review artifacts**

```bash
git add -A
git reset -q -- 'docs/*/*-review.md'
git commit -m "feat(PP-13): CD deploy on semver tag (Vercel + Render + Neon)"
```

Do **not** use `--no-verify`. Do **not** add Co-Authored-By.

---

## Spec coverage checklist

| Spec acceptance / scenario | Task |
|---|---|
| CD on `v*` + `workflow_dispatch` | Task 2 |
| Fail if not on `origin/main` | Task 2 Step 2 |
| GHCR tag + short-sha, no latest | Task 2 Step 3 |
| Migrate before Render | Task 2 Steps 4–5 |
| Vercel with `NEXT_PUBLIC_API_URL` | Task 2 Step 7 + Task 1 |
| Smokes | Task 2 Steps 6–7 |
| Merge to main does not deploy | Task 2 `on:` + Task 3 deploy ref |
| PR CI unchanged | Task 4 Step 2 + Global Constraints |
| Refs + AGENTS | Task 3 |
| Render GHCR pull / disable auto-deploy | Task 3 deploy ref |
| Non-`v*` dispatch fails | Closed decisions + Task 2 Resolve tag |

## Validation plan (executor)

### Cenários de comportamento (verificação)

| # | Scenario | Where verified | Expected |
|---|---|---|---|
| 1 | Happy path: tag `v*` whose commit is on `origin/main` → assert → GHCR push → Neon migrate → Render hook → Vercel → smokes 200 | Manual post-merge (human), once secrets + providers exist | Workflow green; health/ready/home OK |
| 2 | Off-main: tag or dispatch whose commit is **not** on `origin/main` | Manual post-merge (or dry-run by tagging an orphan commit in a throwaway) | Fail at “Assert tag commit is on origin/main” **before** push/migrate/deploy |
| 3 | Merge to `main` without a tag | Inspect `on:` in `cd.yml` + observe Actions after merge | CD does **not** start |
| 4 | `workflow_dispatch` with non-`v*` tag (e.g. `release-1`) | Manual dispatch or reasoning over Resolve tag `case` | Fail in “Resolve tag”; no mutate steps |
| 5 | PR CI / image workflows stay PR-only (`push: false`) | Automated in Task 4: `git diff` vs `origin/main` on `api-*.yml` / `web-*.yml` | Empty diff; image workflows still `push: false` |

Automated in this PR (agent environment): `pnpm typecheck`; YAML parse / `actionlint` if available; scenario **5**.  
Do **not** run migrate/deploy against production from the agent (no production `DATABASE_URL` loaded).

### Why this coverage is enough (Complex)

This ticket’s risk is **operational wiring**, not domain logic: wrong trigger, wrong order, or silent green without smoke. Scenarios **2–4** + the fail-closed assert/resolve steps in Task 2 cover the “must not mutate” paths without needing a live cloud account. Scenario **5** guards CI/CD separation in-repo. Scenario **1** cannot be honestly exercised here without production secrets — landing the workflow + refs is the deliverable; the first human tag after provisioning is the live proof. Residual risk (migrate succeeds then Render fails; web home not calling API) is documented in the deploy ref and accepted for MVP; re-dispatch is the recovery. That is proportionate: we do not invent a fake e2e against Neon from CI.
)
