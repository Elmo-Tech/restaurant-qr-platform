import { Prisma } from '../generated/prisma/client';
import { isSerializationConflict } from './serialization-conflict';

describe('isSerializationConflict', () => {
  it('recognizes Prisma P2034', () => {
    const error = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    expect(isSerializationConflict(error)).toBe(true);
  });

  it('recognizes the commit-time DriverAdapterError TransactionWriteConflict', () => {
    const error = new Error('TransactionWriteConflict');
    error.name = 'DriverAdapterError';
    expect(isSerializationConflict(error)).toBe(true);
  });

  it('does not treat other errors as a retryable conflict', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const otherAdapter = new Error('SomethingElse');
    otherAdapter.name = 'DriverAdapterError';

    expect(isSerializationConflict(unique)).toBe(false);
    expect(isSerializationConflict(otherAdapter)).toBe(false);
    expect(isSerializationConflict(new Error('TransactionWriteConflict'))).toBe(false);
    expect(isSerializationConflict('TransactionWriteConflict')).toBe(false);
    expect(isSerializationConflict(null)).toBe(false);
  });
});
