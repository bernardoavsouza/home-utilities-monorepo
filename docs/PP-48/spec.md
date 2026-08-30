---
contract: cienty-spec-v1
ticket: PP-48
title: "[Fin][Domain] Catálogo de moedas predefinidas + Money tipado"
repo: home-utilities-monorepo
status: ready
owner: unknown
created_at: 2026-08-30T21:27:15Z
updated_at: 2026-08-30T21:50:00Z
base: origin/main @ 2026-08-30
parent: PP-46
follow_ups: [PP-49, PP-52]
siblings: []
approved_by: "spec-plan-reviewer 2026-08-30 (iter 2)"
spec_mode: standard
source_links:
  - Jira PP-48
  - refs/monorepo-fin-module.md
  - refs/monorepo-contracts.md
  - docs/PP-8/spec.md
---

# PP-48 — [Fin][Domain] Catálogo de moedas predefinidas + Money tipado

## Context

Toda a contabilidade do applet `fin` é multi-moeda de verdade (fiat + stablecoins + BTC). Valor sem moeda quebra o ledger; moedas são um catálogo predefinido — não texto livre. Parent PP-46; foundation PP-47 (convenção `fin`) já mergeada em `main`; consumidor imediato PP-49 (ledger).

**Baseline verificado em `origin/main` @ `33debea` (PP-47 merge):**

| Área | Estado atual |
|---|---|
| `packages/contracts/src/money.ts` | `CurrencyCode` branded aberto (`string & { __brand }`); `Money = { amount: string; currency: CurrencyCode }` em **major units** (decimal string) — PP-8 |
| Catálogo MVP / scale / kind | **Ausente** — nenhum `CURRENCY_*`, `amountMinor`, ou domain `fin` |
| `apps/api/src/features/fin/` | **Ausente** — só `features/health/` |
| Refs | `refs/monorepo-fin-module.md` já manda Money/CurrencyCode em `packages/contracts/src/money.ts` (shared, não `fin_*`); `refs/monorepo-contracts.md` documenta shape major-units |
| Erros HTTP | `ApiErrorBody` com `code?` / `fields?` (`packages/contracts/src/http.ts`); filter em `all-exceptions.filter.ts` encaminha quando válidos |
| Fixtures web | `apps/web/src/lib/api-contracts/panels.ts` usa `amount: '10.50'` |

Gap: o ledger (PP-49) precisa de Money em unidades menores tipado + catálogo fechado com scale; o contrato PP-8 ainda é major-units aberto e sem validação de domínio.

## Objective

Definir o **catálogo versionado das 6 moedas do MVP** e o tipo **Money (`amountMinor` + `currency`)** com helpers de domínio (parse/format/soma/subtração mesma currency) e erros claros, de forma que PP-49 consuma a invariante **1 conta = 1 moeda** e `posting.money.currency === account.currency` sem inventar catálogo/FX.

## Task classification

- Classification: `Complex`
- Rationale:
  - Semântica de dinheiro / ledger: shape canônico de Money e scale por moeda
  - Breaking change cross-app no contrato compartilhado (`amount` → `amountMinor`) e no fechamento de `CurrencyCode`
  - Múltiplos ramos de comportamento (currency inválida, aritmética cross-currency, parse/format por scale)
  - Invariante documentada para o consumidor PP-49; risco de regressão silenciosa nos fixtures/panel contracts

## Decisões alinhadas (locked with the user)

1. Catálogo como **constante versionada no código** — sem tabela `fin_currencies` no MVP; usuário não cria moeda ad-hoc.
2. Moedas MVP: `BRL`, `USD`, `EUR`, `USDC`, `USDT`, `BTC` com scales 2 / 2 / 2 / 6 / 6 / 8; metadata `code`, `scale`, `symbol`, `kind` (`fiat` \| `stablecoin` \| `crypto`); `kind` é metadado e **não** muda o tipo Money.
3. Money = `{ amountMinor: integer; currency: CurrencyCode }` — scale vem do catálogo; nunca persistir amount sem currency.
4. USDC/USDT/BTC entram no **mesmo** catálogo/Money que fiat (não há tipo paralelo).
5. Sem moeda base do user / agregação FX / conversão automática neste ticket (nem no MVP de saldos — saldos por moeda lado a lado).
6. Equity / quantidade de papéis **fora** — não poluir o catálogo; Money continua válido só para preço/custo/provento quando equity existir.
7. Invariante para PP-49: **1 conta = 1 moeda**; posting deve ter `money.currency === account.currency`; cross-currency = movimento entre contas (shape no PP-49), sem FX.
8. **Sem endpoint HTTP neste ticket** — superfície = tipos compartilhados + domínio; listagem read-only `/v1/fin/currencies` fica para **PP-52** (painel/API). Documentado explicitamente abaixo.
9. Paths alinhados à PP-47: Money/CurrencyCode em `packages/contracts/src/money.ts` (shared); regras/helpers em `apps/api/src/features/fin/domain/…` (não `fin_` em tipo Money).

