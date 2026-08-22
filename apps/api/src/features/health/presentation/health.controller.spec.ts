import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthService } from '@/features/health/application/health.service';
import { HealthModule } from '@/features/health/health.module';
import { createTestApp } from '@/shared/infrastructure/http/create-test-app';

describe('HealthController', () => {
  describe('unit', () => {
    it('returns status ok from service', () => {
      const service = new HealthService();
      expect(service.getStatus()).toEqual({ status: 'ok' });
    });
  });

  describe('http', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp(HealthModule);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /v1/health returns 200 and status ok', async () => {
      const server = app.getHttpServer() as App;
      const response = await request(server).get('/v1/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
