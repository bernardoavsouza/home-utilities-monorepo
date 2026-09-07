---
contract: cienty-spec-v1
ticket: PP-49
title: "[Fin][Domain] Ledger: contas, lançamentos balanceados e saldos derivados"
repo: home-utilities-monorepo
status: ready
owner: unknown
created_at: 2026-09-07T14:57:28Z
updated_at: 2026-09-07T15:00:52Z
base: origin/main @ 2026-09-07
parent: PP-48
follow_ups: [PP-50, PP-51, PP-52, PP-53]
siblings: [PP-5]
approved_by: "spec-plan-reviewer 2026-09-07 (iter 1)"
spec_mode: standard
source_links:
  - Jira PP-49
  - refs/monorepo-fin-module.md
  - apps/api/refs/api-architecture.md
  - apps/api/refs/api-persistence.md
---

# PP-49 — [Fin][Domain] Ledger: contas, lançamentos balanceados e saldos derivados

## Context

A fonte de verdade do que **aconteceu** no módulo `fin` é o ledger de partidas dobradas. O budgeting mensal precisa dos quatro eixos (deve entrar / entrou / deve sair / saiu), mas **planned vive no budget (PP-51)** — o ledger registra só a realidade (entrou / saiu) + transfers (ex.: pagar cartão) + câmbio explícito entre moedas.

Dor de produto: no EveryDollar, gastar no cartão e depois pagar o cartão não fechava em soma zero. Com passivo de cartão + entries balanceadas, o saldo do cartão prova se tudo foi trackeado.

**Baseline verificado em `origin/main` @ `8a0acfe` (PP-48 merge):**

| Área | Estado atual |
|---|---|
| Prisma `schema.prisma` | Só generator + datasource — **nenhum model de domínio** (`apps/api/prisma/schema.prisma`) |
| Migration init | Vazia (`apps/api/prisma/migrations/20260807165354_init/migration.sql`) |
| Money / currency | `packages/contracts/src/money.ts` — `Money = { amountMinor; currency }`, `CurrencyCode` fechado (BRL/USD/EUR/USDC/USDT/BTC/DEPIX) |
| Domain currency | `apps/api/src/modules/financial/domain/currency/` — catalog + helpers + `FinDomainError` |
| Nest product module | `modules/financial` **domain-only**; `FinancialModule` **não wired** (`apps/api/refs/api-architecture.md`) |
| Auth / User | **Ausente** — sem model `User`, sem FK possível |
| Fin panel contracts | **Ausentes** (`refs/monorepo-contracts.md`) |
| Path legacy note | `refs/monorepo-fin-module.md` ainda cita `features/fin/` em trechos; código vivo está em `modules/financial` |

Gap: sem `fin_accounts` / journal entries+lines, sem comandos de postagem, sem saldo derivado — PP-50/51/52 não têm ledger para consumir.

## Objective

Modelar e implementar o **ledger `fin_*`** (contas tipadas + journal entries/lines modelo A) com balanceamento **por moeda**, ownership por user, câmbio cross-currency sem FX de mercado, e **saldos/histórico só derivados das lines**, de forma que os acceptance criteria do ticket passem via domínio + persistência testáveis.

Unidade operacional: a **journal entry balanceada** (N lines ≥ 2) sobre contas do user.

## Task classification

- Classification: `Critical`
- Rationale:
  - Semântica de dinheiro / double-entry — erro silencioso corrompe saldos e todo o fin downstream
  - Persistência + migration (primeiros models `fin_*` no schema)
  - Múltiplos ramos de comportamento (expense/income/transfer/pay liability/exchange+fee/split/opening/reversal) e rejeições de balanceamento
  - Invariantes contábeis por currency; risco de regressão silenciosa se saldo paralelo for introduzido

## Decisões alinhadas (locked with the user)

1. Persistência **modelo A**: `fin_journal_entries` + `fin_journal_lines` (N pernas ≥ 2) — **não** row achatada debit/credit.
2. Line shape: `side: debit | credit` + `amountMinor ≥ 0` (nunca amount com sinal na line).
3. Balanceamento: `SUM(debits) = SUM(credits)` **para cada currency** presente nas lines; entry desbalanceada em qualquer moeda é rejeitada.
4. Sem `categoryId` neste ticket (PP-50).
5. Cross-currency via contas Câmbio de sistema; user informa `fromMoney` + `toMoney` explícitos; sem API de cotação; taxa implícita = from/to.
6. Fee de câmbio = line(s) extras em Despesas (mesma moeda da origem em geral), na **mesma** entry; amounts do extrato são a verdade.
7. Naming `fin_*` / Prisma `Fin*` / domain sob `modules/financial` (código vivo PP-48); planned fora do ledger (PP-51).
8. Ledger = realidade; budget = plano.

