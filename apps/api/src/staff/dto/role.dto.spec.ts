import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';

async function fields<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance);
  return { instance, fields: errors.map((error) => error.property) };
}

describe('CreateRoleDto', () => {
  it('accepts a valid Role and trims the name', async () => {
    const result = await fields(CreateRoleDto, { name: '  Barista ', permissions: ['orders.view', 'menu.view'] });

    expect(result.fields).toEqual([]);
    expect((result.instance as CreateRoleDto).name).toBe('Barista');
  });

  it('accepts a Role with no permissions', async () => {
    expect((await fields(CreateRoleDto, { name: 'Empty', permissions: [] })).fields).toEqual([]);
  });

  it('rejects a blank, missing or overlong name', async () => {
    expect((await fields(CreateRoleDto, { name: '   ', permissions: [] })).fields).toContain('name');
    expect((await fields(CreateRoleDto, { permissions: [] })).fields).toContain('name');
    expect((await fields(CreateRoleDto, { name: 'x'.repeat(61), permissions: [] })).fields).toContain('name');
  });

  it('rejects an unknown permission key, so a typo can never create an unenforceable grant', async () => {
    expect((await fields(CreateRoleDto, { name: 'X', permissions: ['orders.vieww'] })).fields).toContain('permissions');
  });

  it('rejects duplicate permission keys and a missing list', async () => {
    expect((await fields(CreateRoleDto, { name: 'X', permissions: ['orders.view', 'orders.view'] })).fields).toContain('permissions');
    expect((await fields(CreateRoleDto, { name: 'X' })).fields).toContain('permissions');
  });
});

describe('UpdateRoleDto', () => {
  it('accepts an empty update (nothing changes) and each field alone', async () => {
    expect((await fields(UpdateRoleDto, {})).fields).toEqual([]);
    expect((await fields(UpdateRoleDto, { name: 'New' })).fields).toEqual([]);
    expect((await fields(UpdateRoleDto, { permissions: ['orders.view'] })).fields).toEqual([]);
  });

  it('rejects an explicit blank name and unknown permissions', async () => {
    expect((await fields(UpdateRoleDto, { name: '  ' })).fields).toContain('name');
    expect((await fields(UpdateRoleDto, { permissions: ['nope'] })).fields).toContain('permissions');
  });
});