## Scope

In scope:
- Fechar `CurrencyCode` às 6 moedas MVP e tipar `CurrencyKind` / `CurrencyDefinition` em `@packages/contracts`
- Breaking change de `Money` para `{ amountMinor: number /* integer */; currency: CurrencyCode }`
- Atualizar contratos/fixtures que dependem do shape antigo (`DebtsPanelCurrencyTotals.principal`/`balance`, fixtures web, testes de fixture)
- Catálogo runtime versionado + helpers de domínio (resolve currency, parse/format major↔minor, add/sub same-currency, validate Money)
- Shape exato de erros de validação (`code` / `message` / `fields`)
- Documentar invariante 1 conta = 1 moeda para PP-49; atualizar refs vivas (`monorepo-contracts.md`, `monorepo-fin-module.md`)

Out of scope:
- Endpoint HTTP de listagem do catálogo (PP-52)
- Ledger / contas / journal / postings (PP-49)
- Preferência de moeda base do user / agregação cross-currency / FX
- Categorias, budget UI, CRUD
- Equity / instrumentos
- Tabela Prisma `fin_currencies`
- Criar `FinModule` vazio ou controller sem consumidor (YAGNI — domínio puro testável sem Nest module até PP-49/PP-52)

## Business rules / invariants

- Todo Money no `fin` (e no contrato compartilhado) carrega `currency` do catálogo MVP.
- Currency fora do catálogo é rejeitada com erro claro (`FIN_CURRENCY_UNKNOWN`).
- `amountMinor` deve ser inteiro finito seguro (inteiro no range `Number.MIN_SAFE_INTEGER`…`Number.MAX_SAFE_INTEGER`); rejeitar float/NaN/Infinity (`FIN_MONEY_AMOUNT_INVALID`).
- Soma/subtração **somente** entre mesma `currency`; mismatch → `FIN_MONEY_CURRENCY_MISMATCH`.
- Scale é propriedade da currency no catálogo; Money não embute scale.
- **Documentado para PP-49 (não implementado aqui):** 1 conta = 1 moeda; `posting.money.currency === account.currency`; sem conversão automática.
- Sem moeda base / FX aggregation no MVP deste módulo.
- Equity fora do catálogo de moedas.

## Technical contracts

### Approach (chosen)

**Shared contract types + API domain catalog/helpers** (sem HTTP).

Rejected:
- **Tabela `fin_currencies`** — ticket fecha constante versionada no MVP.
- **Endpoint de listagem neste ticket** — adiado a PP-52; domínio + tipos bastam para PP-49.
- **Manter `Money.amount` major-units string e só adicionar helpers** — contradiz aceite (`amountMinor`) e dual-representation cria drift.
- **Catálogo só em `packages/contracts` com runtime pesado** — package é types-first; metadata runtime + aritmética ficam no domain da API; contracts exportam union + definition **types** (+ opcional `as const` dos codes se necessário ao typecheck).

### Backend/API (domain)

Paths (âncoras):

| Path | Responsabilidade |
|---|---|
| `packages/contracts/src/money.ts` | `CurrencyCode` (union fechada), `CurrencyKind`, `CurrencyDefinition`, `Money` |
| `packages/contracts/src/debts.ts` | `DebtsPanelCurrencyTotals.principal`/`balance` → `number` (amountMinor), alinhado a Money |
| `packages/contracts/src/index.ts` | Re-exports |
| `apps/api/src/features/fin/domain/currency/currency-catalog.ts` | Constante `FIN_CURRENCY_CATALOG` / lookup por code |
| `apps/api/src/features/fin/domain/currency/money.ts` | `createMoney`, `parseMajorToMoney`, `formatMoney`, `addMoney`, `subtractMoney` |
| `apps/api/src/features/fin/domain/currency/money-errors.ts` | Erros de domínio com `code` / `message` / `fields` |
| Specs co-localizados `*.spec.ts` | Vitest unitário do catálogo e aritmética |

