import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from 'supertest/types';
import { HealthModule } from '@/features/health/health.module';
import { configureApp } from '@/shared/infrastructure/http/configure-app';
import { createTestApp } from '@/shared/infrastructure/http/create-test-app';
import { isSwaggerEnabled } from '@/shared/infrastructure/http/setup-swagger';

describe('isSwaggerEnabled', () => {
  it.each([
    { env: {}, expected: true },
    { env: { NODE_ENV: 'development' }, expected: true },
    { env: { NODE_ENV: 'test' }, expected: true },
    { env: { NODE_ENV: 'production' }, expected: false },
    {
      env: { NODE_ENV: 'production', SWAGGER_ENABLED: 'true' },
      expected: true,
    },
    {
      env: { NODE_ENV: 'development', SWAGGER_ENABLED: 'false' },
      expected: false,
    },
    { env: { SWAGGER_ENABLED: '' }, expected: true },
    {
      env: { NODE_ENV: 'production', SWAGGER_ENABLED: 'yes' },
      expected: false,
    },
  ])('$env → $expected', ({ env, expected }) => {
    expect(isSwaggerEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describe('Swagger HTTP', () => {
  let app: INestApplication;
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    swaggerEnabled: process.env.SWAGGER_ENABLED,
  };

  function restore(key: 'NODE_ENV' | 'SWAGGER_ENABLED', value?: string): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    restore('NODE_ENV', previous.nodeEnv);
    restore('SWAGGER_ENABLED', previous.swaggerEnabled);
  });

  describe('enabled', () => {
    it('GET /docs serves the OpenAPI UI', async () => {
      app = await createTestApp(HealthModule);
      const response = await request(app.getHttpServer() as App)
        .get('/docs')
        .redirects(1)
        .expect(200);
      expect(response.text).toContain('Swagger UI');
    });

    it('GET /docs-json includes GET /v1/health', async () => {
      app = await createTestApp(HealthModule);
      const response = await request(app.getHttpServer() as App)
        .get('/docs-json')
        .expect(200);
      const spec = response.body as {
        paths?: Record<string, { get?: unknown }>;
      };
      expect(spec.paths?.['/v1/health']?.get).toBeDefined();
    });
  });

  describe('disabled', () => {
    it('does not mount /docs or /docs-json when SWAGGER_ENABLED=false', async () => {
      process.env.SWAGGER_ENABLED = 'false';
      app = await createTestApp(HealthModule);
      const server = app.getHttpServer() as App;

      await request(server).get('/docs').expect(404);
      await request(server).get('/docs-json').expect(404);
    });

    it('is off by default in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SWAGGER_ENABLED;
      // PrismaClient eagerly loads apps/api/.env and can reintroduce SWAGGER_ENABLED.
      // Re-assert the production default after the testing module compiles.
      const moduleRef = await Test.createTestingModule({
        imports: [HealthModule],
      }).compile();
      process.env.NODE_ENV = 'production';
      delete process.env.SWAGGER_ENABLED;
      expect(isSwaggerEnabled()).toBe(false);
      app = moduleRef.createNestApplication();
      configureApp(app);
      await app.init();

      await request(app.getHttpServer() as App)
        .get('/docs-json')
        .expect(404);
    });
  });
});
