import { Injectable } from '@nestjs/common';
import { isWellFormedUuid } from '../common/is-uuid';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { QrStatus, TableStatus } from '../generated/prisma/client';
import { createQrPublicCode } from '../qr/qr-public-code';

/**
 * Persistence authority for Table creation comes only from the caller's
 * already-authorized context -- `restaurantId`/`branchId` are never
 * re-derived here (Branch ownership/scope was already resolved by
 * `BranchManagementAccessGuard`) -- plus the DTO-validated/normalized
 * `tableNumber`.
 */
export interface CreateTableInput {
  restaurantId: string;
  branchId: string;
  tableNumber: string;
}

/** The exact safe response shape (API_CONVENTIONS.md #114). Never `restaurantId`, `branchId`, `type`, or timestamps. */
export interface CreatedTable {
  table: { id: string; tableNumber: string; status: TableStatus };
  qr: { id: string; publicCode: string; status: QrStatus };
}

/**
 * Business Foundation L3, settled result type: distinguishes the one
 * expected durable conflict (duplicate Table Number within a Branch) from
 * every other persistence failure. Every other failure (including a
 * theoretical `qr_codes.public_code` collision) propagates unmapped, so the
 * controller never mislabels it.
 */
export type CreateTableResult =
  | { outcome: 'created'; data: CreatedTable }
  | { outcome: 'tableNumberConflict' };

/** The exact safe Table List item shape (API_CONVENTIONS.md #114A). Exactly `id`, `tableNumber`, `status` -- never `restaurantId`, `branchId`, timestamps, or QR data. */
export interface TableListItem {
  id: string;
  tableNumber: string;
  status: TableStatus;
}

/**
 * `restaurantId`/`branchId` here are the already-authorized
 * `request.restaurantAccess.restaurantId` / `request.branchAccess.branchId`
 * -- never the raw `:restaurantId`/`:branchId` route parameters.
 */
export interface ListTablesInput {
  restaurantId: string;
  branchId: string;
}

/** The exact safe QR shape nested in Table Detail (API_CONVENTIONS.md #114B). Never `restaurantId`, `branchId`, `tableId`, `type`, or timestamps. */
export interface TableDetailQr {
  id: string;
  publicCode: string;
  status: QrStatus;
}

/**
 * The exact safe Table Detail shape. `qr` is the Table's current ACTIVE
 * TABLE QR, or `null` -- the database guarantees at most one, never at
 * least one (DATABASE_SPEC.md #56's partial unique index has no matching
 * existence requirement).
 */
export interface TableDetail {
  id: string;
  tableNumber: string;
  status: TableStatus;
  qr: TableDetailQr | null;
}

/**
 * `restaurantId`/`branchId` are the already-authorized
 * `request.restaurantAccess.restaurantId` / `request.branchAccess.branchId`.
 * `tableId` is the raw `:tableId` route identifier -- identification only,
 * not authorization; it is trusted only once the tenant/Branch-scoped
 * lookup below actually finds a matching row.
 */
export interface GetTableDetailInput {
  restaurantId: string;
  branchId: string;
  tableId: string;
}

/**
 * Business Foundation P, settled result type: a plain outcome, never an
 * HTTP exception -- the controller alone decides how `notFound` maps to
 * `404 TABLE_NOT_FOUND`.
 */
export type TableDetailResult =
  { outcome: 'found'; data: TableDetail } | { outcome: 'notFound' };

/**
 * The real Postgres unique-index name behind `@@unique([branchId,
 * tableNumber])` on `Table` (Business Foundation L1 migration). Confirmed
 * empirically against this repository's actual database and Prisma 7
 * driver-adapter client before writing `isTableNumberConflict` below --
 * never assumed from general Prisma documentation.
 */
const TABLE_NUMBER_UNIQUE_CONSTRAINT = 'tables_branch_id_table_number_key';

/**
 * Business Foundation L3, security/correctness-critical: this repo's Prisma
 * 7 + `@prisma/adapter-pg` driver-adapter client reports a unique violation
 * as `PrismaClientKnownRequestError` with `code === 'P2002'`, but -- unlike
 * the legacy query-engine binary's classic `meta.target` field-name array
 * -- does NOT populate `meta.target` for these constraints at all. The real
 * Postgres constraint name instead appears at
 * `meta.driverAdapterError.cause.constraint.index`. This was verified
 * directly: two real unique violations (the `tables(branch_id,
 * table_number)` constraint and the unrelated `qr_codes(public_code)`
 * constraint) were triggered against this repository's own PostgreSQL
 * database and their actual `error.meta` shapes were inspected before this
 * check was written. Matching ONLY this exact constraint name is therefore
 * the narrow, evidence-based way to identify the Table Number conflict --
 * a `qr_codes_public_code_key` violation (or any other error) never matches
 * and is always rethrown unmapped.
 */
function isTableNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== 'P2002') {
    return false;
  }

  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;

  return (
    meta?.driverAdapterError?.cause?.constraint?.index ===
    TABLE_NUMBER_UNIQUE_CONSTRAINT
  );
}

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a Table and its initial TABLE QR atomically in one Prisma
   * transaction (Business Foundation L3, settled contract): either both
   * commit or neither does. `status` is always server-derived `ACTIVE` for
   * both rows -- the client cannot choose it, and this holds even when the
   * parent Branch is `INACTIVE` (Branch status is the outer Guest
   * operational gate, not a Table-creation precondition).
   * `QrCode.tableId`/`restaurantId`/`branchId` come only from the
   * just-created Table row and the same authorized context -- never from
   * the DTO. The Prisma `data` objects are built explicitly field-by-field,
   * never a spread of the input. No second Branch authorization query is
   * performed here -- that scope was already resolved by
   * `BranchManagementAccessGuard` before this service is ever called.
   */
  async createTable(input: CreateTableInput): Promise<CreateTableResult> {
    try {
      const data = await this.prisma.$transaction(async (tx) => {
        const table = await tx.table.create({
          data: {
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            tableNumber: input.tableNumber,
            status: 'ACTIVE',
          },
          select: { id: true, tableNumber: true, status: true },
        });

        const qr = await tx.qrCode.create({
          data: {
            publicCode: createQrPublicCode(),
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            tableId: table.id,
            type: 'TABLE',
            status: 'ACTIVE',
          },
          select: { id: true, publicCode: true, status: true },
        });

        return { table, qr };
      });

      return { outcome: 'created', data };
    } catch (error) {
      if (isTableNumberConflict(error)) {
        return { outcome: 'tableNumberConflict' };
      }
      throw error;
    }
  }

  /**
   * Business Foundation O, settled contract: lists all Tables (both
   * `ACTIVE` and `INACTIVE` -- no status filter, this is a management/
   * configuration list) belonging to one already-authorized Branch, fixed
   * `tableNumber` ascending (ordinary database string ordering, no natural-
   * sort). `restaurantId`/`branchId` come only from the caller's
   * already-authorized context; both are included in the query `where`
   * clause as deliberate defense-in-depth even though Branch
   * ownership/scope was already resolved by `BranchManagementAccessGuard`
   * before this service is ever called. No Membership or QR query is
   * performed here.
   */
  async listTables(input: ListTablesInput): Promise<TableListItem[]> {
    return this.prisma.table.findMany({
      where: {
        restaurantId: input.restaurantId,
        branchId: input.branchId,
      },
      orderBy: { tableNumber: 'asc' },
      select: { id: true, tableNumber: true, status: true },
    });
  }

  /**
   * Business Foundation P, settled contract: the Staff-facing Table Detail
   * read. A malformed `tableId` is rejected before ever querying Prisma
   * (`isWellFormedUuid`) -- a value that isn't even a well-formed UUID can
   * never match any real row, and passing it to a `@db.Uuid` column
   * comparison would otherwise fail at the SQL level rather than simply
   * returning no rows. The lookup itself is Tenant/Branch-scoped by
   * construction (`id` + `restaurantId` + `branchId` together in one
   * `findFirst` `where` clause) -- never `findUnique({ id })` followed by
   * an ownership check, so a foreign-Branch or foreign-Restaurant Table can
   * never even be loaded before being hidden. Both `ACTIVE` and `INACTIVE`
   * Tables are returned -- no status filter. The nested `qrCodes` read is
   * narrowed to `restaurantId`/`branchId` (the same authorized values, not
   * merely the `tableId` relation) plus `type: 'TABLE', status: 'ACTIVE'`,
   * with `take: 1` -- this is deliberate defense-in-depth: `QrCode` stores
   * its own direct `restaurantId`/`branchId` context independently of its
   * Table relation, so a malformed/inconsistent row (one whose `tableId`
   * points at the authorized Table but whose own `restaurantId`/`branchId`
   * does not match the authorized context) must never surface as the
   * current QR. Historical `INACTIVE` QR rows and GENERIC QR rows are also
   * never selected in the first place; the database's own partial unique
   * index guarantees at most one context-matching ACTIVE TABLE QR row
   * exists, so `take: 1` never silently drops a second one. The internal
   * `qrCodes` array is never exposed -- it is mapped to a single nullable
   * `qr` field before returning. No Membership query, no Restaurant query,
   * no second Branch query (all already resolved by the guard chain before
   * this service is ever called), and no transaction (a single read).
   */
  async getTableDetail(input: GetTableDetailInput): Promise<TableDetailResult> {
    if (!isWellFormedUuid(input.tableId)) {
      return { outcome: 'notFound' };
    }

    const table = await this.prisma.table.findFirst({
      where: {
        id: input.tableId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
      },
      select: {
        id: true,
        tableNumber: true,
        status: true,
        qrCodes: {
          where: {
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            type: 'TABLE',
            status: 'ACTIVE',
          },
          select: { id: true, publicCode: true, status: true },
          take: 1,
        },
      },
    });

    if (!table) {
      return { outcome: 'notFound' };
    }

    return {
      outcome: 'found',
      data: {
        id: table.id,
        tableNumber: table.tableNumber,
        status: table.status,
        qr: table.qrCodes[0] ?? null,
      },
    };
  }
}
