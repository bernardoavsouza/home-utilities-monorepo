# apps/web — AGENTS.md

Index for this app. Read [`../../AGENTS.md`](../../AGENTS.md) first for the repo-wide rules,
the ref-authoring shape, and the living-truth policy.

Next.js App Router (Next 16, React 19), Tailwind v4, tested with Vitest and Playwright.

## Routing — `apps/web/refs/`

| Need… | Read |
|---|---|
| `src/` layout, Server vs Client Components, typed routes and `next typegen`, Tailwind/fonts, `@/*` alias, API base URL | `refs/web-architecture.md` |
| Vitest (jsdom + Testing Library), `*.test.ts(x)` naming, Playwright e2e and the home smoke | `refs/web-testing.md` |

Repo-wide subjects — env vars, CI, `@packages/contracts`, **financial module naming** — are
indexed in [`../../AGENTS.md`](../../AGENTS.md). Financial UI follows
[`../../refs/monorepo-fin-module.md`](../../refs/monorepo-fin-module.md) (`features/financial/`).

## Hard rules

- **Server Components by default.** `"use client"` only when the browser is genuinely required,
  and document the reason at the boundary when it isn't obvious. There are none today.
- **Routes stay thin.** `src/app/` holds routes; the UI lives in `src/features/…`.
- **Don't create `src/shared/` empty** — it appears when a second feature actually shares something.
- **`NEXT_PUBLIC_API_URL` already includes `/v1`.** Never append the prefix again.
- **`NEXT_PUBLIC_*` is baked in at build time**, not read at runtime. Anything that must vary per
  deploy has to be server-side, without the prefix.
- **Don't remove the `NEXT_OUTPUT` branch from `next.config.ts`** — `apps/web/Dockerfile` needs
  `standalone`, and the e2e job needs the default (`next start` won't serve standalone).
- **The home e2e smoke is required** while Playwright is configured — a change to the home heading
  or layout updates `e2e/home.spec.ts` in the same PR. CI runs Playwright, and it boots the API too:
  `webServer` owns the whole stack, so don't point a spec at a deployed environment.
- Unit tests are `*.test.ts` / `*.test.tsx` (`apps/api` uses `*.spec.ts`), run in `jsdom` with
  `@testing-library/react`. Vitest globals are **off** — import `describe` / `it` / `expect`.
- **Don't re-add `passWithNoTests`.** A suite with no files must fail; it was a false green in CI.
- `apps/web/public/` exists (with `.gitkeep` only). The create-next-app SVGs are gone; drop real
  assets here when needed — the web image already copies this folder into the standalone runtime.
- Theme changes go in `src/app/globals.css` — Tailwind v4 is CSS-first, there is no
  `tailwind.config.js`.
- No domain UI without a product/spec decision. Home + layout only.

## Keeping these refs current

Full policy — the trigger table and the closing checklist — is in
[`../../AGENTS.md`](../../AGENTS.md) § *Keeping refs current*. It applies here. In short:

- **New feature under `src/features/<name>/` that carries rules of its own → new ref**
  `refs/web-<name>.md`, plus a row in the routing table above, in the same PR.
- Changed the layout, a rendering boundary, the styling setup, or the test setup → **update the ref
  that covers it** and bump `Reviewed:`.
- Found a ref that contradicts the code → fix the ref now; the code wins.

A ref for this app goes in `apps/web/refs/web-<subject>.md` — never at the repo root.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
