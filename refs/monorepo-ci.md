# Monorepo — CI

> **Status:** stable · **Reviewed:** 2026-08-22 · **Source:** monorepo-boilerplate@feat/PP-13-cd-deploy-tag-vercel-render-neon


> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## One workflow per app, per concern

There is no single `ci.yml`. Each workflow is one readable signal in the PR checks list, so a red
check names what broke without opening logs.

| Workflow | Job id | Check name | Covers |
|---|---|---|---|
| `.github/workflows/api-checks.yml` | `checks` | `api · lint · typecheck · build` | `prisma generate`, lint, typecheck, build — `--filter=api` |
| `.github/workflows/api-tests.yml` | `tests` | `api · vitest` | Postgres service, migrate `app_test`, Vitest — `--filter=api` |
| `.github/workflows/api-image.yml` | `image` | `api · docker build` | `docker build -f apps/api/Dockerfile` |
| `.github/workflows/web-checks.yml` | `checks` | `web · lint · typecheck · build` | lint, typecheck (`next typegen` first), build — `--filter=web` |
| `.github/workflows/web-tests.yml` | `unit`, `e2e` | `web · vitest`, `web · playwright` | Vitest, then Playwright over the **whole stack** |
| `.github/workflows/web-image.yml` | `image` | `web · docker build` | `docker build -f apps/web/Dockerfile` |

Every job's `name` carries its app, so the seven check names are **unique across workflows**. That
matters beyond readability: branch protection identifies a required check by job name, so two jobs
called `docker build` would be indistinguishable there. Keep names unique when adding a workflow.

## When they run

**Only on pull requests whose base is `main`.** There is no `push` trigger and no other base branch:
`main` is the only long-lived branch in this repo, so a PR to `main` is the only path into it.
Production deploy is **separate**, and follows the same one-workflow-per-app rule:
`.github/workflows/cd.api.yml` and `.github/workflows/cd.web.yml`, both on tag `v*` — see
`monorepo-deploy.md`. Do not fold deploy into these PR checks.

| Event | Runs? |
|---|---|
| PR opened / updated against `main` | yes — all six |
| PR against any other base | no |
| push to `main` (i.e. the merge) | **no** |
| push to a feature branch with no PR | no |
| push tag `v*` / CD `workflow_dispatch` | PR CI **no** — CD yes (`monorepo-deploy.md`) |

Each workflow has a `concurrency` group keyed on workflow + ref, so a new push to the PR cancels the
superseded run.

Adding a trigger is a deliberate change, not a convenience: a second base branch or a `push` trigger
means every workflow runs in a context none of them were written for.

## `packages/contracts` has no workflow

On purpose, and it is not a gap:

| Task | Where it runs |
|---|---|
| `typecheck` | as an **upstream dependency** — `typecheck` declares `dependsOn: ["^typecheck"]`, so `turbo run typecheck --filter=api` also runs `@packages/contracts#typecheck`. Both app check workflows cover it |
| `lint` | nowhere — the package defines no `lint` script |
| `build` | nowhere — it is consumed as source (`monorepo-contracts.md`) |

A contracts-only change is therefore still typechecked, twice. Give it a workflow only if it ever
gains a script of its own.

## Shared setup

`.github/actions/setup/action.yml` — a composite action every workflow uses after `checkout`:
pnpm at the pinned version, Node from `.nvmrc` with the pnpm cache, then
`pnpm install --frozen-lockfile`. Setup lives in exactly one place; a workflow never re-spells it.

The image workflows skip it — they use Buildx + `docker/build-push-action` with GHA layer cache
instead of a host toolchain.

## The e2e job runs the whole stack

`web-tests.yml` → `e2e` is the only job that boots more than one app. It has the same Postgres
service as the API tests, runs `prisma generate` + migrate, builds both apps, then hands off to
Playwright, whose `webServer` starts the API (`start:prod`, i.e. `dist/main`) and the web app
(`next start`) itself — see `../apps/web/refs/web-testing.md`.

**There is no deployed environment in the loop, and there never needs to be one.** The stack under
test is the same api + web a developer runs locally; the only difference is that CI serves the built
artifacts instead of the dev servers.

`NEXT_PUBLIC_API_URL` is set at the **job** level because `next build` inlines it — setting it
later, at `docker run` or at `next start`, does nothing (`monorepo-docker-images.md`).

`NODE_ENV=production` is also set at the job level so the API's production envelope is what runs:
Swagger off by default, JSON logs. Without it, `start:prod` would boot with Swagger on and text
logs — the opposite of what the image ships. `e2e/api-reachable.spec.ts` asserts `GET /docs` and
`/docs-json` return `404` under that envelope, so a regression that remounts Swagger cannot stay
green.

The Playwright HTML report is uploaded as an artifact whenever the job is not cancelled
(`if-no-files-found: error`). The reporter that writes it is declared in `playwright.config.ts`
(`list` + `html`); without that declaration the upload step would have nothing to send.

## Not covered by CI

| Gap | Where it runs instead |
|---|---|
| `pnpm db:seed` | not run in CI (no-op today) |
| the `app` database | CI only ever creates `app_test`; the API tests migrate `db:migrate:test` alone, never the root `pnpm db:migrate` |
| Deploy / release | owned by CD on tag `v*` — see `monorepo-deploy.md`. PR image workflows still `push: false` |
| `main` after the merge | nothing re-runs post-merge. The gate is the PR, so a branch that was up to date with `main` when it went green is what lands; a stale branch is the case this does not cover |

## Rules

- `--frozen-lockfile` means **`pnpm-lock.yaml` must be committed** with every dependency change.
- The pnpm version is pinned in two places — `packageManager` in `package.json` and the composite
  setup action. Bump them together.
- **No `paths:` filters, deliberately.** Every workflow runs on every PR. Filters would skip
  workflows on unrelated changes, and a skipped workflow never reports — so any of these configured
  as a *required* check would block the PR forever. Add filters only together with a branch-protection
  decision, and remember the shared inputs (lockfile, `turbo.json`, `packages/contracts`, the
  workflow itself) belong in every app's path list.
- Run app tasks through `turbo run <task> --filter=<app>`, not the package script directly — the
  filter keeps the task graph, which is what pulls the contracts typecheck in.
- The image workflows are what keep the two `Dockerfile`s from rotting. Don't drop them to save
  minutes. They build via Buildx with `cache-from` / `cache-to: type=gha` so install layers survive
  across PRs; a plain `docker build` on a clean runner re-resolves everything every time.
- A check that must gate merges belongs in one of these workflows; a local-only script is not a gate.
