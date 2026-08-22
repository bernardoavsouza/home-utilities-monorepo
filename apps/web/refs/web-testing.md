# Web — Testing

> **Status:** stable · **Reviewed:** 2026-08-21 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Unit — Vitest

`vitest.config.ts`:

| Setting | Value |
|---|---|
| `include` | `src/**/*.test.{ts,tsx}` |
| `environment` | `jsdom` |
| `setupFiles` | `./vitest.setup.ts` — Testing Library `cleanup()` after each test |
| `resolve.alias` | `@` → `./src` |

There is **no `passWithNoTests`**: an empty suite fails, so a green `pnpm --filter web test` means
tests actually ran. It was removed because the CI gate was reporting a pass over zero files.

Component tests work out of the box — `jsdom` plus `@testing-library/react`, and `.tsx` is matched
by `include`. Current suite: `src/features/home/home-heading.test.tsx` renders `HomeHeading` and
asserts the level-1 heading. JSX is transformed by esbuild from `tsconfig.json`'s
`"jsx": "react-jsx"`; there is no Vite React plugin.

Vitest globals are **off** here (`apps/api` has them on): import `describe` / `it` / `expect` from
`vitest` in every file.

Naming: `*.test.ts` / `*.test.tsx` **here**, while `apps/api` uses `*.spec.ts`. Keep each side to
its own convention or the runner silently skips the file.

Testing Library queries are role-based by preference (`getByRole`) — they assert what a user and a
screen reader see, so a markup refactor that keeps the semantics keeps the test.

## E2E — Playwright

`playwright.config.ts`:

| Setting | Value |
|---|---|
| `testDir` | `./e2e` (outside `src/`) |
| Project | `chromium` only, Desktop Chrome |
| `baseURL` | `http://127.0.0.1:3000` |
| `webServer` | **two servers** — see below |
| `reporter` | `list` + `html` (`open: 'never'`) — writes `playwright-report/` |
| `fullyParallel` | `true` |
| CI behavior | `forbidOnly`, `retries: 2` |
| `trace` | `on-first-retry` |

### Playwright owns the whole stack

`webServer` is an array: the **API** and the **web app**. An e2e that cannot reach the API is not an
e2e, so nothing here ever points at a deployed environment — and nothing needs to.

| | Local | CI (`process.env.CI`) |
|---|---|---|
| api | `pnpm --filter api dev` | `pnpm --filter api start:prod` (`dist/main`), with `NODE_ENV=production` from the job |
| web | `pnpm --filter web dev` | `pnpm --filter web start` (`next start`) |
| existing server on the port | reused | never reused |

Playwright waits on the API's **liveness** (`/v1/health`), not readiness: the API boots without
Postgres because Prisma connects lazily, and waiting on the database here would hide that.

CI serves the *built* artifacts, so the e2e job builds both apps first — which is also why
`next start` matters: `output: 'standalone'` is opt-in via `NEXT_OUTPUT` precisely because
`next start` refuses to serve a standalone build (`../../../refs/monorepo-docker-images.md`).

Ports 3000 and 3001 must be free locally, or an already-running `pnpm dev:web` / `pnpm dev:api` is
reused. Run it with `pnpm --filter web test:e2e`.

### The suite

| Spec | Asserts |
|---|---|
| `e2e/home.spec.ts` | the home page renders the heading `Monorepo Boilerplate` |
| `e2e/api-reachable.spec.ts` | `GET {NEXT_PUBLIC_API_URL}/health` is `200 {"status":"ok"}`; in CI, `GET /docs` and `/docs-json` are `404` |

The home smoke is **required** while Playwright is configured — if a change alters that heading,
update the spec in the same PR.

`api-reachable.spec.ts` guards the api half of `webServer`: without a test that actually reaches
it, the API could stop booting and every e2e would still pass. The Swagger assertion runs **only
in CI** — locally `webServer` boots `api dev` (Swagger on); CI boots `start:prod` with
`NODE_ENV=production` (Swagger off). That is what locks the production envelope the image ships.

## In CI

`.github/workflows/web-tests.yml` runs both — job `unit` for Vitest, job `e2e` for Playwright, the
latter with a Postgres service, migrations, and a build of both apps. The HTML report (produced by
the `html` reporter above) is uploaded as an artifact on every non-cancelled run, and the upload
fails the step if the directory is missing. See `../../../refs/monorepo-ci.md`.

Artifacts (`test-results/`, `playwright-report/`, `playwright/.cache/`) are gitignored.
