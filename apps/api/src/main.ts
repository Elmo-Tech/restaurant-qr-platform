import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
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

  await app.listen(port, host);
}
void bootstrap();
