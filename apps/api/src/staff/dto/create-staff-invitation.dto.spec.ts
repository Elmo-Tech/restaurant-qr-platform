import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStaffInvitationDto } from './create-staff-invitation.dto';

const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';
// A well-formed UUIDv1 (version nibble "1", not "4") -- DATABASE_SPEC.md #7:
// "V1 does not depend on a specific UUID version at the Domain level."
const VALID_UUID_V1 = '33333333-3333-1333-8333-333333333333';

async function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(CreateStaffInvitationDto, input);
  return validate(dto);
}

function validPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    email: 'manager@example.test',
    role: 'MANAGER',
    allBranches: false,
    branchIds: [VALID_UUID_A],
    ...overrides,
  };
}

describe('CreateStaffInvitationDto', () => {
  it('A. accepts a valid MANAGER payload', async () => {
    const errors = await validateDto(validPayload());
    expect(errors).toHaveLength(0);
  });

  it('B. accepts CASHIER', async () => {
    const errors = await validateDto(validPayload({ role: 'CASHIER' }));
    expect(errors).toHaveLength(0);
  });

  it('C. accepts KITCHEN', async () => {
    const errors = await validateDto(validPayload({ role: 'KITCHEN' }));
    expect(errors).toHaveLength(0);
  });

  it('D. accepts WAITER', async () => {
    const errors = await validateDto(validPayload({ role: 'WAITER' }));
    expect(errors).toHaveLength(0);
  });

  it('E. rejects OWNER', async () => {
    const errors = await validateDto(validPayload({ role: 'OWNER' }));
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('F. rejects an invalid role string', async () => {
    const errors = await validateDto(validPayload({ role: 'SUPERADMIN' }));
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('G. accepts a valid email', async () => {
    const errors = await validateDto(
      validPayload({ email: 'valid@example.test' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('H. rejects an invalid email', async () => {
    const errors = await validateDto(validPayload({ email: 'not-an-email' }));
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('I. trims and lowercases email before validation/persistence', async () => {
    const dto = plainToInstance(
      CreateStaffInvitationDto,
      validPayload({ email: '  Manager@Example.TEST  ' }),
    );
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('manager@example.test');
  });

  it('J. requires allBranches as a boolean', async () => {
    const errors = await validateDto(validPayload({ allBranches: 'true' }));
    expect(errors.some((e) => e.property === 'allBranches')).toBe(true);
  });

  it('K. requires branchIds as an array', async () => {
    const errors = await validateDto(
      validPayload({ allBranches: false, branchIds: 'not-an-array' }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('L. allBranches=true + branchIds=[] is valid', async () => {
    const errors = await validateDto(
      validPayload({ allBranches: true, branchIds: [] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('M. allBranches=true + non-empty branchIds is invalid', async () => {
    const errors = await validateDto(
      validPayload({ allBranches: true, branchIds: [VALID_UUID_A] }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('N. allBranches=false + non-empty branchIds is valid', async () => {
    const errors = await validateDto(
      validPayload({
        allBranches: false,
        branchIds: [VALID_UUID_A, VALID_UUID_B],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('O. allBranches=false + [] is invalid', async () => {
    const errors = await validateDto(
      validPayload({ allBranches: false, branchIds: [] }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('P. rejects a malformed UUID in branchIds', async () => {
    const errors = await validateDto(
      validPayload({ branchIds: ['not-a-uuid'] }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('Q. rejects duplicate branchIds', async () => {
    const errors = await validateDto(
      validPayload({ branchIds: [VALID_UUID_A, VALID_UUID_A] }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('R. accepts a valid non-v4 UUID (DATABASE_SPEC.md #7: no specific UUID version is required)', async () => {
    const errors = await validateDto(
      validPayload({ branchIds: [VALID_UUID_V1] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('S. rejects the same UUID appearing twice with different letter casing as a duplicate', async () => {
    const errors = await validateDto(
      validPayload({
        branchIds: [VALID_UUID_A, VALID_UUID_A.toUpperCase()],
      }),
    );
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });

  it('T. a non-string branchIds element is rejected as a normal validation failure, not a thrown error', async () => {
    await expect(
      validateDto(validPayload({ branchIds: [42] })),
    ).resolves.not.toThrow();
    const errors = await validateDto(validPayload({ branchIds: [42] }));
    expect(errors.some((e) => e.property === 'branchIds')).toBe(true);
  });
});
