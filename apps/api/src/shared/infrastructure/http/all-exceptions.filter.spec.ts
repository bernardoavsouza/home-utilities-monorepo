import type { ApiErrorBody } from '@packages/contracts';
import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';

function createHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({
        requestId: 'test-request-id',
        method: 'GET',
        url: '/v1/probe',
      }),
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('AllExceptionsFilter', () => {
  it('omits code and fields when the exception payload lacks them', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();

    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), host);

    expect(response.status).toHaveBeenCalledWith(404);
    const body = response.json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Not Found');
    expect(body.code).toBeUndefined();
    expect(body.fields).toBeUndefined();
  });

  it('forwards string code and fields when present', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();

    filter.catch(
      new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          fields: { email: ['required'] },
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    const body = response.json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fields: { email: ['required'] },
    });
  });

  it('omits malformed code and fields instead of crashing', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();

    filter.catch(
      new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad payload',
          code: 123,
          fields: 'nope',
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    const body = response.json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Bad payload');
    expect(body.code).toBeUndefined();
    expect(body.fields).toBeUndefined();
  });

  it('omits empty fields objects', () => {
    const filter = new AllExceptionsFilter();
    const { host, response } = createHost();

    filter.catch(
      new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad payload',
          fields: {},
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    const body = response.json.mock.calls[0]?.[0] as ApiErrorBody;
    expect(body.fields).toBeUndefined();
  });
});
