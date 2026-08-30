import type {
  AssignCategoryRequest,
  AssignCategoryResponse,
  AuthSessionResponse,
  BudgetHomeResponse,
  BudgetMonth,
  BudgetTransaction,
  CreateDebtRequest,
  CreateIncomeRequest,
  CreateTransactionRequest,
  CurrencyCode,
  DashboardResponse,
  DebtsPanelResponse,
  DeleteTransactionResponse,
  IncomeListResponse,
  LoginRequest,
  LogoutResponse,
  Money,
  MoveMoneyRequest,
  MoveMoneyResponse,
  ProjectionResponse,
  RegisterDebtPaymentRequest,
  RegisterDebtPaymentResponse,
  SignupRequest,
  TransactionListResponse,
} from '@packages/contracts';

const asCurrency = (code: CurrencyCode): CurrencyCode => code;
const asMonth = (value: string): BudgetMonth => value as BudgetMonth;
const money = (amountMinor: number, code: CurrencyCode = 'BRL'): Money => ({
  amountMinor,
  currency: asCurrency(code),
});

export const exampleMoney = money(1050);

export const exampleAuthSession = {
  authenticated: true,
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'dev@example.com',
    displayName: 'Dev',
    baseCurrency: asCurrency('BRL'),
  },
} satisfies AuthSessionResponse;

export const exampleUnauthenticatedSession = {
  authenticated: false,
  user: null,
} satisfies AuthSessionResponse;

export const exampleLoginRequest = {
  email: 'dev@example.com',
  password: 'secret',
} satisfies LoginRequest;

export const exampleSignupRequest = {
  email: 'dev@example.com',
  password: 'secret',
  displayName: 'Dev',
  baseCurrency: asCurrency('BRL'),
} satisfies SignupRequest;

export const exampleLogoutResponse = {
  ok: true,
} satisfies LogoutResponse;

const zero = money(0);
const month = asMonth('2026-08');

export const exampleBudgetHome = {
  month,
  currency: asCurrency('BRL'),
  readyToAssign: money(10_000),
  totals: {
    income: money(50_000),
    assigned: money(40_000),
    spent: money(12_000),
    available: money(28_000),
    overspentAmount: zero,
  },
  groups: [
    {
      id: 'group-1',
      name: 'Essentials',
      categories: [
        {
          id: 'cat-1',
          name: 'Groceries',
          assigned: money(40_000),
          spent: money(12_000),
          available: money(28_000),
          overspent: false,
        },
      ],
    },
  ],
} satisfies BudgetHomeResponse;

export const exampleAssignRequest = {
  month,
  categoryId: 'cat-1',
  amount: money(5_000),
} satisfies AssignCategoryRequest;

export const exampleAssignResponse = {
  category: exampleBudgetHome.groups[0]!.categories[0]!,
  readyToAssign: money(5_000),
} satisfies AssignCategoryResponse;

export const exampleMoveMoneyRequest = {
  month,
  fromCategoryId: 'cat-1',
  toCategoryId: 'cat-2',
  amount: money(2_000),
} satisfies MoveMoneyRequest;

export const exampleMoveMoneyResponse = {
  from: exampleBudgetHome.groups[0]!.categories[0]!,
  to: {
    id: 'cat-2',
    name: 'Transport',
    assigned: money(2_000),
    spent: zero,
    available: money(2_000),
    overspent: false,
  },
  readyToAssign: money(5_000),
} satisfies MoveMoneyResponse;

export const exampleCreateIncome = {
  month,
  note: 'Salary',
  amount: money(50_000),
  occurredOn: '2026-08-01',
} satisfies CreateIncomeRequest;

export const exampleIncomeList = {
  month,
  items: [
    {
      id: 'inc-1',
      month,
      note: 'Salary',
      amount: money(50_000),
      occurredOn: '2026-08-01',
    },
  ],
  total: money(50_000),
} satisfies IncomeListResponse;

export const exampleCreateTransaction = {
  month,
  categoryId: 'cat-1',
  note: 'Market',
  amount: money(4_000),
  occurredOn: '2026-08-10',
} satisfies CreateTransactionRequest;

export const exampleTransaction = {
  id: 'txn-1',
  month,
  categoryId: 'cat-1',
  note: 'Market',
  amount: money(4_000),
  occurredOn: '2026-08-10',
  postingId: 'post-1',
} satisfies BudgetTransaction;

export const exampleTransactionList = {
  month,
  items: [exampleTransaction],
  total: money(4_000),
} satisfies TransactionListResponse;

export const exampleDeleteTransaction = {
  id: 'txn-1',
  reversedPostingId: 'post-2',
} satisfies DeleteTransactionResponse;

export const exampleDebtsPanel = {
  totalsByCurrency: [
    {
      currency: asCurrency('BRL'),
      principal: 100_000,
      balance: 75_000,
    },
  ],
  debts: [
    {
      id: 'debt-1',
      name: 'Card',
      status: 'active',
      principal: money(100_000),
      balance: money(75_000),
    },
  ],
} satisfies DebtsPanelResponse;

export const exampleCreateDebt = {
  name: 'Card',
  principal: money(100_000),
  balance: money(100_000),
} satisfies CreateDebtRequest;

export const exampleRegisterDebtPayment = {
  amount: money(5_000),
  occurredOn: '2026-08-15',
  note: 'Extra payment',
} satisfies RegisterDebtPaymentRequest;

export const exampleRegisterDebtPaymentResponse = {
  debt: {
    id: 'debt-1',
    name: 'Card',
    status: 'active',
    principal: money(100_000),
    balance: money(70_000),
    notes: null,
    openedOn: '2026-01-01',
    dueOn: null,
  },
  postingId: 'post-debt-1',
} satisfies RegisterDebtPaymentResponse;

export const exampleProjection = {
  currency: asCurrency('BRL'),
  horizonMonths: 3,
  assumptions: {
    includeBudgetAssigned: true,
    includeDebts: true,
    note: 'MVP simple recurrence',
  },
  points: [
    {
      month: asMonth('2026-09'),
      income: money(50_000),
      expenses: money(40_000),
      debtPayments: money(5_000),
      net: money(5_000),
      projectedBalance: money(5_000),
    },
  ],
} satisfies ProjectionResponse;

export const exampleDashboard = {
  month,
  currency: asCurrency('BRL'),
  income: money(50_000),
  assigned: money(40_000),
  spent: money(12_000),
  readyToAssign: money(10_000),
  overspent: false,
  byGroup: [
    {
      groupId: 'group-1',
      name: 'Essentials',
      assigned: money(40_000),
      spent: money(12_000),
    },
  ],
} satisfies DashboardResponse;
