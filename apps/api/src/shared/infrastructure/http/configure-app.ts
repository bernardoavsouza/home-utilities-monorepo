import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';
import { parseCorsOrigin } from '@/shared/infrastructure/http/cors-origin';
import { requestIdMiddleware } from '@/shared/infrastructure/http/request-id.middleware';
import { setupSwagger } from '@/shared/infrastructure/http/setup-swagger';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
  if (corsOrigin !== undefined) {
    app.enableCors({ origin: corsOrigin });
  }
  app.use(requestIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  setupSwagger(app);
}
