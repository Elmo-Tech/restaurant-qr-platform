import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffUserDto } from './create-staff-user.dto';

const BRANCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

async function check(body: Record<string, unknown>) {
  const instance = plainToInstance(CreateStaffUserDto, body);
  const errors = await validate(instance);
  return { instance, fields: errors.map((error) => error.property) };
}

const ROLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VALID = { email: 'A.User@Example.test ', roleId: ROLE_ID, allBranches: false, branchIds: [BRANCH_ID] };

describe('CreateStaffUserDto', () => {
  it('accepts a valid body and normalizes the email like Login does', async () => {
    const { instance, fields } = await check(VALID);

    expect(fields).toEqual([]);
    expect(instance.email).toBe('a.user@example.test');
  });

  it('accepts all-branches with an empty branch list, plus the optional fields', async () => {
    const { fields } = await check({
      ...VALID,
      allBranches: true,
      branchIds: [],
      active: false,
      password: 'admin-entered-pass-1',
    });

    expect(fields).toEqual([]);
  });

  it('requires a well-formed role id (a Role is a Restaurant row, never a name)', async () => {
    expect((await check({ ...VALID, roleId: 'OWNER' })).fields).toContain('roleId');
    expect((await check({ ...VALID, roleId: undefined })).fields).toContain('roleId');
  });

  it('rejects an invalid email', async () => {
    expect((await check({ ...VALID, email: 'not-an-email' })).fields).toContain('email');
  });

  it('rejects an inconsistent Branch scope', async () => {
    expect((await check({ ...VALID, allBranches: true, branchIds: [BRANCH_ID] })).fields).toContain('branchIds');
    expect((await check({ ...VALID, allBranches: false, branchIds: [] })).fields).toContain('branchIds');
  });

  it('applies the existing 10-128 character password policy to the password', async () => {
    expect((await check({ ...VALID, password: 'short' })).fields).toContain('password');
    expect((await check({ ...VALID, password: 'x'.repeat(129) })).fields).toContain('password');
    expect((await check({ ...VALID, password: 'exactly-ten' })).fields).toEqual([]);
  });

  it('does not accept the retired temporaryPassword field (stripped by the whitelist pipe, never a password)', async () => {
    const { instance } = await check({ ...VALID, temporaryPassword: 'whatever-123456' });
    expect((instance as { password?: string }).password).toBeUndefined();
  });
});