**Shapes (contracts):**

```ts
export type CurrencyCode = 'BRL' | 'USD' | 'EUR' | 'USDC' | 'USDT' | 'BTC';
export type CurrencyKind = 'fiat' | 'stablecoin' | 'crypto';
export type CurrencyDefinition = {
  code: CurrencyCode;
  scale: number;
  symbol: string;
  kind: CurrencyKind;
};
export type Money = {
  amountMinor: number; // integer
  currency: CurrencyCode;
};
```

**Catálogo MVP (domain constant — values locked):**

| code | scale | symbol | kind |
|---|---:|---|---|
| BRL | 2 | R$ | fiat |
| USD | 2 | $ | fiat |
| EUR | 2 | € | fiat |
| USDC | 6 | USDC | stablecoin |
| USDT | 6 | USDT | stablecoin |
| BTC | 8 | ₿ | crypto |

**Erros de validação (shape exato — alinhado a `ApiErrorBody`):**

| Situação | HTTP (quando mapeado) | `code` | `message` (EN, estável) | `fields` |
|---|---|---|---|---|
| currency não está no catálogo | 400 | `FIN_CURRENCY_UNKNOWN` | `Currency is not in the MVP catalog` | `{ currency: ['Unknown currency code'] }` |
| `amountMinor` não é inteiro finito seguro (create / resultado de aritmética) | 400 | `FIN_MONEY_AMOUNT_INVALID` | `Money amountMinor must be a safe integer` | `{ amountMinor: ['Must be a safe integer'] }` |
| major string inválida ou com casas demais vs scale | 400 | `FIN_MONEY_MAJOR_INVALID` | `Money major amount string is invalid for currency scale` | `{ amount: ['Invalid major amount for currency scale'] }` |
| add/sub com currencies diferentes | 400 | `FIN_MONEY_CURRENCY_MISMATCH` | `Money arithmetic requires the same currency` | `{ currency: ['Expected same currency on both operands'] }` |

Implementação: classe/erro de domínio (ex. `FinDomainError`) com esses campos; helpers **lançam** o erro. Mapeamento Nest (`HttpException`) pode ser trivial wrapper no helper boundary ou no futuro exception filter — **neste ticket** basta o objeto de erro serializável `{ code, message, fields }` testável sem controller. Se um helper for chamado de código Nest já existente, preferir `BadRequestException` com o mesmo payload para o filter atual encaminhar `code`/`fields`.

**Helpers (assinaturas — nomes canônicos):**

- `getCurrency(code: string): CurrencyDefinition` — throw `FIN_CURRENCY_UNKNOWN` se fora
- `isCurrencyCode(value: string): value is CurrencyCode`
- `createMoney(amountMinor: number, currency: CurrencyCode): Money` — valida inteiro seguro + currency
- `parseMajorToMoney(major: string, currency: CurrencyCode): Money` — interpreta decimal major com scale da currency (regras abaixo)
- `formatMoney(money: Money): string` — major units string com **exatamente** `scale` casas (pad à direita; sem FX)
- `addMoney(a: Money, b: Money): Money` / `subtractMoney(a: Money, b: Money): Money` — same currency only; resultado deve ser safe integer

**Regras de `parseMajorToMoney` (locked):**

| Entrada major | Comportamento |
|---|---|
| Casas a menos que scale (ex. BRL `"10.5"` com scale 2) | **Aceitar** — pad à direita com zeros (`"10.5"` → `"10.50"` → `1050`) |
| Casas iguais ao scale (ex. BRL `"10.50"`) | **Aceitar** |
| Sem ponto decimal (ex. BRL `"10"`) | **Aceitar** — equivalente a major inteiro (`"10"` → `"10.00"` → `1000`) |
| Casas a mais que scale (ex. BRL `"10.501"`) | **Rejeitar** `FIN_MONEY_MAJOR_INVALID` — sem truncar nem arredondar |
| Inválida (`""`, `"abc"`, `"10.5.0"`, `"--"`, espaços `" 10.50 "`) | **Rejeitar** `FIN_MONEY_MAJOR_INVALID` — sem trim implícito |
| Sinal negativo (ex. `"-10.50"`) | **Aceitar** se o restante for válido — amountMinor negativo permitido |
| Leading `+` / notação científica / separador de milhar | **Rejeitar** `FIN_MONEY_MAJOR_INVALID` |

