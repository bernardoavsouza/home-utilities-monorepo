# API — HTTP contract

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-47-fin-naming-convention

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## One place configures the envelope

`configureApp(app)` in `shared/infrastructure/http/configure-app.ts` applies everything below,
**in this order**:

| # | Applies | Anchor |
|---|---|---|
| 1 | global prefix `v1` | `app.setGlobalPrefix('v1')` |
| 2 | CORS — only when `CORS_ORIGIN` parses to at least one origin | `parseCorsOrigin` + `app.enableCors` |
| 3 | `x-request-id` middleware | `shared/infrastructure/http/request-id.middleware.ts` |
| 4 | global `ValidationPipe` | `configure-app.ts` — `whitelist`, `forbidNonWhitelisted`, `transform` |
| 5 | global exception filter | `shared/infrastructure/http/all-exceptions.filter.ts` |
| 6 | Swagger UI + JSON — **only when enabled** | `shared/infrastructure/http/setup-swagger.ts` |

Both production (`main.ts`) and HTTP tests (`shared/infrastructure/http/create-test-app.ts`) call it, which is what keeps
the two identical. **Any change to the HTTP envelope goes through `configureApp`** — never
configure the same concern separately in `main.ts`.

## Routes

| Route | Response | Notes |
|---|---|---|
| `GET /v1/health` | `200` `{ "status": "ok" }` | liveness — static, **never touches the database** |
| `GET /v1/health/ready` | `200` / `503` `ReadinessResponse` | readiness — `SELECT 1` through `PrismaService` |
| `GET /docs` | Swagger UI | **not** under `/v1` — Swagger is mounted outside the global prefix; `404` when disabled |
| `GET /docs-json` | OpenAPI JSON | paths inside it *are* prefixed (`/v1/health`); `404` when disabled |

Financial module routes register under `fin/…` (public surface `/v1/fin/…`). Naming and
boundary: `../../../refs/monorepo-fin-module.md`. Health stays outside that namespace.

Listen port: `process.env.PORT ?? 3001`.

## Liveness vs readiness

Two different questions, two routes — collapsing them hides a database outage behind a green probe.

| | Liveness | Readiness |
|---|---|---|
| Route | `GET /v1/health` | `GET /v1/health/ready` |
| Answers | "is the process up?" | "can it serve traffic?" |
| Dependencies | none | Postgres, via `ReadinessService` (`features/health/application/readiness.service.ts`) |
| Status | always `200` | `200` when ready, `503` when not |
| Body | `{ status: 'ok' }` | `{ status, dependencies: { database } }` |

`ReadinessController` sets the status code on the response (`@Res({ passthrough: true })`) instead
of throwing, so a `503` keeps the readiness body shape rather than becoming an `ApiErrorBody`.
`ReadinessService` never throws — a failed probe is reported, not propagated.

A new dependency worth reporting (cache, queue, third-party) is added to `ReadinessResponse` and
to `ReadinessService`, never to liveness.

## Input validation

`configureApp` installs a global `ValidationPipe`:

| Option | Value | Effect |
|---|---|---|
| `whitelist` | `true` | properties without a validation decorator are stripped |
| `forbidNonWhitelisted` | `true` | an unknown property is a `400`, not a silent strip |
| `transform` | `true` | the handler receives a DTO instance, not a plain object |

The pipe only validates parameters typed as a **class**. A DTO with no `class-validator`
decorators has an empty whitelist, so with `forbidNonWhitelisted` **every** incoming property is
rejected — a request DTO must carry decorators, not just types. `class-validator` and
`class-transformer` are runtime dependencies of `apps/api` for exactly this reason.

## CORS

`parseCorsOrigin(raw)` — splits on `,`, trims, drops empties.

| `CORS_ORIGIN` | Result |
|---|---|
| unset | returns `undefined` → `enableCors` is **never called** → no CORS headers at all |
| blank / only commas | same as unset |
| `http://a,http://b` | allowlist `['http://a', 'http://b']` |

A non-matching `Origin` gets a normal `200` with **no** `access-control-allow-origin` header —
the request is not rejected, the header is simply absent.

## Request correlation

The incoming id is echoed back in the response header and written into every log line, so it is
only reused when it **looks like an id** — `sanitizeRequestId` in
`shared/infrastructure/http/request-id.middleware.ts`:

| Case | Behavior |
|---|---|
| matches `[A-Za-z0-9._-]+` after trimming, ≤ 128 chars | trimmed and reused |
| missing, blank, or not a string | `randomUUID()` |
| longer than 128 chars | `randomUUID()` |
| contains anything else — spaces, newlines, `:`, non-ASCII | `randomUUID()` |

The length cap stops a multi-KB header from inflating every log line and the response; the
charset stops a newline from forging a log entry. Loosening either re-opens both.

The id is put on `req.requestId` and set on the response header **on every response**, success
or error.

## Error responses

`AllExceptionsFilter` is `@Catch()` — it catches everything and always answers JSON shaped as
`ApiErrorBody` (`{ statusCode, message, error?, code?, fields? }`).

| Thrown | `statusCode` | `message` | `error` | `code` / `fields` |
|---|---|---|---|---|
| `HttpException`, string response | its status | the string | exception class name | omitted |
| `HttpException`, object response | its status | `message` from the payload (string or string[]), else `exception.message` | `error` from the payload, else class name | `code` when it is a string; `fields` when it is a non-empty `Record<string, string[]>`; malformed or empty `{}` omitted |
| anything else | `500` | `'Internal server error'` | `'Internal Server Error'` | omitted |

Logging, via the Nest `Logger`: `` `${method} ${path} ${statusCode} requestId=… ${message}` `` —
`error` **with the stack** when `statusCode >= 500`, `warn` otherwise. Unhandled internals never
leak a stack to the client.

## OpenAPI

`setupSwagger` builds the document with `DocumentBuilder` (title `API`, version `1.0`) and mounts
it at `docs`; Nest serves the JSON at `docs-json`.

**It is gated, and the gate matters.** `configureApp` is the production bootstrap, so an ungated
`/docs` would publish the whole API surface — unauthenticated — in every project derived from this
boilerplate. `isSwaggerEnabled(env)` decides:

| `SWAGGER_ENABLED` | `NODE_ENV` | Swagger |
|---|---|---|
| unset or empty | `production` | **off** |
| unset or empty | anything else | on |
| `'true'` | any | on |
| any other value (`'false'`, `'yes'`, …) | any | off |

So: safe by default in production, opt-in there, and opt-out anywhere else. `SWAGGER_ENABLED` is
in `apps/api/.env.example` — see `../../../refs/monorepo-env-secrets.md`. When it is off, `/docs`
and `/docs-json` are simply not mounted and answer `404` through the exception filter.

Controllers and DTOs **must** carry `@nestjs/swagger` decorators (`@ApiTags`, `@ApiOkResponse`,
`@ApiProperty`) or the published docs go stale silently. Response DTOs live in `presentation/`
and `implements` the `@packages/contracts` type — that way a contract drift fails typecheck
(see `features/health/presentation/health-response.dto.ts`).

## Logging setup

`createAppLogger()` (`shared/infrastructure/observability/app-logger.ts`) returns a
`ConsoleLogger` with `json: true` / no colors when `NODE_ENV=production`, colored text otherwise.
It is wired **only in `main.ts`** — `createTestApp` does not install it, so tests use the Nest
default logger. There is no Sentry or external error tracker, by decision.
