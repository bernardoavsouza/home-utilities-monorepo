export type ApiErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  fields?: Record<string, string[]>;
};
