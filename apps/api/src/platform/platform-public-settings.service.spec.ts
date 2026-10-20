import { DEFAULT_POWERED_BY_URL } from './platform-public-settings.constants';
import { PlatformPublicSettingsService } from './platform-public-settings.service';

const ADMIN = {
  adminId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  sessionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  email: 'admin@wayta.test',
  displayName: 'Admin',
};

function buildService(
  stored: { poweredByUrl: string; updatedAt: Date } | null = null,
) {
  const findUnique = jest.fn().mockResolvedValue(stored);
  const upsert = jest.fn().mockResolvedValue({
    poweredByUrl: 'https://example.com/pricing',
    updatedAt: new Date('2026-10-21T00:00:00.000Z'),
  });
  const record = jest.fn().mockResolvedValue(undefined);
  const service = new PlatformPublicSettingsService(
    { platformPublicSettings: { findUnique, upsert } } as never,
    { record } as never,
  );
  return { service, findUnique, upsert, record };
}

describe('PlatformPublicSettingsService', () => {
  it('uses the production landing page when the singleton row is missing', async () => {
    const { service } = buildService();
    await expect(service.get()).resolves.toEqual({
      poweredByUrl: DEFAULT_POWERED_BY_URL,
      updatedAt: null,
    });
  });

  it('normalizes, saves and audits a changed HTTPS destination', async () => {
    const { service, upsert, record } = buildService({
      poweredByUrl: DEFAULT_POWERED_BY_URL,
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    });

    await expect(
      service.update(ADMIN, '  https://example.com/pricing  '),
    ).resolves.toEqual({
      poweredByUrl: 'https://example.com/pricing',
      updatedAt: '2026-10-21T00:00:00.000Z',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { poweredByUrl: 'https://example.com/pricing' },
      }),
    );
    expect(record).toHaveBeenCalledWith({
      admin: ADMIN,
      action: 'platform.public_settings_updated',
      details: {
        field: 'poweredByUrl',
        from: DEFAULT_POWERED_BY_URL,
        to: 'https://example.com/pricing',
      },
    });
  });

  it('does not write or audit an unchanged destination', async () => {
    const { service, upsert, record } = buildService({
      poweredByUrl: DEFAULT_POWERED_BY_URL,
      updatedAt: new Date('2026-10-20T00:00:00.000Z'),
    });
    await service.update(ADMIN, DEFAULT_POWERED_BY_URL);
    expect(upsert).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTPS destination without reading or writing settings', async () => {
    const { service, findUnique, upsert, record } = buildService();

    await expect(service.update(ADMIN, 'http://example.com')).rejects.toThrow(
      'poweredByUrl must use HTTPS',
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
