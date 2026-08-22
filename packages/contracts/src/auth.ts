import type { CurrencyCode } from './money.js';

export type AuthSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  baseCurrency: CurrencyCode;
};

export type AuthSessionResponse =
  | {
      authenticated: true;
      user: AuthSessionUser;
    }
  | {
      authenticated: false;
      user: null;
    };

export type LoginRequest = {
  email: string;
  password: string;
};

export type SignupRequest = {
  email: string;
  password: string;
  displayName?: string;
  baseCurrency: CurrencyCode;
};

export type LogoutResponse = {
  ok: true;
};
