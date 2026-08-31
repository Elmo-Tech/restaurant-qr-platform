import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/http/validation-exception.factory';
import type { EnvConfig } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  const host = configService.get('API_HOST', { infer: true });
  const port = configService.get('API_PORT', { infer: true });
  const apiPrefix = configService
    .get('API_PREFIX', { infer: true })
    .replace(/^\/+/, '');

  app.setGlobalPrefix(apiPrefix);

  // TECH_STACK.md #28: class-validator/class-transformer DTO validation is
  // authoritative at the API boundary. `whitelist` strips properties not
  // declared on the DTO (defense in depth); `transform` is required for
  // class-validator decorators to run against the plain parsed JSON body.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // AUTH_TENANCY_SPEC.md #11/#107, SECURITY_SPEC.md #68-69: a single
  // explicit trusted origin, never a wildcard, because cookie-authenticated
  // requests need `credentials: true`.
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  await app.listen(port, host);
}
void bootstrap();
