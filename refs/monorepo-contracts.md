# Monorepo — Shared contracts

> **Status:** stable · **Reviewed:** 2026-08-20 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`packages/contracts`, published in the workspace as `@packages/contracts`: the **types-only**
contract between `apps/web` and `apps/api`. Private, `"type": "module"`, and consumed
**as source** — `exports["."]` maps both `types` and `default` to `./src/index.ts`, so there is
no build step. Its only script is `typecheck`.

## Current surface

| Type | File | Shape |
|---|---|---|
| `HealthStatus` | `packages/contracts/src/health.ts` | `'ok'` |
| `HealthResponse` | `packages/contracts/src/health.ts` | `{ status: HealthStatus }` |
| `ApiErrorBody` | `packages/contracts/src/http.ts` | `{ statusCode: number; message: string \| string[]; error?: string }` |
| `ReadinessStatus` | `packages/contracts/src/readiness.ts` | `'ready' \| 'not_ready'` |
| `DependencyStatus` | `packages/contracts/src/readiness.ts` | `'up' \| 'down'` |
| `ReadinessResponse` | `packages/contracts/src/readiness.ts` | `{ status: ReadinessStatus; dependencies: { database: DependencyStatus } }` |

`packages/contracts/src/index.ts` is the only entry point and re-exports everything.

## Who consumes what

| Consumer | Uses |
|---|---|
| `apps/api` — health service, controller, response DTO | `HealthResponse` |
| `apps/api` — readiness service, controller, response DTO | `ReadinessResponse` |
| `apps/api` — global exception filter, observability HTTP spec | `ApiErrorBody` |
| `apps/web` | declares the dependency; imports nothing yet |

## Rules

- **Types only.** No runtime code, no dependencies, unless a runtime helper is explicitly agreed.
- Consumers import with `import type { … } from '@packages/contracts'` — never a deep path into
  `src/`, always the package entry point.
- Adding a type: new file under `packages/contracts/src/`, then re-export from `packages/contracts/src/index.ts` using an
  **`.js` specifier** (`export type { X } from './x.js'`) even though the source is `.ts` —
  required by `verbatimModuleSyntax` + `moduleResolution: bundler`. Copy the existing pattern.
- Changing an existing shape is a **cross-app breaking change**: update `apps/api` and
  `apps/web` in the same PR, and confirm with root `pnpm typecheck`.
- The API must keep its Swagger DTO in step with the contract type — the DTO
  `implements` the contract type so a drift fails typecheck (see
  `apps/api/refs/api-http-contract.md`).
