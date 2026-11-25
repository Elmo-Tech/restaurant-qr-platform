import { assertSandboxDatabase, SANDBOX_URL } from './sandbox-guard';

/**
 * Jest `globalSetup` for the API e2e config: when a sandbox URL is given, the
 * live target is identity-checked ONCE before any suite file is loaded, so no
 * Nest application can initialise (or write) against the wrong database.
 * Without a sandbox URL every destructive suite skips itself.
 */
export default async function sandboxGlobalSetup(): Promise<void> {
  if (SANDBOX_URL) {
    await assertSandboxDatabase(SANDBOX_URL);
  }
}
