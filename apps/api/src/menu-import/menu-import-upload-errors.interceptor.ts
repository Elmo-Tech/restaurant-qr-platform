import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { invalid, tooLarge } from './menu-import-file';

/** The upload parser's own refusals carry a plain-string `error` field; our envelopes carry an object. */
function fromUploadParser(error: unknown): HttpException | null {
  if (!(error instanceof HttpException)) return null;
  const body = error.getResponse();
  const plain =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string';
  return plain ? error : null;
}

/**
 * Turns the upload parser's refusals (a file over the size limit, too many files) into the stable import errors
 * instead of returning raw framework exceptions (CLAUDE.md #49, #92). It must run OUTSIDE the file interceptor
 * (listed before it). Validation errors keep their own shape and pass through untouched.
 */
@Injectable()
export class MenuImportUploadErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        const parserError = fromUploadParser(error);
        if (parserError instanceof PayloadTooLargeException) {
          return throwError(() => tooLarge('The file is larger than 10 MB.'));
        }
        if (parserError instanceof BadRequestException) {
          return throwError(() =>
            invalid('Upload at most 10 images, or one PDF, or one Excel file.'),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}
