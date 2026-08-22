import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { configureApp } from '@/shared/infrastructure/http/configure-app';
import { createAppLogger } from '@/shared/infrastructure/observability/app-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createAppLogger(),
  });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
