import { createBranchPublicId } from './branch-public-id';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createBranchPublicId', () => {
  it('has the exact shape branch-<UUIDv4>', () => {
    const publicId = createBranchPublicId();

    expect(publicId).toMatch(/^branch-/);
    expect(publicId.slice('branch-'.length)).toMatch(UUID_V4_PATTERN);
  });

  it('generates a distinct value on every call', () => {
    const first = createBranchPublicId();
    const second = createBranchPublicId();

    expect(first).not.toBe(second);
  });
});
