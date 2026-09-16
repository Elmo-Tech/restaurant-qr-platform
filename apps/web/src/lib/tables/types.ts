export type TableStatus = 'ACTIVE' | 'INACTIVE';
export type TableQrStatus = 'ACTIVE' | 'INACTIVE';

/** Mirrors the Backend's `TableDetailQr`/`CreatedTable.qr` shape exactly -- never `restaurantId`, `branchId`, `tableId`, `type`, or timestamps. */
export interface TableQr {
  id: string;
  publicCode: string;
  status: TableQrStatus;
}

/** Mirrors the Backend's `TableListItem` exactly (API_CONVENTIONS.md #114A). */
export interface TableListItem {
  id: string;
  tableNumber: string;
  status: TableStatus;
}

/**
 * The Web app's own view-model row, not a Backend response shape: `qr` is
 * merged in client-side from `getTableDetail` per Table (Section 17 --
 * `listTables` deliberately performs no QR query at all, a settled,
 * tested Backend contract; the smallest-necessary way to show QR status
 * per row without changing that contract is to reuse the existing Detail
 * read already built for exactly this). `null` means "no ACTIVE TABLE QR
 * exists" (Section 14) -- never fabricated client-side.
 */
export interface TableRow extends TableListItem {
  qr: TableQr | null;
}

/** Mirrors the Backend's `CreatedTable` exactly (API_CONVENTIONS.md #114). */
export interface CreatedTable {
  table: { id: string; tableNumber: string; status: TableStatus };
  qr: TableQr;
}