## Scope

In scope:
- Prisma models/enums + migration: `fin_accounts`, `fin_journal_entries`, `fin_journal_lines` (+ enums `fin_account_type`, `fin_journal_side`, `fin_system_account_kind`)
- Domain: criação de contas user-facing (asset/liability), ensure de contas de sistema por currency, postagem via comandos, balance check, saldo derivado, estorno por entry reversa
- Application services + Prisma repository (Nest providers sob `modules/financial`) — superfície programática testável
- Extensão de `FinDomainError` / códigos `FIN_*` para ledger
- Specs Vitest: unit (balance rules) + integration (Prisma `app_test`) cobrindo os AC
- Atualizar refs vivas (`monorepo-fin-module.md`, `api-persistence.md`, `api-architecture.md`, e nova `apps/api/refs/api-financial-ledger.md` se as regras do ledger forem materialmente novas)

Out of scope:
- Planned / assign (PP-51)
- `categoryId` / agregação por categoria (PP-50)
- Modelo B (row achatada)
- FX automático / cotação de mercado
- UI completa do painel / painel de dívidas (juros/parcelas)
- Projeção, import bancário
- Auth HTTP / model `User` com FK (userId opaco até auth)
- Controllers HTTP do ledger (painel/API HTTP = PP-52+); este ticket entrega domínio + persistência + application services
- Contratos de painel em `@packages/contracts/src/fin/` (voltam com o endpoint)

## Business rules / invariants

- **1 conta = 1 moeda** (`account.currency` do catálogo MVP); line.currency efetiva = currency da conta; posting rejeita mismatch conta↔money.
- **Ownership:** toda conta e toda entry pertencem a um `userId` (UUID string opaco). Conta/entry de outro user é inacessível (not found / forbidden no application layer).
- **Tipos de conta:** `asset` | `liability` | `income` | `expense` | `equity`.
- **User-facing “minhas contas”:** apenas `asset` / `liability` com `isSystem = false`. Contas de sistema **não** aparecem como conta bancária.
- **Contas de sistema (por user × currency), `isSystem = true`:**

  | `systemKind` | `type` | Papel |
  |---|---|---|
  | `income` | `income` | Receitas — fecha receita same-currency |
  | `expense` | `expense` | Despesas — fecha gasto same-currency |
  | `exchange` | `equity` | Câmbio / trading — fecha cross-currency |
  | `opening_balance` | `equity` | Opening balance equity |

- **Seed/lazy create:** contas de sistema **não** são bootstrapadas para todas as moedas no cadastro do user. São criadas **on first need** daquela currency para o user (primeiro comando que precise de Receitas/Despesas/Câmbio/Opening da moeda). Idempotente (unique `(userId, systemKind, currency)`).
- **Entry:** ≥ 2 lines; cada line `side ∈ {debit, credit}` e `amountMinor` inteiro seguro **≥ 0**; rejeitar `< 2` lines, `amountMinor < 0`, currency fora do catálogo, conta inexistente / outro user / currency mismatch.
- **Balance por currency:** para cada currency C nas lines, `Σ amountMinor where side=debit ∧ currency(C) = Σ amountMinor where side=credit ∧ currency(C)`.
- **Saldos:** só derivados de `SUM` das lines — **nenhum** campo `balance` / cache paralelo na conta.
- **Convenção de saldo assinado por `account.type` (normal balance):**

  | type | signedBalance |
  |---|---|
  | `asset`, `expense` | `Σ debit − Σ credit` |
  | `liability`, `income`, `equity` | `Σ credit − Σ debit` |

  Saldo “positivo” = sentido normal do tipo (ativo com saldo a débito; passivo com saldo a crédito).
