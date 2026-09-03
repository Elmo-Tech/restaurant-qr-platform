import { Prisma } from '../generated/prisma/client';
import { createQrPublicCode } from '../qr/qr-public-code';
import { TablesService } from './tables.service';

jest.mock('../qr/qr-public-code', () => ({
  createQrPublicCode: jest.fn(() => 'fixed-test-public-code'),
}));

const RESTAURANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TABLE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const QR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const VALID_INPUT = {
  restaurantId: RESTAURANT_ID,
  branchId: BRANCH_ID,
  tableNumber: 'A1',
};

interface TableCreateArgs {
  data: {
    restaurantId: string;
    branchId: string;
    tableNumber: string;
    status: string;
  };
  select: Record<string, boolean>;
}

interface QrCodeCreateArgs {
  data: {
    publicCode: string;
    restaurantId: string;
    branchId: string;
    tableId: string;
    type: string;
    status: string;
  };
  select: Record<string, boolean>;
}

interface TableFindManyArgs {
  where: Record<string, unknown>;
  orderBy: Record<string, unknown>;
  select: Record<string, boolean>;
}

interface TableFindFirstArgs {
  where: Record<string, unknown>;
  select: {
    id: boolean;
    tableNumber: boolean;
    status: boolean;
    qrCodes: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
      take: number;
    };
  };
}

interface TableDetailRow {
  id: string;
  tableNumber: string;
  status: string;
  qrCodes: { id: string; publicCode: string; status: string }[];
}

/**
 * `table.findFirst` is shared between `getTableDetail` (select includes the
 * nested `qrCodes` relation) and `updateTable`'s identity lookup (plain
 * `id`/`tableNumber`/`status` select) -- the mock's declared arg type stays
 * the Detail shape (unchanged, so existing Detail tests need no cast), and
 * the new `updateTable` tests narrow the recorded call args locally instead
 * of widening this shared type.
 */
interface TableIdentityRow {
  id: string;
  tableNumber: string;
  status: string;
}

interface TableUpdateManyAndReturnArgs {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  select: Record<string, boolean>;
}

function buildPrismaMock() {
  const tableCreate = jest.fn<
    Promise<{ id: string; tableNumber: string; status: string }>,
    [TableCreateArgs]
  >();
  const qrCodeCreate = jest.fn<
    Promise<{ id: string; publicCode: string; status: string }>,
    [QrCodeCreateArgs]
  >();
  const tableFindMany = jest
    .fn<
      Promise<{ id: string; tableNumber: string; status: string }[]>,
      [TableFindManyArgs]
    >()
    .mockResolvedValue([]);
  const tableFindFirst = jest
    .fn<Promise<TableDetailRow | null>, [TableFindFirstArgs]>()
    .mockResolvedValue(null);
  const tableUpdateManyAndReturn = jest
    .fn<Promise<TableIdentityRow[]>, [TableUpdateManyAndReturnArgs]>()
    .mockResolvedValue([]);
  const txClient = {
    table: { create: tableCreate },
    qrCode: { create: qrCodeCreate },
  };
  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );
  // Deliberately no top-level `qrCode` and no `restaurantMembershipBranch`
  // on this mock: if the service ever wrote outside `$transaction`'s
  // callback (violating K), or ever queried Membership/QR data, that call
  // would throw here rather than silently succeeding. `table.findMany`/
  // `table.findFirst`/`table.updateManyAndReturn` are the legitimate
  // top-level (non-transactional) calls `listTables`/`getTableDetail`/
  // `updateTable` perform.
  return {
    prisma: {
      $transaction,
      table: {
        findMany: tableFindMany,
        findFirst: tableFindFirst,
        updateManyAndReturn: tableUpdateManyAndReturn,
      },
    },
    tableCreate,
    qrCodeCreate,
    tableFindMany,
    tableFindFirst,
    tableUpdateManyAndReturn,
    $transaction,
  };
}

function fakeUniqueViolation(constraintIndex: string, table: string) {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the constraint: \`${constraintIndex}\``,
    {
      code: 'P2002',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23505',
            originalMessage: `duplicate key value violates unique constraint "${constraintIndex}"`,
            kind: 'UniqueConstraintViolation',
            constraint: { index: constraintIndex },
            table,
          },
        },
      },
    },
  );
}

