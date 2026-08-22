import type { ApiErrorBody } from '@packages/contracts';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthModule } from '@/features/health/health.module';
import { createTestApp } from '@/shared/infrastructure/http/create-test-app';

describe('Observability HTTP', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    app = await createTestApp(HealthModule);
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('x-request-id', () => {
    it('generates a request id when header is missing', async () => {
      const response = await request(server).get('/v1/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
      const requestId = response.headers['x-request-id'];
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('echoes client x-request-id', async () => {
      const response = await request(server)
        .get('/v1/health')
        .set('x-request-id', 'my-trace-1')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
      expect(response.headers['x-request-id']).toBe('my-trace-1');
    });

    it('replaces a client id that is not id-shaped', async () => {
      const response = await request(server)
        .get('/v1/health')
        .set('x-request-id', 'trace with spaces')
        .expect(200);

      expect(response.headers['x-request-id']).not.toBe('trace with spaces');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('replaces an oversized client id', async () => {
      const response = await request(server)
        .get('/v1/health')
        .set('x-request-id', 'a'.repeat(4096))
        .expect(200);

      expect(response.headers['x-request-id']).toHaveLength(36);
    });
  });

  describe('exception filter', () => {
    it('returns ApiErrorBody JSON and x-request-id for unknown routes', async () => {
      const response = await request(server)
        .get('/v1/no-such-route')
        .set('x-request-id', 'err-trace-1')
        .expect(404);

      expect(response.headers['x-request-id']).toBe('err-trace-1');
      const body = response.body as ApiErrorBody;
      expect(body.statusCode).toBe(404);
      expect(
        typeof body.message === 'string' || Array.isArray(body.message),
      ).toBe(true);
    });
  });
});