- **Imutabilidade:** após postada, entry/lines **não** são update/delete. Correção = **estorno** (`reverseEntry`) que cria nova entry com sides invertidos, `kind = reversal`, `reversesEntryId` apontando à original. Re-reverter a reversão é permitido (nova entry); não há flag `voided` obrigatória neste ticket — histórico = entries + links.
- **Sem planned** no ledger; sem `categoryId` nas lines.
- **Cartão de crédito** = `liability` user-facing. Compra: debit Expense + credit Liability. Pagamento: debit Liability + credit Asset. Soma zero no passivo quando 100% pago e trackeado.
- **Exchange:** mesma entry com lines nas duas contas user + contas Câmbio de cada moeda; fee opcional = line(s) Despesas + funding na moeda da fee (default = moeda de `fromMoney`). Fee **não** exige categoria neste ticket (PP-50); campo ausente.
- **Opening balance (neste ticket):** comando `postOpeningBalance` debita/credita a conta user e a contra-partida `opening_balance` equity da mesma currency, respeitando o sentido do tipo da conta (asset opening → debit asset / credit equity; liability opening → credit liability / debit equity).

## Technical contracts

### Approach (chosen)

**Domain + Prisma persistence + Nest application services** sob `modules/financial`, sem HTTP de painel.

Rejected:
- Modelo B (row achatada) — ticket rejeita.
- FX/rate table — ticket rejeita; user informa from/to.
- Bootstrap de todas as system accounts no “signup” — auth ainda não existe; lazy-on-currency-use é suficiente e evita lixo por moeda.
- Campo `balance` materializado — contradiz AC.
- Controllers `/v1/fin/...` neste ticket — UI/painel fora; application services cobrem AC (mesmo padrão PP-48: domínio primeiro; HTTP em ticket de painel).

### Data / Prisma (shapes exatos)

Enums (Prisma → Postgres via `@map` / `@@map`):

```prisma
enum FinAccountType {
  Asset     @map("asset")
  Liability @map("liability")
  Income    @map("income")
  Expense   @map("expense")
  Equity    @map("equity")
  @@map("fin_account_type")
}

enum FinJournalSide {
  Debit  @map("debit")
  Credit @map("credit")
  @@map("fin_journal_side")
}

enum FinSystemAccountKind {
  Income         @map("income")
  Expense        @map("expense")
  Exchange       @map("exchange")
  OpeningBalance @map("opening_balance")
  @@map("fin_system_account_kind")
}
```

Models:

```prisma
model FinAccount {
  id          String                 @id @default(uuid()) @db.Uuid
  userId      String                 @map("user_id") @db.Uuid
  name        String
  type        FinAccountType
  currency    String
  isSystem    Boolean                @default(false) @map("is_system")
  systemKind  FinSystemAccountKind?  @map("system_kind")
  createdAt   DateTime               @default(now()) @map("created_at")
  updatedAt   DateTime               @updatedAt @map("updated_at")
  lines       FinJournalLine[]

  @@unique([userId, systemKind, currency], map: "fin_accounts_user_system_currency_key")
  @@index([userId], map: "fin_accounts_user_id_idx")
  @@map("fin_accounts")
}

model FinJournalEntry {
  id              String           @id @default(uuid()) @db.Uuid
  userId          String           @map("user_id") @db.Uuid
  postedAt        DateTime         @map("posted_at")
  description     String?
  kind            String
  reversesEntryId String?          @map("reverses_entry_id") @db.Uuid
  createdAt       DateTime         @default(now()) @map("created_at")
  lines           FinJournalLine[]
  reversesEntry   FinJournalEntry? @relation("FinEntryReversal", fields: [reversesEntryId], references: [id])
  reversedBy      FinJournalEntry[] @relation("FinEntryReversal")

  @@index([userId, postedAt], map: "fin_journal_entries_user_posted_idx")
  @@map("fin_journal_entries")
}

model FinJournalLine {
  id          String             @id @default(uuid()) @db.Uuid
  entryId     String             @map("entry_id") @db.Uuid
  accountId   String             @map("account_id") @db.Uuid
  side        FinJournalSide
  amountMinor BigInt             @map("amount_minor")
  entry       FinJournalEntry    @relation(fields: [entryId], references: [id], onDelete: Restrict)
  account     FinAccount         @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@index([accountId], map: "fin_journal_lines_account_id_idx")
  @@index([entryId], map: "fin_journal_lines_entry_id_idx")
  @@map("fin_journal_lines")
}
```

Notas de persistência:
- `amountMinor` é `BigInt` no Postgres (Int32 estoura para BTC/saldos altos); na borda de domínio continua `number` safe-integer (Money PP-48) — repository converte `BigInt ↔ number` e rejeita fora de safe integer.
- `currency` na conta é `String` validada contra o catálogo no domínio (não enum Prisma — catálogo versionado no código).
- Unique parcial de sistema: Prisma `@@unique([userId, systemKind, currency])` — para contas user-facing `systemKind = null`; Postgres trata NULLs em unique como distintos (múltiplas user accounts OK). Application layer ainda impede `isSystem=true` sem `systemKind` e vice-versa.
- `kind` da entry é string de domínio (não enum Prisma neste ticket) com valores canônicos: `expense` | `income` | `transfer` | `pay_liability` | `exchange` | `split` | `opening_balance` | `reversal`.
- Sem coluna `categoryId`. Sem coluna `balance`.
- Migration nova versionada (não editar a init vazia além do necessário — preferir migration `…_fin_ledger`).

