/**
 * Creates (or resets the password of) a Platform Administrator -- a member of the platform team who
 * signs in to the platform control dashboard (DEC-045). There is NO public sign-up: this script is the
 * only way to make an administrator. Run it where the database is reachable (from apps/api).
 *
 * Usage (PowerShell):
 *   npm run provision:platform-admin -- --email you@example.com --name "Your Name" --credentials-file ..\..\demo-assets\PLATFORM-LOGINS.txt
 *   npm run provision:platform-admin -- --email you@example.com --name "Your Name" --password-env PLATFORM_ADMIN_PASSWORD
 *   add --reset-password to change an existing administrator's password (and revoke their sessions)
 *
 * The password is either read from the environment variable named by --password-env (at least 10
 * characters) or generated randomly. A generated password is written to --credentials-file when
 * given (keep that file out of git), otherwise printed once. It is never stored in plain text.
 *
 * Exit codes: 0 ok; 1 invalid input or administrator exists; 2 unexpected error.
 */
import { randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { normalizeLoginEmail } from '../src/auth/login/login.service';
import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const email = readFlag('email')?.trim();
  const name = readFlag('name')?.trim();
  const passwordEnv = readFlag('password-env');
  const credentialsFile = readFlag('credentials-file');
  const resetPassword = process.argv.includes('--reset-password');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Required: --email <valid email> and --name <display name>.');
    process.exitCode = 1;
    return;
  }

  let password: string;
  let generated = false;
  if (passwordEnv) {
    password = process.env[passwordEnv] ?? '';
    if (password.length < 8 || password.length > 128) {
      console.error(
        `The environment variable ${passwordEnv} must hold a password of 8 to 128 characters.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    password = randomBytes(18).toString('base64url');
    generated = true;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const emailNormalized = normalizeLoginEmail(email);
    const existing = await prisma.platformAdmin.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });
    if (existing && !resetPassword) {
      console.error(
        'An administrator with this email already exists. Use --reset-password to change the password.',
      );
      process.exitCode = 1;
      return;
    }
    const passwordHash = await new PasswordHasherService().hashPassword(
      password,
    );
    if (existing) {
      await prisma.$transaction([
        prisma.platformAdmin.update({
          where: { id: existing.id },
          data: { passwordHash, status: 'ACTIVE' },
        }),
        prisma.platformSession.updateMany({
          where: { adminId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      console.log(
        `Password reset for ${emailNormalized}; every existing session was ended.`,
      );
    } else {
      await prisma.platformAdmin.create({
        data: {
          email,
          emailNormalized,
          passwordHash,
          displayName: name,
          status: 'ACTIVE',
        },
      });
      console.log(`Platform administrator created: ${emailNormalized}`);
    }

    if (generated) {
      if (credentialsFile) {
        await appendFile(
          path.resolve(process.cwd(), credentialsFile),
          `platform admin    ${emailNormalized}    ${password}\n`,
        );
        console.log(
          `The generated password was written to ${credentialsFile} (keep it out of git).`,
        );
      } else {
        console.log(`Generated password (shown once): ${password}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 2;
});
