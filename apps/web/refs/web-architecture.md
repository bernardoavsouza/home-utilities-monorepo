# Web — Architecture

> **Status:** stable · **Reviewed:** 2026-08-31 · **Source:** home-utilities-monorepo@feat/PP-48-currency-catalog-money

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Stack

| Thing | Version / value |
|---|---|
| Next.js | `16.3.0`, App Router |
| React | `19.2.8` |
| Styling | Tailwind CSS v4 (PostCSS plugin) |
| Ports | dev and `start` both on **3000** |
| Config | `next.config.ts` — `outputFileTracingRoot` at the monorepo root, and `output: 'standalone'` **only when `NEXT_OUTPUT=standalone`** (the Docker image sets it; `next start` cannot serve a standalone build) |

## Layout

```text
src/
  app/        routes only — layout, page, globals.css, favicon
  features/   feature UI and logic
  shared/     cross-feature utilities/components
```

`app`, `features`, `shared` are **siblings** under `src/`.

`src/shared/` **does not exist yet** — it is the agreed home for cross-feature code, to be created
when a second feature actually needs to share something. Don't create it empty.

Current content: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, and
`features/home/home-heading.tsx`. Routes stay thin — `src/app/page.tsx` composes components from
`features/`, it doesn't hold the UI.

Financial UI (budget month and related panels) lives under `features/financial/` — naming and
boundary in `../../../refs/monorepo-fin-module.md`. Do not put that UI under a top-level
`features/budget/` that bypasses the module.

## Server vs client

Server Components by default. `"use client"` **only** when the code genuinely requires the
browser (browser APIs, local state, event handlers that cannot stay on the server), and when the
reason isn't obvious, note it at the boundary.

Today there are **zero client components** — treat adding the first one as a decision worth
justifying, not a default.

## Typed routes and `typecheck`

`src/app/layout.tsx` types its props as `LayoutProps<"/">`, a global that Next **generates**. That is why
`typecheck` is `next typegen && tsc --noEmit` — plain `tsc` fails on a clean checkout because the
generated types aren't there yet. Same reason `tsconfig.json` includes `.next/types/**/*.ts` and
`.next/dev/types/**/*.ts`.

## Styling

| Piece | Where |
|---|---|
| Tailwind v4 entry | `@import "tailwindcss"` at the top of `src/app/globals.css` |
| PostCSS wiring | `postcss.config.mjs` → `@tailwindcss/postcss` |
| Design tokens | CSS variables on `:root` + `@theme inline` in `src/app/globals.css`; dark via `prefers-color-scheme` |
| Fonts | `next/font/google` `Geist` / `Geist_Mono` in `src/app/layout.tsx`, exposed as `--font-geist-sans` / `--font-geist-mono` |

There is **no `tailwind.config.js`** — v4 is CSS-first. Theme changes go in `src/app/globals.css`.

## Imports and API access

| Concern | Rule |
|---|---|
| Alias | `@/*` → `./src/*` (`tsconfig.json` paths, mirrored in `vitest.config.ts`). Prefer `@/features/…`, `@/shared/…` |
| API base URL | `NEXT_PUBLIC_API_URL` — **already includes `/v1`** (`http://localhost:3001/v1`). Never append the prefix again |
| Build-time vs run-time | every `NEXT_PUBLIC_*` var is **inlined by `next build`**. In the Docker image it is a `--build-arg`, and changing it needs a rebuild — see `../../../refs/monorepo-docker-images.md`. A value that must vary per deploy cannot be `NEXT_PUBLIC_` |
| Shared types | `import type { … } from '@packages/contracts'` — declared as a dependency, not imported yet |

## Scope rule

Home + root layout only, until a spec says otherwise. No domain UI in scaffold work.
