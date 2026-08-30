import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the repository-root .env explicitly so Prisma CLI commands work
// correctly regardless of the current working directory they are invoked
// from. This repository owns a single root-level .env / .env.example and
// must not gain a second, apps/api-local environment configuration.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
