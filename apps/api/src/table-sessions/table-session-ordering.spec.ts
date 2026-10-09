import {
  isClosedSessionTriggerViolation,
  resolveDineInSessionSlot,
  TableNotOrderableError,
  TableOrderingUnavailableError,
} from './table-session-ordering';

const SCOPE = {
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  tableId: 'table-1',
};

/** Flattens a Prisma tagged-template call into one searchable SQL string. */
function sqlOf(call: unknown[]): string {
  const strings = call[0] as readonly string[];
  return strings.join('?').replace(/\s+/g, ' ');
}

function buildTx(options: {
  tableRows?: { status: string; staff_open_required: boolean }[];
  openSession?: { id: string } | null;
  allocatedRows?: { round_number: number }[];
}) {
  const queryRaw = jest
    .fn<Promise<unknown>, unknown[]>()
    // 1st raw query: table lock. 2nd raw query: round allocation.
    .mockResolvedValueOnce(
      options.tableRows ?? [{ status: 'ACTIVE', staff_open_required: false }],
    )
    .mockResolvedValueOnce(options.allocatedRows ?? [{ round_number: 2 }]);
  const tableSessionFindFirst = jest
    .fn<
      Promise<{ id: string } | null>,
      [{ where: { status: string }; select: { id: boolean } }]
    >()
    .mockResolvedValue(options.openSession ?? null);
  const tableSessionCreate = jest
    .fn<
      Promise<{ id: string }>,
      [{ data: { publicId: string } & Record<string, unknown> }]
    >()
    .mockResolvedValue({ id: 'session-new' });
  const eventCreate = jest
    .fn<Promise<unknown>, [unknown]>()
    .mockResolvedValue({});
  const tx = {
    $queryRaw: queryRaw,
    tableSession: {
      findFirst: tableSessionFindFirst,
      create: tableSessionCreate,
    },
    tableSessionEvent: { create: eventCreate },
  };
  return {
    tx: tx as never,
    queryRaw,
    tableSessionFindFirst,
    tableSessionCreate,
    eventCreate,
  };
}

