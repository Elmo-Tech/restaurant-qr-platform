/**
 * Which files one Menu Import takes (MENU_IMPORT_SPEC.md #3, DEC-057): 1 to 10 images, or exactly one PDF, or
 * exactly one Excel file; 10 MB each and 40 MB together. These checks only give quick feedback in the picker:
 * the Backend validates the real content and refuses anything else.
 */
export const MAX_IMPORT_FILES = 10;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_TOTAL_BYTES = 40 * 1024 * 1024;

export type ImportFileKind = 'image' | 'pdf' | 'excel';

export function importFileKind(file: Pick<File, 'name' | 'type'>): ImportFileKind | null {
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(name) || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'image';
  }
  if (/\.pdf$/.test(name) || file.type === 'application/pdf') return 'pdf';
  if (/\.(xlsx|xls)$/.test(name)) return 'excel';
  return null;
}

export type SelectionProblem =
  | { code: 'type'; name: string }
  | { code: 'size'; name: string }
  | { code: 'tooMany' }
  | { code: 'mixed' }
  | { code: 'total' };

export interface SelectionResult {
  files: File[];
  /** Why the picked files were not all added; the selection is then left exactly as it was. */
  problem: SelectionProblem | null;
}

const fileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

/**
 * Adds the files the user just picked to the current selection. Picking more images adds them; picking a single PDF
 * or Excel file replaces the selection (and so does picking images while a PDF or Excel file is selected), so the
 * common cases never need an error. Mixed picks and the limits do.
 */
export function addToSelection(current: readonly File[], picked: readonly File[]): SelectionResult {
  const known = new Set(current.map(fileKey));
  const fresh = picked.filter((file) => !known.has(fileKey(file)));
  const unchanged = (problem: SelectionProblem | null): SelectionResult => ({ files: [...current], problem });
  if (fresh.length === 0) return unchanged(null);

  for (const file of fresh) {
    if (importFileKind(file) === null) return unchanged({ code: 'type', name: file.name });
    if (file.size > MAX_IMPORT_FILE_BYTES) return unchanged({ code: 'size', name: file.name });
  }

  const freshKinds = fresh.map((file) => importFileKind(file));
  const freshAreImages = freshKinds.every((kind) => kind === 'image');
  if (!freshAreImages && fresh.length > 1) return unchanged({ code: 'mixed' });

  const keep = freshAreImages && current.every((file) => importFileKind(file) === 'image') ? current : [];
  const next = [...keep, ...fresh];
  if (next.length > MAX_IMPORT_FILES) return unchanged({ code: 'tooMany' });
  if (next.reduce((sum, file) => sum + file.size, 0) > MAX_IMPORT_TOTAL_BYTES) return unchanged({ code: 'total' });
  return { files: next, problem: null };
}

/** "850 KB" / "2.4 MB": plain Latin digits and units, shown left-to-right in both languages. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
