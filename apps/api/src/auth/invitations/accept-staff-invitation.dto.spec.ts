import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptStaffInvitationDto } from './accept-staff-invitation.dto';

async function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(AcceptStaffInvitationDto, input);
  return validate(dto);
}

function validPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    token: 'some-opaque-raw-token-value',
    password: 'correct horse battery staple',
    ...overrides,
  };
}

describe('AcceptStaffInvitationDto', () => {
  it('A. accepts a valid payload', async () => {
    const errors = await validateDto(validPayload());
    expect(errors).toHaveLength(0);
  });

  it('B. requires token', async () => {
    const errors = await validateDto({ password: '12345678' });
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('C. requires token to be a string', async () => {
    const errors = await validateDto(validPayload({ token: 12345 }));
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('D. rejects an empty token', async () => {
    const errors = await validateDto(validPayload({ token: '' }));
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('E. does NOT reject a token merely for not matching the 43-char raw-token shape (business-layer concern, not DTO-layer)', async () => {
    const errors = await validateDto(
      validPayload({ token: 'not-a-real-shape' }),
    );
    expect(errors.some((e) => e.property === 'token')).toBe(false);
  });

  it('F. requires password', async () => {
    const errors = await validateDto({ token: 'x' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('G. accepts a password at exactly the minimum length (8)', async () => {
    const errors = await validateDto(validPayload({ password: '12345678' }));
    expect(errors).toHaveLength(0);
  });

  it('H. rejects a password below the minimum length', async () => {
    const errors = await validateDto(validPayload({ password: '1234567' }));
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('I. accepts a password at exactly the maximum length (128)', async () => {
    const errors = await validateDto(
      validPayload({ password: 'a'.repeat(128) }),
    );
    expect(errors).toHaveLength(0);
  });

  it('J. rejects a password above the maximum length', async () => {
    const errors = await validateDto(
      validPayload({ password: 'a'.repeat(129) }),
    );
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('K. extra unknown fields (email/restaurantId/role/etc.) do not affect validation -- stripping itself is the existing global whitelist ValidationPipe (main.ts), proven at the controller/E2E layer, not here', async () => {
    const errors = await validateDto({
      ...validPayload(),
      email: 'attacker@example.test',
      restaurantId: 'attacker-restaurant',
      userId: 'attacker-user',
      role: 'OWNER',
      allBranches: true,
    });
    expect(errors).toHaveLength(0);
  });
});
