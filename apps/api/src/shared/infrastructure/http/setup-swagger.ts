import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Swagger is opt-out in every environment but production, where it is opt-in.
 * `configureApp` is the production bootstrap, so an ungated `/docs` would publish
 * the whole API surface of every project derived from this boilerplate.
 */
export function isSwaggerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.SWAGGER_ENABLED;
  if (flag !== undefined && flag !== '') {
    return flag === 'true';
  }
  return env.NODE_ENV !== 'production';
}

export function setupSwagger(app: INestApplication): void {
  if (!isSwaggerEnabled()) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
