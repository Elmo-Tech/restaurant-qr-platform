import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const host = process.env.API_HOST ?? '0.0.0.0';
  const port = Number(process.env.API_PORT ?? 4000);
  const apiPrefix = (process.env.API_PREFIX ?? '/api/v1').replace(/^\/+/, '');

  app.setGlobalPrefix(apiPrefix);

  await app.listen(port, host);
}
void bootstrap();