### Domain commands (application API — nomes canônicos)

Todos recebem `userId`. Todos os posts rodam numa **transação** Prisma: validate → ensure system accounts → insert entry+lines atomicamente.

| Command | Input essencial | Lines (resumo) |
|---|---|---|
| `createUserAccount` | `name`, `type: asset\|liability`, `currency` | — (só conta; rejeita income/expense/equity user-facing) |
| `listUserAccounts` | — | retorna asset/liability `isSystem=false` |
| `ensureSystemAccounts` | `currency` | cria income/expense/exchange/opening_balance se faltarem |
| `postExpense` | `fundingAccountId` (asset\|liability), `amountMinor`, `description?`, `postedAt?` | debit Expense(sys) + credit funding |
| `postIncome` | `destinationAccountId` (asset), `amountMinor`, … | debit asset + credit Income(sys) |
| `postTransfer` | `fromAccountId`, `toAccountId`, `amountMinor` (same currency) | debit to + credit from (ambos asset/liability user) |
| `postPayLiability` | `assetAccountId`, `liabilityAccountId`, `amountMinor` | debit liability + credit asset |
| `postSplitExpense` | `fundingAccountId`, `splits: { amountMinor }[]` (≥1), total = Σ splits | N× debit Expense + 1× credit funding |
| `postExchange` | `fromAccountId`, `toAccountId`, `fromMoney`, `toMoney`, `fee?: Money` | ver abaixo |
| `postOpeningBalance` | `accountId` (user asset\|liability), `amountMinor` (>0) | ver regra opening |
| `reverseEntry` | `entryId` | mirror sides; `kind=reversal`; `reversesEntryId` |
| `getAccountBalance` | `accountId` | signedBalance derivado |
| `getAccountLedger` | `accountId`, optional date range | lines ordenadas + running opcional em memória |

**`postExchange` shape (cravado):**

```ts
type PostExchangeInput = {
  userId: string;
  fromAccountId: string; // user asset/liability, currency A
  toAccountId: string;   // user asset/liability, currency B ≠ A
  fromMoney: Money;      // currency === fromAccount.currency, amountMinor > 0
  toMoney: Money;        // currency === toAccount.currency, amountMinor > 0
  fee?: Money;           // optional; currency must equal fromMoney.currency in MVP; amountMinor ≥ 0
  description?: string;
  postedAt?: Date;
};
```

Lines obrigatórias (fee ausente):
1. credit `fromAccount` `fromMoney.amountMinor`
2. debit `Exchange(A)` `fromMoney.amountMinor`
3. debit `toAccount` `toMoney.amountMinor`
4. credit `Exchange(B)` `toMoney.amountMinor`

Com `fee` (`amountMinor > 0`, currency = from):
5. debit `Expense(fromCurrency)` `fee.amountMinor`
6. credit `fromAccount` `fee.amountMinor`

Rejeitar: same currency from/to; fee em outra moeda que não `fromMoney.currency` (MVP); amountMinor ≤ 0 em from/to.

**Fee × PP-50:** fee **não** carrega `categoryId` agora; quando PP-50 adicionar categoria em lines income/expense, fee passará a aceitar categoria opcional/obrigatória conforme aquele ticket — documentado como follow-up, sem coluna hoje.

### Balance helper (domain puro)

`assertEntryBalanced(lines: { side; amountMinor; currency }[]): void` — agrupa por currency; throw `FIN_ENTRY_UNBALANCED` se qualquer moeda falhar.

`computeSignedBalance(type, debits, credits): number` — tabela de convenção acima.

### Errors (extensão `FinDomainError`)

