/** Menu Import (DEC-040, MENU_IMPORT_SPEC.md #20): the Staff API shapes. Money is always a string. */

export type ImportStatus =
  | 'PROCESSING'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'DISCARDED'
  | 'FAILED';

export type ImportLanguageHint = 'auto' | 'ar' | 'en';

export interface ImportJob {
  publicId: string;
  status: ImportStatus;
  sourceType: 'IMAGE' | 'PDF' | 'SPREADSHEET';
  sourceFileName: string;
  targetMenuId: string;
  detectedLocales: string[];
  errorCode: string | null;
  warnings: string[];
  startedAt: string;
  finishedAt: string | null;
  approvedAt: string | null;
}

export type DraftFlag =
  | 'MISSING_PRICE'
  | 'MISSING_NAME'
  | 'LOW_CONFIDENCE'
  | 'ALREADY_EXISTS'
  | 'MISSING_TRANSLATION';

export interface DraftSize {
  names: Record<string, string>;
  price: string;
}

export interface DraftProduct {
  id: string;
  included: boolean;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  price: string | null;
  sizes: DraftSize[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  flags: DraftFlag[];
  matchedProductId: string | null;
}

export interface DraftCategory {
  id: string;
  included: boolean;
  names: Record<string, string>;
  matchedCategoryId: string | null;
  useExisting: boolean;
  flags: DraftFlag[];
  products: DraftProduct[];
}

export interface ImportDraft {
  job: ImportJob;
  defaultLocale: string;
  activeLocales: string[];
  categories: DraftCategory[];
  blockerCount: number;
}

export interface ApproveResult {
  categoriesCreated: number;
  productsCreated: number;
}