**Overflow em aritmética (locked):** se `a.amountMinor ± b.amountMinor` sair do range safe integer, lançar `FIN_MONEY_AMOUNT_INVALID` (mesmo code/fields da tabela). Não usar bigint neste ticket.

### Data/model/migrations

- N/A — sem Prisma / sem migration neste ticket.

### Frontend

- Sem UI nova. Atualizar fixtures `apps/web/src/lib/api-contracts/panels.ts` + `panels.test.ts` para `amountMinor` (ex. `10.50` BRL → `1050`) e `DebtsPanelCurrencyTotals` numéricos.

### Integrations/side effects

- N/A (sem HTTP, filas, e-mail).

### Security/privacy

- N/A — catálogo público/predefinido; sem PII. Auth/`baseCurrency` continua tipado como `CurrencyCode` (agora fechado ao MVP).

## Candidate files

- `packages/contracts/src/money.ts` — shape Money / CurrencyCode / CurrencyDefinition
- `packages/contracts/src/debts.ts` — totals amountMinor
- `packages/contracts/src/index.ts` — re-exports novos tipos
- `apps/web/src/lib/api-contracts/panels.ts` / `panels.test.ts` — fixtures
- `apps/api/src/features/fin/domain/currency/*` — catálogo + helpers + erros + specs
- `refs/monorepo-contracts.md` — Money amountMinor + catálogo fechado
- `refs/monorepo-fin-module.md` — apontar domain currency + invariante 1 conta = 1 moeda
- `Agents.md` — só se novo ref for criado (não esperado)

## Acceptance criteria

- [ ] Qualquer `Money` em `@packages/contracts` é `{ amountMinor: number; currency: CurrencyCode }` com `CurrencyCode` = união das 6 moedas MVP
- [ ] As 6 moedas estão versionadas no código de domínio com scale/symbol/kind corretos
- [ ] Currency inválida falha com `code: FIN_CURRENCY_UNKNOWN` e `fields.currency`
- [ ] Aritmética entre currencies diferentes falha com `code: FIN_MONEY_CURRENCY_MISMATCH`
- [ ] `amountMinor` não-inteiro ou overflow de aritmética falha com `code: FIN_MONEY_AMOUNT_INVALID`
- [ ] Major string com casas > scale ou inválida falha com `code: FIN_MONEY_MAJOR_INVALID`; casas < scale são aceitas via pad
- [ ] Fixtures web / `DebtsPanelCurrencyTotals` compilam e testam contra o novo shape
- [ ] Spec/refs documentam: sem moeda base; sem agregação FX; equity fora; invariante 1 conta = 1 moeda para PP-49; listagem HTTP adiada a PP-52
- [ ] Refs `monorepo-contracts.md` e `monorepo-fin-module.md` atualizados na mesma PR
- [ ] No out-of-scope behavior changed (sem endpoint, sem Prisma, sem ledger)

## Validation plan

Automated (scripts do monorepo):
- `pnpm --filter @packages/contracts typecheck`
- `pnpm --filter api test` — unit tests do catálogo/helpers (Vitest; nomes abaixo)
- `pnpm --filter web test` — fixtures panels
- `pnpm typecheck` na raiz (turbo) — breaking Money não deixa consumers quebrados
- Sem E2E Playwright: sem UI/rota nova; `test:e2e` N/A