| Situação | `code` | `fields` (exemplo) |
|---|---|---|
| entry desbalanceada em currency C | `FIN_ENTRY_UNBALANCED` | `{ entry: ['Debits and credits must match per currency'] }` |
| < 2 lines | `FIN_ENTRY_TOO_FEW_LINES` | `{ lines: ['At least 2 lines required'] }` |
| amountMinor < 0 na line | `FIN_LINE_AMOUNT_INVALID` | `{ amountMinor: ['Must be a non-negative safe integer'] }` |
| currency inválida / fora do catálogo | `FIN_CURRENCY_UNKNOWN` | (existente) |
| conta não encontrada / outro user | `FIN_ACCOUNT_NOT_FOUND` | `{ accountId: ['Account not found'] }` |
| tipo de conta inválido para o comando | `FIN_ACCOUNT_TYPE_INVALID` | `{ type: ['…'] }` |
| currency da money ≠ currency da conta | `FIN_ACCOUNT_CURRENCY_MISMATCH` | `{ currency: ['…'] }` |
| exchange same-currency / fee currency errada | `FIN_EXCHANGE_INVALID` | `{ exchange: ['…'] }` |
| tentativa de mutar entry postada | `FIN_ENTRY_IMMUTABLE` | `{ entryId: ['Posted entries cannot be modified'] }` |

HTTP status mapping fica para quando houver controller; neste ticket os erros são lançados como `FinDomainError` testáveis.

### Frontend

Not applicable — sem UI neste ticket.

### Integrations / side effects

Not applicable — sem filas, emails, FX APIs.

### Security / privacy

- `userId` opaco obrigatório em todo comando; sem auth middleware ainda — callers (testes / futuro controller) passam o id. Não há listagem cross-user.
- Sem PII além de `name` de conta escolhido pelo user.

## Candidate files

- `apps/api/prisma/schema.prisma` — models/enums ledger
- `apps/api/prisma/migrations/<ts>_fin_ledger/migration.sql` — migration
- `apps/api/src/modules/financial/domain/ledger/` — balance rules, types, errors extension
- `apps/api/src/modules/financial/domain/currency/money-errors.ts` — estender `FinErrorCode` (ou split `ledger-errors.ts` reusando `FinDomainError`)
- `apps/api/src/modules/financial/application/` — comandos / services
- `apps/api/src/modules/financial/infrastructure/` — Prisma repository
- `apps/api/src/modules/financial/financial.module.ts` — Nest wiring + import em `AppModule` quando providers existirem
- `apps/api/src/modules/financial/domain/ledger/*.spec.ts` — unit
- `apps/api/src/modules/financial/application/*.spec.ts` — integration com Prisma/`app_test`
- `refs/monorepo-fin-module.md` — path `modules/financial`, primeiros `fin_*` models, caveat “no fin Prisma model” → remover
- `apps/api/refs/api-persistence.md` — schema deixa de ser “no domain model”
- `apps/api/refs/api-architecture.md` — FinancialModule wired; ledger domain
- `apps/api/refs/api-financial-ledger.md` — **nova** ref de regras do ledger (routing em `apps/api/AGENTS.md`)
- `apps/api/AGENTS.md` — row na routing table para a nova ref
- `apps/api/refs/api-testing.md` — mencionar specs de ledger / DB

## Acceptance criteria

- [ ] Criar contas asset/liability e postar entries com ≥2 lines; cada line tem `side` + `amountMinor ≥ 0`
- [ ] Same-currency: gasto no cartão (liability) + pagar cartão fecha (saldo do passivo = 0 quando valores iguais)
- [ ] Split same-currency: N lines de despesa + 1 line asset/liability balanceia
- [ ] Exchange BRL→USD (ex.): from/to explícitos; entry balanceia **em BRL e em USD** via contas Câmbio; sem chamar API de cotação
- [ ] Exchange + fee em BRL: fee aparece como line(s) em Despesas e a entry continua balanceada por moeda
- [ ] Entry desbalanceada em qualquer currency / currency inválida / <2 lines / amountMinor < 0 é rejeitada
- [ ] Saldos só das lines; sem postagem planned; sem `categoryId` neste ticket
- [ ] Schema: `fin_journal_entries` + `fin_journal_lines` (+ `fin_accounts`)
- [ ] Opening balance e reverse entry funcionam conforme regras acima
- [ ] No out-of-scope behavior changed (health, money helpers PP-48, web UI)

## Validation plan

Automated (Vitest + Prisma `app_test`; scripts do monorepo):
- `pnpm --filter api test` — unit domain balance + integration application/repository
- `pnpm typecheck` (root) — após schema generate
- `pnpm db:migrate` localmente no worktree quando necessário para `app` + `app_test` (nunca prod)
- Snake_case gate continua verde no schema novo