describe('TablesService', () => {
  let mock: ReturnType<typeof buildPrismaMock>;
  let service: TablesService;

  beforeEach(() => {
    jest.clearAllMocks();
    mock = buildPrismaMock();
    service = new TablesService(mock.prisma as never);
  });

  describe('successful creation', () => {
    beforeEach(() => {
      mock.tableCreate.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'ACTIVE',
      });
      mock.qrCodeCreate.mockResolvedValue({
        id: QR_ID,
        publicCode: 'fixed-test-public-code',
        status: 'ACTIVE',
      });
    });

    it('A. creates an ACTIVE Table', async () => {
      await service.createTable(VALID_INPUT);

      expect(mock.tableCreate).toHaveBeenCalledWith({
        data: {
          restaurantId: RESTAURANT_ID,
          branchId: BRANCH_ID,
          tableNumber: 'A1',
          status: 'ACTIVE',
        },
        select: { id: true, tableNumber: true, status: true },
      });
    });

    it('B. creates an ACTIVE TABLE QrCode', async () => {
      await service.createTable(VALID_INPUT);

      const call = mock.qrCodeCreate.mock.calls[0][0];
      expect(call.data.type).toBe('TABLE');
      expect(call.data.status).toBe('ACTIVE');
      expect(call.select).toEqual({ id: true, publicCode: true, status: true });
    });

    it('C. Table and QrCode use the same authorized restaurantId', async () => {
      await service.createTable(VALID_INPUT);

      expect(mock.tableCreate.mock.calls[0][0].data.restaurantId).toBe(
        RESTAURANT_ID,
      );
      expect(mock.qrCodeCreate.mock.calls[0][0].data.restaurantId).toBe(
        RESTAURANT_ID,
      );
    });

    it('D. Table and QrCode use the same authorized branchId', async () => {
      await service.createTable(VALID_INPUT);

      expect(mock.tableCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_ID);
      expect(mock.qrCodeCreate.mock.calls[0][0].data.branchId).toBe(BRANCH_ID);
    });

    it('E. QR.tableId equals the newly-created Table.id', async () => {
      await service.createTable(VALID_INPUT);

      expect(mock.qrCodeCreate.mock.calls[0][0].data.tableId).toBe(TABLE_ID);
    });

    it('F. QR publicCode comes from the QR helper', async () => {
      await service.createTable(VALID_INPUT);

      expect(createQrPublicCode).toHaveBeenCalledTimes(1);
      expect(mock.qrCodeCreate.mock.calls[0][0].data.publicCode).toBe(
        'fixed-test-public-code',
      );
    });

    it('G. returns exactly the safe response shape', async () => {
      const result = await service.createTable(VALID_INPUT);

      expect(result).toEqual({
        outcome: 'created',
        data: {
          table: { id: TABLE_ID, tableNumber: 'A1', status: 'ACTIVE' },
          qr: {
            id: QR_ID,
            publicCode: 'fixed-test-public-code',
            status: 'ACTIVE',
          },
        },
      });
    });

    it('K. both writes go through the same $transaction callback', async () => {
      await service.createTable(VALID_INPUT);

      expect(mock.$transaction).toHaveBeenCalledTimes(1);
      expect(mock.tableCreate).toHaveBeenCalledTimes(1);
      expect(mock.qrCodeCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('duplicate Table Number', () => {
    it('H. maps the tables(branch_id, table_number) unique violation to a typed conflict result', async () => {
      mock.$transaction.mockRejectedValue(
        fakeUniqueViolation('tables_branch_id_table_number_key', 'tables'),
      );

      const result = await service.createTable(VALID_INPUT);

      expect(result).toEqual({ outcome: 'tableNumberConflict' });
    });
  });

  describe('QR publicCode uniqueness', () => {
    it('I. a qr_codes(public_code) unique violation is NOT classified as a Table Number conflict', async () => {
      mock.$transaction.mockRejectedValue(
        fakeUniqueViolation('qr_codes_public_code_key', 'qr_codes'),
      );

      await expect(service.createTable(VALID_INPUT)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
    });
  });

  describe('unexpected persistence error', () => {
    it('J. an unrelated database error is NOT classified as a Table Number conflict', async () => {
      const unexpected = new Error('connection reset');
      mock.$transaction.mockRejectedValue(unexpected);

      await expect(service.createTable(VALID_INPUT)).rejects.toBe(unexpected);
    });
  });

  describe('listTables', () => {
    const LIST_INPUT = { restaurantId: RESTAURANT_ID, branchId: BRANCH_ID };

    it('A. query uses the authorized restaurantId', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.where.restaurantId).toBe(RESTAURANT_ID);
    });

    it('B. query uses the authorized branchId', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.where.branchId).toBe(BRANCH_ID);
    });

    it('C. where contains BOTH restaurantId and branchId, nothing else', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.where).toEqual({
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
      });
    });

    it('D. no status filter exists', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('status');
    });

    it('E. ordering is exactly tableNumber asc', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ tableNumber: 'asc' });
    });

    it('F. selects exactly id, tableNumber, status', async () => {
      await service.listTables(LIST_INPUT);

      const args = mock.tableFindMany.mock.calls[0][0];
      expect(args.select).toEqual({
        id: true,
        tableNumber: true,
        status: true,
      });
    });

    it('G. returns Prisma rows unchanged', async () => {
      const rows = [
        { id: 'table-1', tableNumber: 'A1', status: 'ACTIVE' },
        { id: 'table-2', tableNumber: 'B2', status: 'INACTIVE' },
      ];
      mock.tableFindMany.mockResolvedValue(rows);

      const result = await service.listTables(LIST_INPUT);

      expect(result).toEqual(rows);
    });

    it('H. empty Prisma result returns []', async () => {
      mock.tableFindMany.mockResolvedValue([]);

      const result = await service.listTables(LIST_INPUT);

      expect(result).toEqual([]);
    });

    it('I. performs no Membership query', async () => {
      const prismaWithMembership = mock.prisma as unknown as {
        restaurantMembershipBranch?: unknown;
      };

      await service.listTables(LIST_INPUT);

      expect(prismaWithMembership.restaurantMembershipBranch).toBeUndefined();
    });

    it('J. performs no QR query', async () => {
      const prismaWithQr = mock.prisma as unknown as { qrCode?: unknown };

      await service.listTables(LIST_INPUT);

      expect(prismaWithQr.qrCode).toBeUndefined();
    });
  });

  describe('getTableDetail', () => {
    const DETAIL_INPUT = {
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      tableId: TABLE_ID,
    };

    it('A. malformed tableId -> notFound, Prisma Table lookup NOT called', async () => {
      const result = await service.getTableDetail({
        ...DETAIL_INPUT,
        tableId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'notFound' });
      expect(mock.tableFindFirst).not.toHaveBeenCalled();
    });

    it('B. unknown well-formed tableId -> notFound', async () => {
      mock.tableFindFirst.mockResolvedValue(null);

      const result = await service.getTableDetail(DETAIL_INPUT);

      expect(result).toEqual({ outcome: 'notFound' });
    });

    it('C. query uses the authorized restaurantId', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where.restaurantId).toBe(RESTAURANT_ID);
    });

    it('D. query uses the authorized branchId', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where.branchId).toBe(BRANCH_ID);
    });

    it('E. query uses the tableId', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where.id).toBe(TABLE_ID);
    });

    it('F. where contains exactly id, restaurantId, branchId', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        id: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
      });
    });

    it('G. no Table status filter', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('status');
    });

    it('H. select contains exactly the safe Table fields plus the narrow QR relation', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(Object.keys(args.select).sort()).toEqual(
        ['id', 'tableNumber', 'status', 'qrCodes'].sort(),
      );
      expect(args.select.qrCodes.select).toEqual({
        id: true,
        publicCode: true,
        status: true,
      });
      expect(args.select.qrCodes.take).toBe(1);
    });

    it('I. QR relation filters restaurantId, branchId, type TABLE, and status ACTIVE', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.select.qrCodes.where).toEqual({
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
        type: 'TABLE',
        status: 'ACTIVE',
      });
    });

    it('J. an active QR maps to the exact nullable qr object', async () => {
      mock.tableFindFirst.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'ACTIVE',
        qrCodes: [{ id: QR_ID, publicCode: 'a-public-code', status: 'ACTIVE' }],
      });

      const result = await service.getTableDetail(DETAIL_INPUT);

      expect(result).toEqual({
        outcome: 'found',
        data: {
          id: TABLE_ID,
          tableNumber: 'A1',
          status: 'ACTIVE',
          qr: { id: QR_ID, publicCode: 'a-public-code', status: 'ACTIVE' },
        },
      });
    });

    it('K. no active QR maps to qr: null', async () => {
      mock.tableFindFirst.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'ACTIVE',
        qrCodes: [],
      });

      const result = await service.getTableDetail(DETAIL_INPUT);

      expect(result).toEqual({
        outcome: 'found',
        data: {
          id: TABLE_ID,
          tableNumber: 'A1',
          status: 'ACTIVE',
          qr: null,
        },
      });
    });

    it('L. a historical INACTIVE QR is never surfaced (excluded by the query itself)', async () => {
      // The service never even reads an INACTIVE row -- the narrow `where`
      // on the qrCodes relation already excludes it at the database level,
      // so the mock never resolves one here. This asserts the resulting
      // service outcome is still null, not a leaked historical row.
      mock.tableFindFirst.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'ACTIVE',
        qrCodes: [],
      });

      const result = await service.getTableDetail(DETAIL_INPUT);

      expect(result.outcome === 'found' && result.data.qr).toBeNull();
    });

    it('M. performs no Membership query', async () => {
      const prismaWithMembership = mock.prisma as unknown as {
        restaurantMembershipBranch?: unknown;
      };

      await service.getTableDetail(DETAIL_INPUT);

      expect(prismaWithMembership.restaurantMembershipBranch).toBeUndefined();
    });

    it('N. performs no transaction', async () => {
      await service.getTableDetail(DETAIL_INPUT);

      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('O. Table result retains its ACTIVE or INACTIVE status unchanged', async () => {
      mock.tableFindFirst.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'INACTIVE',
        qrCodes: [],
      });

      const result = await service.getTableDetail(DETAIL_INPUT);

      expect(result.outcome === 'found' && result.data.status).toBe('INACTIVE');
    });
  });

  describe('updateTable', () => {
    const UPDATE_INPUT = {
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      tableId: TABLE_ID,
    };
    const CURRENT_ROW = {
      id: TABLE_ID,
      tableNumber: 'A1',
      status: 'ACTIVE' as const,
      qrCodes: [],
    };

    beforeEach(() => {
      mock.tableFindFirst.mockResolvedValue(CURRENT_ROW);
    });

    it('A. malformed tableId -> notFound, no Prisma Table lookup/mutation', async () => {
      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableId: 'not-a-uuid',
        tableNumber: 'A2',
      });

      expect(result).toEqual({ outcome: 'notFound' });
      expect(mock.tableFindFirst).not.toHaveBeenCalled();
      expect(mock.tableUpdateManyAndReturn).not.toHaveBeenCalled();
    });

    it('B. unknown scoped Table -> notFound', async () => {
      mock.tableFindFirst.mockResolvedValue(null);

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result).toEqual({ outcome: 'notFound' });
      expect(mock.tableUpdateManyAndReturn).not.toHaveBeenCalled();
    });

    it('C. identity resolution where contains exactly id, restaurantId, branchId', async () => {
      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        id: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
      });
    });

    it('D. no Table status filter in the identity resolution', async () => {
      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      const args = mock.tableFindFirst.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('status');
    });

    it('E. tableNumber omitted -> returns current data, no mutation call', async () => {
      const result = await service.updateTable(UPDATE_INPUT);

      expect(result).toEqual({ outcome: 'updated', data: CURRENT_ROW });
      expect(mock.tableUpdateManyAndReturn).not.toHaveBeenCalled();
    });

    it('F. same tableNumber -> updated result, no mutation call', async () => {
      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A1',
      });

      expect(result).toEqual({ outcome: 'updated', data: CURRENT_ROW });
      expect(mock.tableUpdateManyAndReturn).not.toHaveBeenCalled();
    });

    it('G. whitespace-normalized same value (already trimmed by DTO) -> no mutation call', async () => {
      // The DTO trims before the service ever sees the value, so the
      // service itself only ever receives an already-normalized string;
      // this proves equality comparison against the current value still
      // short-circuits correctly for that normalized input.
      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A1',
      });

      expect(result.outcome).toBe('updated');
      expect(mock.tableUpdateManyAndReturn).not.toHaveBeenCalled();
    });

    it('H. changed tableNumber -> mutation uses authorized restaurantId, branchId, table id, and explicit data', async () => {
      mock.tableUpdateManyAndReturn.mockResolvedValue([
        { id: TABLE_ID, tableNumber: 'A2', status: 'ACTIVE' },
      ]);

      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      const args = mock.tableUpdateManyAndReturn.mock.calls[0][0];
      expect(args.where).toEqual({
        id: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
      });
      expect(args.data).toEqual({ tableNumber: 'A2' });
    });

    it('I. ACTIVE Table remains ACTIVE after a changed-value update', async () => {
      mock.tableUpdateManyAndReturn.mockResolvedValue([
        { id: TABLE_ID, tableNumber: 'A2', status: 'ACTIVE' },
      ]);

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result.outcome === 'updated' && result.data.status).toBe('ACTIVE');
    });

    it('J. INACTIVE Table remains INACTIVE after a changed-value update', async () => {
      mock.tableFindFirst.mockResolvedValue({
        id: TABLE_ID,
        tableNumber: 'A1',
        status: 'INACTIVE',
        qrCodes: [],
      });
      mock.tableUpdateManyAndReturn.mockResolvedValue([
        { id: TABLE_ID, tableNumber: 'A2', status: 'INACTIVE' },
      ]);

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result.outcome === 'updated' && result.data.status).toBe(
        'INACTIVE',
      );
    });

    it('K. exact response fields: id, tableNumber, status', async () => {
      mock.tableUpdateManyAndReturn.mockResolvedValue([
        { id: TABLE_ID, tableNumber: 'A2', status: 'ACTIVE' },
      ]);

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result).toEqual({
        outcome: 'updated',
        data: { id: TABLE_ID, tableNumber: 'A2', status: 'ACTIVE' },
      });
    });

    it('updateManyAndReturn matching zero rows (Table ceased to match scope between identity read and mutation) -> exactly notFound, never updated with undefined data', async () => {
      mock.tableUpdateManyAndReturn.mockResolvedValue([]);

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result).toEqual({ outcome: 'notFound' });
      const args = mock.tableUpdateManyAndReturn.mock.calls[0][0];
      expect(args.where).toEqual({
        id: TABLE_ID,
        restaurantId: RESTAURANT_ID,
        branchId: BRANCH_ID,
      });
    });

    it('L. exact unique constraint conflict -> tableNumberConflict', async () => {
      mock.tableUpdateManyAndReturn.mockRejectedValue(
        fakeUniqueViolation('tables_branch_id_table_number_key', 'tables'),
      );

      const result = await service.updateTable({
        ...UPDATE_INPUT,
        tableNumber: 'A2',
      });

      expect(result).toEqual({ outcome: 'tableNumberConflict' });
    });

    it('M. an unrelated persistence error is rethrown, not classified as a conflict', async () => {
      const unexpected = new Error('connection reset');
      mock.tableUpdateManyAndReturn.mockRejectedValue(unexpected);

      await expect(
        service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' }),
      ).rejects.toBe(unexpected);
    });

    it('a qr_codes(public_code) unique violation is NOT classified as a Table Number conflict', async () => {
      mock.tableUpdateManyAndReturn.mockRejectedValue(
        fakeUniqueViolation('qr_codes_public_code_key', 'qr_codes'),
      );

      await expect(
        service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('N. no QR write/query is required', async () => {
      const prismaWithQr = mock.prisma as unknown as { qrCode?: unknown };

      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      expect(prismaWithQr.qrCode).toBeUndefined();
    });

    it('O. no Membership query', async () => {
      const prismaWithMembership = mock.prisma as unknown as {
        restaurantMembershipBranch?: unknown;
      };

      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      expect(prismaWithMembership.restaurantMembershipBranch).toBeUndefined();
    });

    it('P. status is never present in the mutation data', async () => {
      mock.tableUpdateManyAndReturn.mockResolvedValue([
        { id: TABLE_ID, tableNumber: 'A2', status: 'ACTIVE' },
      ]);

      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      const args = mock.tableUpdateManyAndReturn.mock.calls[0][0];
      expect(args.data).not.toHaveProperty('status');
    });

    it('Q. no transaction is used', async () => {
      await service.updateTable({ ...UPDATE_INPUT, tableNumber: 'A2' });

      expect(mock.$transaction).not.toHaveBeenCalled();
    });
  });
});
