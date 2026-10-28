import { readSheet } from 'read-excel-file/node';
import type { ExtractionInput } from '../menu-import-extractor';
import { XLSX_MIME } from '../menu-import-file';
import { zipIsSafe } from '../menu-import-sheet';
import type { WorkItem } from './gemini-menu-engine';
import {
  pageNote,
  userTextForFile,
  userTextForTable,
} from './menu-extraction-prompt';
import type { FailureCode } from './menu-model-output';

/**
 * What to ask the model for an upload (Menu Import, DIRECT engine, DEC-059): one request per image, one for a
 * PDF, one for an Excel file that is not the template (sent as a text table, like the n8n workflow does).
 */

const MAX_SHEET_ROWS = 800;

export type PreparedWork =
  { ok: true; items: WorkItem[] } | { ok: false; code: FailureCode };

function tableCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();
}

/** The sheet as rows of `a | b | c` text, or why it cannot be read. */
export async function readSheetAsText(
  buffer: Buffer,
): Promise<{ ok: true; text: string } | { ok: false; code: FailureCode }> {
  if (!zipIsSafe(buffer)) return { ok: false, code: 'UNSUPPORTED_FILE' };
  let rows: unknown[][];
  try {
    rows = await readSheet(buffer);
  } catch {
    return { ok: false, code: 'UNSUPPORTED_FILE' };
  }
  const lines = rows
    .slice(0, MAX_SHEET_ROWS + 1)
    .map((row) => row.map(tableCell).join(' | '))
    .filter((line) => line.replace(/[\s|]/g, '') !== '');
  if (lines.length === 0) return { ok: false, code: 'EMPTY_SHEET' };
  return { ok: true, text: lines.join('\n') };
}

const dataUri = (mimeType: string, buffer: Buffer): string =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

export async function prepareWork(
  input: ExtractionInput,
): Promise<PreparedWork> {
  const first = input.files[0];
  if (!first) return { ok: false, code: 'UNSUPPORTED_FILE' };

  if (first.mimeType === 'application/pdf') {
    return {
      ok: true,
      items: [
        {
          content: [
            { type: 'text', text: userTextForFile('pdf') },
            {
              type: 'image_url',
              image_url: { url: dataUri(first.mimeType, first.buffer) },
            },
          ],
        },
      ],
    };
  }

  if (first.mimeType === XLSX_MIME) {
    const sheet = await readSheetAsText(first.buffer);
    if (!sheet.ok) return sheet;
    return {
      ok: true,
      items: [
        { content: [{ type: 'text', text: userTextForTable(sheet.text) }] },
      ],
    };
  }

  if (first.mimeType.startsWith('image/')) {
    return {
      ok: true,
      items: input.files.map((file, index) => ({
        content: [
          {
            type: 'text' as const,
            text:
              userTextForFile('image') + pageNote(index, input.files.length),
          },
          {
            type: 'image_url' as const,
            image_url: { url: dataUri(file.mimeType, file.buffer) },
          },
        ],
      })),
    };
  }

  // A legacy .xls file: the Backend does not open it (MENU_IMPORT_SPEC.md #17A).
  return { ok: false, code: 'UNSUPPORTED_FILE' };
}
