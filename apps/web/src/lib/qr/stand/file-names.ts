/** Download file names for the QR stand and the QR-only files. */

export type StandFileKind = 'stand' | 'qr';
export type StandFileExt = 'png' | 'pdf' | 'svg';

/** Letters and digits of any script (Arabic names stay readable), everything else becomes one dash. */
export function fileNameSegment(value: string, fallback = 'qr'): string {
  const cleaned = value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return cleaned || fallback;
}

export function standFileName(input: {
  restaurantName: string;
  kind: StandFileKind;
  ext: StandFileExt;
  template?: string;
  tableNumber?: string | null;
}): string {
  const parts = [fileNameSegment(input.restaurantName, 'restaurant')];
  const table = input.tableNumber?.trim();
  if (table) parts.push(`table-${fileNameSegment(table, 'x')}`);
  if (input.kind === 'stand') {
    parts.push('stand');
    if (input.template) parts.push(fileNameSegment(input.template, 'classic'));
  } else {
    parts.push('qr');
  }
  return `${parts.join('-')}.${input.ext}`;
}

/** One PDF holding a stand page per table. */
export function allTablesFileName(restaurantName: string, template: string): string {
  return `${fileNameSegment(restaurantName, 'restaurant')}-tables-stand-${fileNameSegment(template, 'classic')}.pdf`;
}
