import {
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MenuImportSourceType } from '../generated/prisma/client';

/** MENU_IMPORT_SPEC.md #3 / #21: the only files the import accepts, checked by CONTENT, never by the client's word. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export interface UploadedMenuFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface InspectedMenuFile {
  sourceType: MenuImportSourceType;
  /** The type the bytes really are (not what the client claimed). */
  mimeType: string;
  /** Display only: no path, no control characters, capped. Never used as a storage path. */
  safeName: string;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return (
    buffer.length >= bytes.length &&
    bytes.every((byte, index) => buffer[index] === byte)
  );
}

function invalid(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    error: {
      code: 'IMPORT_FILE_INVALID',
      message:
        'Upload a JPG, PNG or WEBP image, a PDF, or an Excel file (.xlsx / .xls).',
    },
  });
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned === '' ? 'menu' : cleaned;
}

/** Throws the stable import errors; returns what the file really is. */
export function inspectMenuFile(
  file: UploadedMenuFile | undefined,
): InspectedMenuFile {
  if (!file || !file.buffer || file.buffer.length === 0) throw invalid();
  if (file.buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new PayloadTooLargeException({
      error: {
        code: 'IMPORT_FILE_TOO_LARGE',
        message: 'The file is larger than 10 MB.',
      },
    });
  }
  const buffer = file.buffer;
  const safeName = sanitizeFileName(file.originalname ?? '');
  const lowerName = safeName.toLowerCase();

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { sourceType: 'IMAGE', mimeType: 'image/jpeg', safeName };
  }
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { sourceType: 'IMAGE', mimeType: 'image/png', safeName };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return { sourceType: 'IMAGE', mimeType: 'image/webp', safeName };
  }
  if (buffer.toString('latin1', 0, 5) === '%PDF-') {
    return { sourceType: 'PDF', mimeType: 'application/pdf', safeName };
  }
  // Excel containers: a ZIP (.xlsx) or an OLE2 compound file (.xls). A bare container is
  // ambiguous (a .docx is also a ZIP), so the extension must agree with the signature.
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) &&
    lowerName.endsWith('.xlsx')
  ) {
    return { sourceType: 'SPREADSHEET', mimeType: XLSX_MIME, safeName };
  }
  if (
    startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) &&
    lowerName.endsWith('.xls')
  ) {
    return { sourceType: 'SPREADSHEET', mimeType: XLS_MIME, safeName };
  }
  throw invalid();
}