**Cenários principais de comportamento:**
1. Create asset + liability accounts for user (BRL); reject income/expense as user-facing create
2. postExpense from checking (asset): Expense debit + asset credit; asset signedBalance diminui
3. Credit-card purchase: postExpense funding=liability; liability signedBalance aumenta; payLiability igual zera liability
4. postIncome into asset
5. postTransfer same-currency entre dois assets
6. postSplitExpense 3 splits + 1 funding — balanced
7. postExchange BRL→USD — balanced per currency via Exchange equity accounts
8. postExchange + fee BRL — expense lines + still balanced BRL & USD
9. postOpeningBalance on asset and on liability
10. reverseEntry espelha sides; saldos voltam
11. Reject unbalanced raw post / <2 lines / negative amountMinor / unknown currency / cross-user account

**Variações de entrada:** missing accounts; currency mismatch money↔account; exchange same currency; fee currency ≠ from; amountMinor 0 em from/to exchange; empty splits; transfer cross-currency (rejeitar — usar exchange).

**Bordas:** amountMinor = 0 em line intermediária (permitir só se comando não exigir >0; lines de fee 0 ≡ omitir fee); MAX_SAFE_INTEGER boundary na conversão BigInt; unique system account race (P2002 → treat as ensured).

**Transições de estado:** post → immutable; reverse cria nova entry; sem delete; ensureSystemAccounts idempotent.

**Invariantes de domínio:** balance per currency; 1 account = 1 currency; no parallel balance field; system accounts hidden from listUserAccounts; no categoryId column.

**Riscos cobertos por teste:**
- unbalanced entry aceita → assertEntryBalanced + integration reject
- credit-card math não fecha → scenario 3
- exchange só balanceia uma moeda → scenario 7/8
- saldo cache drift → schema sem balance + getAccountBalance só de lines
- Int32 overflow → BigInt column + safe-integer check

**Compatibilidade:** schema vazio hoje — migration additiva; Money PP-48 inalterado; health inalterado.

Manual/smoke: opcional via script de application service em teste; sem UI.

Regression: `modules/financial/domain/currency/*.spec.ts`, health HTTP specs, snake_case gate.

## Refs afetadas / verdade viva

- `refs/monorepo-fin-module.md` — alinhar path a `modules/financial`; remover “no fin Prisma model”; mencionar ledger tables
- `apps/api/refs/api-persistence.md` — schema agora tem domain models; fin_* examples reais
- `apps/api/refs/api-architecture.md` — FinancialModule wired quando providers existem; ledger layers
- `apps/api/refs/api-financial-ledger.md` — **criar** (regras de balance, system accounts, commands)
- `apps/api/AGENTS.md` — indexar a nova ref
- `apps/api/refs/api-testing.md` — ledger integration specs / DB usage

## Risks, assumptions, and open decisions

Risks:
- Unique `(userId, systemKind, currency)` com `systemKind` NULL em Postgres permite duplicatas user-facing (desejado) mas não enforce uniqueness de nome — aceitável no MVP; mitigação: testes de system ensure
- `BigInt` ↔ `number` na borda — mitigação: reject non-safe-integer
- Auth ausente — `userId` confiado ao caller; mitigação: documentado; auth ticket adiciona guard

Assumptions:
- UUID v4 strings para `userId` / ids (Prisma `@db.Uuid`)
- Nomes de system accounts fixos em pt-BR ou EN estáveis no código (`Receitas`, `Despesas`, `Câmbio`, `Saldo inicial` — ou EN `Income`/`Expense`/`Exchange`/`Opening balance`); **locked:** labels EN estáveis no domain (`Income`, `Expense`, `Exchange`, `Opening balance`) + currency code no name (`Income BRL`) para unicidade humana
- PP-52 fará HTTP read/write do ledger consumindo estes services

Open decisions (fechadas neste spec — não reabrir no plan sem mudança de produto):
1. **Tipo das contas Câmbio:** `equity` + `systemKind = exchange` + `isSystem = true` (não liability, não tipo dedicado).
2. **Seed:** lazy on first use of currency per user (não bootstrap all currencies).
3. **Exchange + fee shape:** conforme `PostExchangeInput` acima; fee sem categoria até PP-50.
4. **Comandos mínimos:** tabela de commands acima.
5. **Opening balance:** **entra neste ticket** via equity `opening_balance`.
6. **Imutabilidade:** void by reversing entry only.
7. **HTTP:** fora deste ticket (application services + tests satisfazem AC).
8. **amountMinor storage:** Postgres `BigInt`; domain `number` safe-integer.
