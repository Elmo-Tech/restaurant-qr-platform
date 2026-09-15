import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/http/validation-exception.factory';
import type { EnvConfig } from './config/env.schema';
import {
  ImageStorageService,
  MEDIA_PUBLIC_PATH_PREFIX,
} from './storage/image-storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  const host = configService.get('API_HOST', { infer: true });
  const port = configService.get('API_PORT', { infer: true });
  const apiPrefix = configService
    .get('API_PREFIX', { infer: true })
    .replace(/^\/+/, '');

  app.setGlobalPrefix(apiPrefix);

  // FT-2, Section 6: uploaded Product/Category images need a stable,
  // browser-loadable URL for the (future) Guest/Public Menu -- served
  // read-only via Express's static middleware, deliberately mounted
  // OUTSIDE the versioned `/api/v1` prefix (this is content delivery, not
  // an API resource) and with directory listing disabled. The GET route
  // itself carries no authorization -- the random server-generated filename
  // is a content-delivery identifier, never an auth credential.
  app.useStaticAssets(app.get(ImageStorageService).getUploadDir(), {
    prefix: MEDIA_PUBLIC_PATH_PREFIX,
    index: false,
    redirect: false,
  });

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
