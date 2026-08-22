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

const asCurrency = (code: string): CurrencyCode => code as CurrencyCode;
const asMonth = (value: string): BudgetMonth => value as BudgetMonth;
const money = (amount: string, code = 'BRL'): Money => ({
  amount,
  currency: asCurrency(code),
});

export const exampleMoney = money('10.50');

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

const zero = money('0.00');
const month = asMonth('2026-08');

export const exampleBudgetHome = {
  month,
  currency: asCurrency('BRL'),
  readyToAssign: money('100.00'),
  totals: {
    income: money('500.00'),
    assigned: money('400.00'),
    spent: money('120.00'),
    available: money('280.00'),
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
          assigned: money('400.00'),
          spent: money('120.00'),
          available: money('280.00'),
          overspent: false,
        },
      ],
    },
  ],
} satisfies BudgetHomeResponse;

export const exampleAssignRequest = {
  month,
  categoryId: 'cat-1',
  amount: money('50.00'),
} satisfies AssignCategoryRequest;

export const exampleAssignResponse = {
  category: exampleBudgetHome.groups[0]!.categories[0]!,
  readyToAssign: money('50.00'),
} satisfies AssignCategoryResponse;

export const exampleMoveMoneyRequest = {
  month,
  fromCategoryId: 'cat-1',
  toCategoryId: 'cat-2',
  amount: money('20.00'),
} satisfies MoveMoneyRequest;

export const exampleMoveMoneyResponse = {
  from: exampleBudgetHome.groups[0]!.categories[0]!,
  to: {
    id: 'cat-2',
    name: 'Transport',
    assigned: money('20.00'),
    spent: zero,
    available: money('20.00'),
    overspent: false,
  },
  readyToAssign: money('50.00'),
} satisfies MoveMoneyResponse;

export const exampleCreateIncome = {
  month,
  note: 'Salary',
  amount: money('500.00'),
  occurredOn: '2026-08-01',
} satisfies CreateIncomeRequest;

export const exampleIncomeList = {
  month,
  items: [
    {
      id: 'inc-1',
      month,
      note: 'Salary',
      amount: money('500.00'),
      occurredOn: '2026-08-01',
    },
  ],
  total: money('500.00'),
} satisfies IncomeListResponse;

export const exampleCreateTransaction = {
  month,
  categoryId: 'cat-1',
  note: 'Market',
  amount: money('40.00'),
  occurredOn: '2026-08-10',
} satisfies CreateTransactionRequest;

export const exampleTransaction = {
  id: 'txn-1',
  month,
  categoryId: 'cat-1',
  note: 'Market',
  amount: money('40.00'),
  occurredOn: '2026-08-10',
  postingId: 'post-1',
} satisfies BudgetTransaction;

export const exampleTransactionList = {
  month,
  items: [exampleTransaction],
  total: money('40.00'),
} satisfies TransactionListResponse;

export const exampleDeleteTransaction = {
  id: 'txn-1',
  reversedPostingId: 'post-2',
} satisfies DeleteTransactionResponse;

export const exampleDebtsPanel = {
  totalsByCurrency: [
    {
      currency: asCurrency('BRL'),
      principal: '1000.00',
      balance: '750.00',
    },
  ],
  debts: [
    {
      id: 'debt-1',
      name: 'Card',
      status: 'active',
      principal: money('1000.00'),
      balance: money('750.00'),
    },
  ],
} satisfies DebtsPanelResponse;

export const exampleCreateDebt = {
  name: 'Card',
  principal: money('1000.00'),
  balance: money('1000.00'),
} satisfies CreateDebtRequest;

export const exampleRegisterDebtPayment = {
  amount: money('50.00'),
  occurredOn: '2026-08-15',
  note: 'Extra payment',
} satisfies RegisterDebtPaymentRequest;

export const exampleRegisterDebtPaymentResponse = {
  debt: {
    id: 'debt-1',
    name: 'Card',
    status: 'active',
    principal: money('1000.00'),
    balance: money('700.00'),
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
      income: money('500.00'),
      expenses: money('400.00'),
      debtPayments: money('50.00'),
      net: money('50.00'),
      projectedBalance: money('50.00'),
    },
  ],
} satisfies ProjectionResponse;

export const exampleDashboard = {
  month,
  currency: asCurrency('BRL'),
  income: money('500.00'),
  assigned: money('400.00'),
  spent: money('120.00'),
  readyToAssign: money('100.00'),
  overspent: false,
  byGroup: [
    {
      groupId: 'group-1',
      name: 'Essentials',
      assigned: money('400.00'),
      spent: money('120.00'),
    },
  ],
} satisfies DashboardResponse;
