import { Injectable } from '@nestjs/common';
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
}
