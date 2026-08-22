import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from 'supertest/types';
import { createTestApp } from '@/shared/infrastructure/http/create-test-app';

@Controller('health')
class ProbeController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const previousCorsOrigin = process.env.CORS_ORIGIN;

async function bootApp(
  corsOrigin: string | undefined,
): Promise<INestApplication> {
  if (corsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = corsOrigin;
  }

  return createTestApp(ProbeModule);
}

describe('CORS HTTP', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });

  it('echoes Access-Control-Allow-Origin when Origin matches CORS_ORIGIN', async () => {
    app = await bootApp('http://localhost:3000');
    const server = app.getHttpServer() as App;

    const response = await request(server)
      .get('/v1/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });

  it('does not allow a different Origin', async () => {
    app = await bootApp('http://localhost:3000');
    const server = app.getHttpServer() as App;

    const response = await request(server)
      .get('/v1/health')
      .set('Origin', 'http://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not send CORS headers when CORS_ORIGIN is unset', async () => {
    app = await bootApp(undefined);
    const server = app.getHttpServer() as App;

    const response = await request(server)
      .get('/v1/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