describe('resolveDineInSessionSlot', () => {
  it('locks the Table row FIRST with FOR NO KEY UPDATE, scoped by tenant and branch', async () => {
    const mock = buildTx({ openSession: { id: 'session-1' } });

    await resolveDineInSessionSlot(mock.tx, SCOPE);

    const lockCall = mock.queryRaw.mock.calls[0];
    const sql = sqlOf(lockCall);
    expect(sql).toContain('FROM "tables"');
    expect(sql).toContain('FOR NO KEY UPDATE');
    expect(sql).toContain('"restaurant_id"');
    expect(sql).toContain('"branch_id"');
    expect(lockCall.slice(1)).toEqual(['table-1', 'restaurant-1', 'branch-1']);
    // The table lock is the very first database access.
    expect(mock.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mock.tableSessionFindFirst.mock.invocationCallOrder[0],
    );
  });

  it('attaches to the existing OPEN session and takes the next round atomically', async () => {
    const mock = buildTx({
      openSession: { id: 'session-1' },
      allocatedRows: [{ round_number: 4 }],
    });

    const slot = await resolveDineInSessionSlot(mock.tx, SCOPE);

    expect(slot).toEqual({ tableSessionId: 'session-1', roundNumber: 4 });
    expect(mock.tableSessionFindFirst).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        tableId: 'table-1',
        status: 'OPEN',
      },
      select: { id: true },
    });
    const allocateSql = sqlOf(mock.queryRaw.mock.calls[1]);
    expect(allocateSql).toContain('UPDATE "table_sessions"');
    expect(allocateSql).toContain('"next_round_number" + 1');
    expect(allocateSql).toContain(`"status" = 'OPEN'`);
    expect(allocateSql).toContain('RETURNING');
    expect(mock.tableSessionCreate).not.toHaveBeenCalled();
    expect(mock.eventCreate).not.toHaveBeenCalled();
  });

  it('opens a new OPEN session (FIRST_ORDER) with round 1 and writes the SESSION_OPENED event when none exists and the table is not locked', async () => {
    const mock = buildTx({ openSession: null });

    const slot = await resolveDineInSessionSlot(mock.tx, SCOPE);

    expect(slot).toEqual({ tableSessionId: 'session-new', roundNumber: 1 });
    const created = mock.tableSessionCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      tableId: 'table-1',
      status: 'OPEN',
      openedVia: 'FIRST_ORDER',
      nextRoundNumber: 2,
    });
    expect(created.publicId).toMatch(/^session-[0-9a-f-]{36}$/);
    expect(mock.eventCreate).toHaveBeenCalledTimes(1);
    expect(mock.eventCreate.mock.calls[0][0]).toMatchObject({
      data: {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        tableSessionId: 'session-new',
        type: 'SESSION_OPENED',
        actorType: 'GUEST',
      },
    });
    // Only the table lock was a raw query: no round UPDATE for a brand-new session.
    expect(mock.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects with TableOrderingUnavailableError, creating nothing, when no OPEN session exists and staff must open one', async () => {
    const mock = buildTx({
      tableRows: [{ status: 'ACTIVE', staff_open_required: true }],
      openSession: null,
    });

    await expect(
      resolveDineInSessionSlot(mock.tx, SCOPE),
    ).rejects.toBeInstanceOf(TableOrderingUnavailableError);
    expect(mock.tableSessionCreate).not.toHaveBeenCalled();
    expect(mock.eventCreate).not.toHaveBeenCalled();
  });

  it('an OPEN session still wins over a (never expected) stale staff_open_required flag', async () => {
    const mock = buildTx({
      tableRows: [{ status: 'ACTIVE', staff_open_required: true }],
      openSession: { id: 'session-1' },
      allocatedRows: [{ round_number: 2 }],
    });

    await expect(resolveDineInSessionSlot(mock.tx, SCOPE)).resolves.toEqual({
      tableSessionId: 'session-1',
      roundNumber: 2,
    });
  });

  it('only ever looks for OPEN sessions, so a CLOSED session is never reused or reopened', async () => {
    const mock = buildTx({ openSession: null });

    await resolveDineInSessionSlot(mock.tx, SCOPE);

    expect(mock.tableSessionFindFirst.mock.calls[0][0].where.status).toBe(
      'OPEN',
    );
    // No update/reopen API is even touched on the session delegate.
    expect(
      Object.keys(
        (mock.tx as unknown as { tableSession: object }).tableSession,
      ).sort(),
    ).toEqual(['create', 'findFirst']);
  });

  it.each([
    ['the Table row is gone or in another tenant/branch', []],
    [
      'the Table is no longer ACTIVE',
      [{ status: 'INACTIVE', staff_open_required: false }],
    ],
  ])('throws TableNotOrderableError when %s', async (_name, tableRows) => {
    const mock = buildTx({ tableRows });

    await expect(
      resolveDineInSessionSlot(mock.tx, SCOPE),
    ).rejects.toBeInstanceOf(TableNotOrderableError);
    expect(mock.tableSessionFindFirst).not.toHaveBeenCalled();
  });

  it('fails loudly instead of guessing if the session vanished while allocating a round', async () => {
    const mock = buildTx({
      openSession: { id: 'session-1' },
      allocatedRows: [],
    });

    await expect(resolveDineInSessionSlot(mock.tx, SCOPE)).rejects.toThrow(
      'table session changed while allocating a round',
    );
  });
});

describe('isClosedSessionTriggerViolation', () => {
  it('recognizes the TS001 SQLSTATE on a nested driver error', () => {
    const error = new Error('Raw query failed');
    Object.assign(error, {
      meta: { driverAdapterError: { cause: { originalCode: 'TS001' } } },
    });
    expect(isClosedSessionTriggerViolation(error)).toBe(true);
  });

  it('recognizes the trigger message as a fallback', () => {
    expect(
      isClosedSessionTriggerViolation(
        new Error(
          'table session x is not OPEN: orders can only be attached to an OPEN session',
        ),
      ),
    ).toBe(true);
  });

  it.each([
    [new Error('connection reset')],
    [{ code: 'P2002' }],
    [null],
    ['TS001'],
    [undefined],
  ])('does not match an unrelated error (%p)', (error) => {
    expect(isClosedSessionTriggerViolation(error)).toBe(false);
  });

  it('survives a circular error object', () => {
    const error: Record<string, unknown> = { code: 'X' };
    error.self = error;
    expect(isClosedSessionTriggerViolation(error)).toBe(false);
  });
});
