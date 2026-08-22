import type {
  AssignCategoryRequest,
  AssignCategoryResponse,
  AuthSessionResponse,
  BudgetHomeResponse,
  BudgetTransaction,
  CreateDebtRequest,
  CreateIncomeRequest,
  CreateTransactionRequest,
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

export const exampleMoney = {
  amount: '10.50',
  currency: 'BRL',
} satisfies Money;

export const exampleAuthSession = {
  authenticated: true,
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'dev@example.com',
    displayName: 'Dev',
    baseCurrency: 'BRL',
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
  baseCurrency: 'BRL',
} satisfies SignupRequest;

export const exampleLogoutResponse = {
  ok: true,
} satisfies LogoutResponse;

const zero = { amount: '0.00', currency: 'BRL' } satisfies Money;

export const exampleBudgetHome = {
  month: '2026-08',
  currency: 'BRL',
  readyToAssign: { amount: '100.00', currency: 'BRL' },
  totals: {
    income: { amount: '500.00', currency: 'BRL' },
    assigned: { amount: '400.00', currency: 'BRL' },
    spent: { amount: '120.00', currency: 'BRL' },
    available: { amount: '280.00', currency: 'BRL' },
    overspent: zero,
  },
  groups: [
    {
      id: 'group-1',
      name: 'Essentials',
      categories: [
        {
          id: 'cat-1',
          name: 'Groceries',
          assigned: { amount: '400.00', currency: 'BRL' },
          spent: { amount: '120.00', currency: 'BRL' },
          available: { amount: '280.00', currency: 'BRL' },
          overspent: false,
        },
      ],
    },
  ],
} satisfies BudgetHomeResponse;

export const exampleAssignRequest = {
  month: '2026-08',
  categoryId: 'cat-1',
  amount: { amount: '50.00', currency: 'BRL' },
} satisfies AssignCategoryRequest;

export const exampleAssignResponse = {
  category: exampleBudgetHome.groups[0]!.categories[0]!,
  readyToAssign: { amount: '50.00', currency: 'BRL' },
} satisfies AssignCategoryResponse;

export const exampleMoveMoneyRequest = {
  month: '2026-08',
  fromCategoryId: 'cat-1',
  toCategoryId: 'cat-2',
  amount: { amount: '20.00', currency: 'BRL' },
} satisfies MoveMoneyRequest;

export const exampleMoveMoneyResponse = {
  from: exampleBudgetHome.groups[0]!.categories[0]!,
  to: {
    id: 'cat-2',
    name: 'Transport',
    assigned: { amount: '20.00', currency: 'BRL' },
    spent: zero,
    available: { amount: '20.00', currency: 'BRL' },
    overspent: false,
  },
  readyToAssign: { amount: '50.00', currency: 'BRL' },
} satisfies MoveMoneyResponse;

export const exampleCreateIncome = {
  month: '2026-08',
  note: 'Salary',
  amount: { amount: '500.00', currency: 'BRL' },
  occurredOn: '2026-08-01',
} satisfies CreateIncomeRequest;

export const exampleIncomeList = {
  month: '2026-08',
  items: [
    {
      id: 'inc-1',
      month: '2026-08',
      note: 'Salary',
      amount: { amount: '500.00', currency: 'BRL' },
      occurredOn: '2026-08-01',
    },
  ],
  total: { amount: '500.00', currency: 'BRL' },
} satisfies IncomeListResponse;

export const exampleCreateTransaction = {
  month: '2026-08',
  categoryId: 'cat-1',
  note: 'Market',
  amount: { amount: '40.00', currency: 'BRL' },
  occurredOn: '2026-08-10',
} satisfies CreateTransactionRequest;

export const exampleTransaction = {
  id: 'txn-1',
  month: '2026-08',
  categoryId: 'cat-1',
  note: 'Market',
  amount: { amount: '40.00', currency: 'BRL' },
  occurredOn: '2026-08-10',
  postingId: 'post-1',
} satisfies BudgetTransaction;

export const exampleTransactionList = {
  month: '2026-08',
  items: [exampleTransaction],
  total: { amount: '40.00', currency: 'BRL' },
} satisfies TransactionListResponse;

export const exampleDeleteTransaction = {
  id: 'txn-1',
  reversedPostingId: 'post-2',
} satisfies DeleteTransactionResponse;

export const exampleDebtsPanel = {
  currency: 'BRL',
  totals: {
    principal: { amount: '1000.00', currency: 'BRL' },
    balance: { amount: '750.00', currency: 'BRL' },
  },
  debts: [
    {
      id: 'debt-1',
      name: 'Card',
      status: 'active',
      principal: { amount: '1000.00', currency: 'BRL' },
      balance: { amount: '750.00', currency: 'BRL' },
    },
  ],
} satisfies DebtsPanelResponse;

export const exampleCreateDebt = {
  name: 'Card',
  principal: { amount: '1000.00', currency: 'BRL' },
  balance: { amount: '1000.00', currency: 'BRL' },
} satisfies CreateDebtRequest;

export const exampleRegisterDebtPayment = {
  amount: { amount: '50.00', currency: 'BRL' },
  occurredOn: '2026-08-15',
  note: 'Extra payment',
} satisfies RegisterDebtPaymentRequest;

export const exampleRegisterDebtPaymentResponse = {
  debt: {
    id: 'debt-1',
    name: 'Card',
    status: 'active',
    principal: { amount: '1000.00', currency: 'BRL' },
    balance: { amount: '700.00', currency: 'BRL' },
    notes: null,
    openedOn: '2026-01-01',
    dueOn: null,
  },
  postingId: 'post-debt-1',
} satisfies RegisterDebtPaymentResponse;

export const exampleProjection = {
  currency: 'BRL',
  horizonMonths: 3,
  assumptions: {
    includeBudgetAssigned: true,
    includeDebts: true,
    note: 'MVP simple recurrence',
  },
  points: [
    {
      month: '2026-09',
      income: { amount: '500.00', currency: 'BRL' },
      expenses: { amount: '400.00', currency: 'BRL' },
      debtPayments: { amount: '50.00', currency: 'BRL' },
      net: { amount: '50.00', currency: 'BRL' },
      projectedBalance: { amount: '50.00', currency: 'BRL' },
    },
  ],
} satisfies ProjectionResponse;

export const exampleDashboard = {
  month: '2026-08',
  currency: 'BRL',
  income: { amount: '500.00', currency: 'BRL' },
  assigned: { amount: '400.00', currency: 'BRL' },
  spent: { amount: '120.00', currency: 'BRL' },
  readyToAssign: { amount: '100.00', currency: 'BRL' },
  overspent: false,
  byGroup: [
    {
      groupId: 'group-1',
      name: 'Essentials',
      assigned: { amount: '400.00', currency: 'BRL' },
      spent: { amount: '120.00', currency: 'BRL' },
    },
  ],
} satisfies DashboardResponse;
