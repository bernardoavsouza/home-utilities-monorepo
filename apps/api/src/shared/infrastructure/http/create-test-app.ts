import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@/shared/infrastructure/http/configure-app';

export async function createTestApp(
  module: Type<unknown>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [module],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
