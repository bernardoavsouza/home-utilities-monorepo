# AGENTS.md — monorepo-boilerplate

**Start here.** This file is an **index**, not a manual: it routes you to the ref that answers
your question, states the rules you must not break, and tells you how to keep the refs true.
How this repo actually behaves lives in the refs.

## How to use the refs

1. Find your subject in the routing table below and read **only that ref**.
2. Working inside an app? That app's `AGENTS.md` is the index for its own refs.
3. Need the exact line-by-line behavior? Then read the code — refs name the anchor files for you.
   Don't scan the repo blindly.
4. A ref contradicts the code? **The code wins** — fix the ref (see *Keeping refs current*).
   Never work around a wrong ref and leave it wrong.

## Routing — repo-wide (`refs/`)

| Need… | Read |
|---|---|
| pnpm / Node / TypeScript versions, workspaces, Turborepo, root scripts, `@/*` alias policy | `refs/monorepo-tooling.md` |
| env files, which process reads which, what's committed, secrets policy | `refs/monorepo-env-secrets.md` |
| Docker Compose, the `app` / `app_test` databases, `pnpm bootstrap`, destructive commands | `refs/monorepo-infra-local.md` |
| CI pipeline, the gates, what CI does **not** cover | `refs/monorepo-ci.md` |
| CD / production deploy (tag `v*`, Vercel + Render + Neon, secrets) | `refs/monorepo-deploy.md` |
| the per-app Docker images — build context, stages, the separate migrate step, `NEXT_PUBLIC_*` at build time | `refs/monorepo-docker-images.md` |
| `@packages/contracts` — shared types between web and api | `refs/monorepo-contracts.md` |
| `fin` applet — naming (`fin_*` tables, `/v1/fin`, feature folders, contracts ownership) | `refs/monorepo-fin-applet.md` |

## Routing — per app

| Working on… | Read |
|---|---|
| `apps/api` — NestJS, Prisma, HTTP contract, tests | `apps/api/AGENTS.md` |
| `apps/web` — Next.js App Router, styling, tests | `apps/web/AGENTS.md` |

## What is not a ref

`README.md` and `apps/*/README.md` are human onboarding: keep them consistent, but don't cite
them as truth — the refs are what an agent goes by.

## Hard rules

These hold even if you read nothing else:

- **pnpm only.** `npm` / `yarn` installs are blocked by `only-allow`. Node 24, pnpm 11.
- **No root `.env`, no secrets in git.** Env is per app; templates carry local values only.
- **No domain feature and no Prisma model without a product/spec decision.** Scaffold work stays
  at health + home.
- **No new `packages/*`** without a product/spec reason.
- **No cross-app `@/` imports.** `@/*` is app-local; cross-app types come from
  `@packages/contracts` via `import type`.
- Root-level tasks go through `turbo run` (`pnpm typecheck` / `test` / `lint` / `build`).
- `pnpm db:reset` and `docker compose down -v` are **destructive** — local only, and never
  without saying so first.

## Keeping refs current (living truth)

Refs describe how this repo behaves **today**. A stale ref is a bug, not "partial documentation".
This is not optional cleanup: **code and refs ship in the same PR.** New feature, new rule, changed
behavior — the refs move with it.

### Trigger — what you changed, what you owe the refs

| You changed… | Do this |
|---|---|
| **a new feature, module, or subsystem** that carries rules of its own | **create a new ref** for it and add it to the routing table |
| a rule, contract, behavior, command, or config inside a subject a ref already covers | **update that ref** |
| anything the refs describe **wrongly** (you hit a divergence) | fix the ref immediately, even if it's outside your task |
| something that resolved a caveat a ref records ("not persisted today (stub `Y`)") | delete the caveat |
| removed a feature | delete or trim its ref and drop its row from the routing table |
| renamed or moved a file a ref cites as an anchor | fix the anchor |
| an internal refactor with no change to rules or behavior | **nothing** — refs are not a changelog |

New ref or update? Ask whether an existing ref's subject already covers it: yes → update that
file; no → new file (see *Where a new ref goes*). When a ref grows past one subject, split it.

### Rules

- **Verify against the code, never from memory.** Before you write a claim, open the anchor file.
  If code and ref disagree, the code wins and the ref gets fixed in that moment.
- **Read the relevant ref before you design or plan a change** — and fix it first if it's wrong,
  so the work isn't built on a stale premise.
- **New, renamed, or removed ref file → update the routing table** in the owning `AGENTS.md`, in
  the same commit. An unindexed ref will not be found.
- **Bump `Reviewed:`** in the stamp of every ref you touch.
- **Record facts, not intentions.** "X is not persisted today (stub `Y`)" ✅ — that's what is true.
  "We'll implement X via Z" ❌ — it isn't true yet, so it isn't a ref's business. A caveat is
  temporary truth: remove it as soon as it stops being true.
- Only record a pending issue that **changes a reader's understanding**. Don't fill refs with TODOs.

### Before you call the work done

- [ ] The change touched a rule, contract, behavior, or command → its ref is **updated or created**
- [ ] New / renamed / removed ref → the routing table in the owning `AGENTS.md` matches reality
- [ ] Caveats the change resolved are gone
- [ ] Code anchors the touched refs cite still exist (renamed? moved?)
- [ ] `Reviewed:` bumped on every ref touched
- [ ] The ref change is in **this** PR — never "a follow-up"

## Where a new ref goes

| The knowledge is about… | Put it in |
|---|---|
| the repo as a whole, tooling, env, infra, CI, shared contracts | `refs/<scope>-<subject>.md` |
| one app only | `apps/<app>/refs/<app>-<subject>.md` |

Refs sit **next to the `AGENTS.md` that indexes them** — a per-app ref never lives at the root.
Keep the `<scope>-` filename prefix even though the folder already implies it: the filename has to
identify itself in a search result or a link, out of context.

## Writing a ref

Follow the house shape (`covalenty/agent-docs` → `conventions/ref-template.md`), with one local
deviation: **there is no separate index file** — the co-located `AGENTS.md` is the index.

Every ref opens with, in order:

```markdown
# <Scope> — <Subject>

> **Status:** stable · **Reviewed:** AAAA-MM-DD · **Source:** monorepo-boilerplate@<branch>

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.
```

`Status` is `stable` once the content has been verified against the code, `draft` while it hasn't.
Explicitly marked open questions don't downgrade a `stable` ref.

Body style:

- **Tables over prose** for rules, states, and mappings. One rule = one traceable row.
- Cite code as a **path with no line number and no SHA**, and name the class/function in the text.
- Short headers, shallow bullets. A Mermaid diagram when it genuinely helps.
