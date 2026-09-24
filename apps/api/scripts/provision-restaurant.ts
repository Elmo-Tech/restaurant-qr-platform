/**
 * FT-9: Operations CLI -- provisions ONE new Restaurant (Restaurant, locales,
 * OWNER user + membership, an initial ACTIVE Branch, the Generic QR). There is
 * no public signup and no Platform Admin in V1; this is the supported way to
 * onboard a Restaurant. It creates no Menu/Product/demo data.
 *
 * SAFE BY DEFAULT: with no --apply it only validates and prints the plan
 * (zero writes). The owner password is read ONLY from the environment
 * variable PROVISION_OWNER_PASSWORD (never a command-line argument, so it
 * never lands in shell history or the process list) and is never printed.
 *
 * Usage (from apps/api, PowerShell):
 *   $env:PROVISION_OWNER_PASSWORD = '<a strong password>'
 *   npm run provision:restaurant -- --restaurant-name "Elmo Bistro" --owner-email owner@example.com --branch-name "Main Branch"
 *   npm run provision:restaurant -- --restaurant-name "Elmo Bistro" --owner-email owner@example.com --branch-name "Main Branch" --apply
 *   Remove-Item Env:PROVISION_OWNER_PASSWORD
 *
 * Optional: --default-locale en|ar (default en), --currency EGP (default EGP),
 * --timezone Africa/Cairo (default Africa/Cairo).
 *
 * Exit codes: 0 ok / dry-run / already provisioned; 1 invalid input or an
 * identity conflict (nothing written); 2 unexpected error.
 *
 * Thin wrapper only (argv/env/dotenv, PrismaClient construction, reporting);
 * all logic lives in ../src/provisioning/provision-restaurant.ts and is
 * unit-tested. Same ts-node/require-shim approach as
 * backfill-restaurant-locales.ts (see that file).
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PasswordHasherService } from '../src/auth/password/password-hasher.service';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  provisionRestaurant,
  validateProvisionInput,
  type ProvisioningPrisma,
} from '../src/provisioning/provision-restaurant';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function readFlag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function main(): Promise<void> {
  const isApply = process.argv.includes('--apply');
  const input = {
    restaurantName: readFlag('restaurant-name') ?? '',
    ownerEmail: readFlag('owner-email') ?? '',
    branchName: readFlag('branch-name') ?? '',
    defaultLocale: readFlag('default-locale', 'en') as string,
    currencyCode: readFlag('currency', 'EGP') as string,
    timezone: readFlag('timezone', 'Africa/Cairo') as string,
    ownerPassword: process.env.PROVISION_OWNER_PASSWORD ?? '',
  };

  const validation = validateProvisionInput(input);
  if (!validation.ok) {
    console.error('Invalid input (nothing written):');
    for (const problem of validation.problems) console.error(`  - ${problem}`);
    console.error(
      'Required: --restaurant-name, --owner-email, --branch-name, and the PROVISION_OWNER_PASSWORD environment variable.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Restaurant provisioning -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  Restaurant:     ${validation.value.restaurantName}`);
  console.log(`  Owner:          ${validation.value.ownerEmail}`);
  console.log(`  Initial Branch: ${validation.value.branchName} (${validation.value.timezone})`);
  console.log(
    `  Locales:        en, ar active; default ${validation.value.defaultLocale}; currency ${validation.value.currencyCode}`,
  );

  if (!isApply) {
    console.log('DRY RUN complete. Nothing was written. Re-run with --apply to provision.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await provisionRestaurant(
      prisma as unknown as ProvisioningPrisma,
      new PasswordHasherService(),
      input,
    );

    if (result.outcome === 'invalidInput') {
      console.error('Invalid input (nothing written):');
      for (const problem of result.problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }
    if (result.outcome === 'conflict') {
      console.error(
        `CONFLICT: a user with e-mail ${validation.value.ownerEmail} already exists and does not own a Restaurant named "${validation.value.restaurantName}". Nothing was written. Use a different owner e-mail.`,
      );
      process.exitCode = 1;
      return;
    }
    if (result.outcome === 'alreadyProvisioned') {
      console.log(
        `Already provisioned: ${result.restaurantPublicId} is owned by ${validation.value.ownerEmail}. Nothing was changed.`,
      );
      return;
    }

    const webUrl = (process.env.WEB_URL ?? '').replace(/\/+$/, '');
    console.log('PROVISIONED.');
    console.log(`  Restaurant public id: ${result.restaurantPublicId}`);
    console.log(`  Owner login e-mail:   ${result.ownerEmail}`);
    console.log(`  Initial Branch:       ${result.branchName}`);
    console.log(
      `  Guest menu URL:       ${webUrl ? `${webUrl}/q/${result.genericQrPublicCode}` : `<WEB_URL>/q/${result.genericQrPublicCode}`}`,
    );
    console.log('Next: the Owner signs in and builds the menu; print the Restaurant QR from Tables & QR.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Never print the input (it contains the password) -- only the error itself.
  console.error('Provisioning failed with an unexpected error:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 2;
});
