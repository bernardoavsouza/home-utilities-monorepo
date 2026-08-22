import { toSnakeCase } from '@/shared/infrastructure/prisma/to-snake-case';

describe('toSnakeCase', () => {
  it('converts camelCase and PascalCase to snake_case', () => {
    expect(toSnakeCase('createdAt')).toBe('created_at');
    expect(toSnakeCase('User')).toBe('user');
    expect(toSnakeCase('OrderItem')).toBe('order_item');
    expect(toSnakeCase('HTTPRequest')).toBe('http_request');
  });

  it('leaves snake_case and single tokens unchanged', () => {
    expect(toSnakeCase('id')).toBe('id');
    expect(toSnakeCase('created_at')).toBe('created_at');
  });
});
