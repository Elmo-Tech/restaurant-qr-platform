import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/http/request-context.middleware';
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

  // FT-9: /health and /ready live OUTSIDE the versioned API prefix so a
  // load balancer/uptime monitor has a stable, unprefixed path.
  app.setGlobalPrefix(apiPrefix, { exclude: ['health', 'ready'] });

  // FT-9: how many reverse-proxy hops to trust for the client IP. 0 (the
  // default) trusts none. Behind Nginx set TRUST_PROXY_HOPS=1, or every
  // client would share the proxy's IP for rate limiting.
  const trustProxyHops = configService.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // FT-9: request id + one access-log line per request (no bodies, cookies,
  // Authorization, or concrete URLs -- see the middleware).
  app.use(requestContextMiddleware);

  // FT-9: standard security headers. crossOriginResourcePolicy is relaxed
  // to cross-origin on purpose: uploaded Product/Category images are served
  // from this API origin to the Guest Menu on the Web origin, and Helmet's
  // default (same-origin) would make browsers refuse them. No custom CSP:
  // Helmet's default CSP suits a JSON API, and the Web app (Next.js) sets
  // its own headers.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));


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
    // These are public images (Guests already load them). A CORS read header lets the
    // Staff QR designer draw the restaurant logo into the QR image without tainting it.
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
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
