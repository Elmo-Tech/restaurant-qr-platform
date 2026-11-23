import type { Readable } from 'node:stream';
import {
  MAX_IMPORT_TOTAL_BYTES,
  tooLarge,
} from '../../menu-import/menu-import-file';

// Multer's in-memory store limits each file, but not total buffered bytes across files.
const requestBytes = new WeakMap<object, number>();

export const onboardingImportStorage = {
  _handleFile(
    request: object,
    file: { stream: Readable },
    done: (
      error: Error | null,
      data?: { buffer: Buffer; size: number },
    ) => void,
  ) {
    const chunks: Buffer[] = [];
    let size = 0;
    let exceeded = false;
    file.stream.on('data', (chunk: Buffer) => {
      const total = (requestBytes.get(request) ?? 0) + chunk.length;
      requestBytes.set(request, total);
      if (total > MAX_IMPORT_TOTAL_BYTES) exceeded = true;
      if (exceeded) return;
      size += chunk.length;
      chunks.push(chunk);
    });
    file.stream.once('end', () => {
      if (exceeded) done(tooLarge('The files together are larger than 40 MB.'));
      else done(null, { buffer: Buffer.concat(chunks, size), size });
    });
  },
  _removeFile(
    _request: object,
    file: { buffer?: Buffer },
    done: (error: Error | null) => void,
  ) {
    delete file.buffer;
    done(null);
  },
};
