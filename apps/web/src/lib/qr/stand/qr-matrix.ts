import QRCode from 'qrcode';

/**
 * The QR module matrix for `url` (error correction level H, the same as the
 * existing styled QR), as plain booleans. The stand and the QR-only files are
 * both drawn from this one matrix, so there is a single source of truth.
 */
export function createQrMatrix(url: string): boolean[][] {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const rows: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = [];
    for (let col = 0; col < size; col += 1) cells.push(Boolean(qr.modules.get(row, col)));
    rows.push(cells);
  }
  return rows;
}