Cenários principais de comportamento:
1. **Resolve currency conhecida** → retorna definition com scale correta (BRL=2, USDC=6, BTC=8)
2. **Resolve currency desconhecida** (`'XXX'`, `''`, lowercase `'brl'`) → `FIN_CURRENCY_UNKNOWN`
3. **createMoney válido** → Money tipado
4. **createMoney com float/NaN** → `FIN_MONEY_AMOUNT_INVALID`
5. **add/sub mesma currency** → amountMinor correto (incl. resultado negativo em sub)
6. **add/sub currencies diferentes** → `FIN_MONEY_CURRENCY_MISMATCH`
7. **parse/format round-trip** por scale (BRL `"10.50"` ↔ `1050`; USDC `"1.000000"` ↔ `1000000`; BTC `"0.00000001"` ↔ `1`)
8. **parse pad** — BRL `"10.5"` → `1050`; BRL `"10"` → `1000`
9. **parse rejeita excesso de casas** — BRL `"10.501"` → `FIN_MONEY_MAJOR_INVALID`
10. **parse rejeita inválidos** — `""`, `"abc"`, `"10.5.0"`, `" 10.50 "` → `FIN_MONEY_MAJOR_INVALID`
11. **add overflow** — operandos cuja soma > `Number.MAX_SAFE_INTEGER` → `FIN_MONEY_AMOUNT_INVALID`

Variações de entrada / bordas:
- amountMinor `0`, negativo, `Number.MAX_SAFE_INTEGER`
- major com casas a menos (pad), a mais (reject), iguais (ok)
- currency code com espaços / case errado
- add/sub no limite safe integer

Transições de estado: N/A (sem persistência/estado).

Invariantes de domínio cobertas por teste:
- catálogo tem exatamente as 6 moedas com scales locked
- aritmética nunca mistura currency
- Money sempre carrega currency do catálogo

Riscos → teste:
- scale errada BTC/USDC → tabela do catálogo assertada no spec
- fixture web esquecida → `pnpm --filter web test` + root typecheck
- erro sem `fields` → asserts no objeto de erro

Compatibilidade:
- Breaking vs PP-8 major-units: **intencional**; atualizar consumers no mesmo PR; docs/PP-8 histórico não precisa rewrite (ref viva sim)

Manual/smoke: N/A (sem HTTP). Opcional: typecheck local após checkout.

Regression: health/readiness e exception filter inalterados; `ApiErrorBody` shape intacto.

### Sufficiency rationale

Classificação Complex por money + breaking contract. Cobertura unitária dos 7 cenários + bordas de scale cobre os modos de falha que o ledger herdaria; typecheck cross-app pega drift de fixture. HTTP/E2E não agregam sem endpoint. Invariante 1 conta = 1 moeda fica **documentada** (não testável aqui sem contas).

## Refs afetadas / verdade viva

- `refs/monorepo-contracts.md` — Money → `amountMinor`; `CurrencyCode` fechado ao MVP (não mais ISO 4217 aberto); mencionar `CurrencyDefinition` / `CurrencyKind`; ajustar nota de `DebtsPanelCurrencyTotals` para amountMinor
- `refs/monorepo-fin-module.md` — domain path `features/fin/domain/currency`; invariante 1 conta = 1 moeda (para PP-49); confirmar Money shared em `money.ts`; caveat “não há fin domain” se existir → remover quando o código entrar

## Risks, assumptions, and open decisions

Risks:
- Breaking `Money` quebra qualquer consumer não atualizado → mitigação: root `pnpm typecheck` + fixtures no mesmo PR
- `number` para amountMinor vs `bigint` — BTC em sats cabe em safe integer para saldos pessoais MVP; mitigação: validar safe integer; revisit se volume exigir bigint (fora deste ticket)
- Lowercase codes rejeitados — alinhado a catálogo uppercase; clientes devem normalizar na borda HTTP (PP-52/PP-49)

Assumptions:
- PP-52 fará `GET /v1/fin/currencies` consumindo o mesmo catálogo de domínio (ou re-export)
- Auth `baseCurrency` aceitar apenas as 6 moedas MVP a partir deste PR (type-level); runtime auth validation é ticket de auth futuro se ainda não existir

Open decisions (fechadas neste spec — não reabrir no plan sem mudança de produto):
- Listagem HTTP: **adiada a PP-52**
- Path da constante: **domain API** (`features/fin/domain/currency/…`); types em contracts
- Erros: códigos `FIN_*` e `fields` acima

## v2 — resposta ao review

- **Bloqueador parse major↔minor:** regras locked (pad casas a menos; reject casas a mais / inválidos; sem trim); novo `FIN_MONEY_MAJOR_INVALID`; cenários 8–10 + aceite correspondente.
- **Naming:** unificado para `parseMajorToMoney` (tabela de paths + assinaturas).
- **Overflow add/sub:** locked — resultado fora de safe integer → `FIN_MONEY_AMOUNT_INVALID` (cenário 11).
