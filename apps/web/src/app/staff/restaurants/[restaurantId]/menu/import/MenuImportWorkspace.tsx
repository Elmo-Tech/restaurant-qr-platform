'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as importApi from '../../../../../../lib/menu-import/api';
import {
  addToSelection,
  formatFileSize,
  MAX_IMPORT_FILES,
  type SelectionProblem,
} from '../../../../../../lib/menu-import/files';
import type {
  ApproveResult,
  ImportJob,
  ImportLanguageHint,
} from '../../../../../../lib/menu-import/types';
import * as menuApi from '../../../../../../lib/menu/api';
import type { Menu } from '../../../../../../lib/menu/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { Select } from '../../../../../../components/ui/Select';
import { AiPromptHelp } from './AiPromptHelp';
import { ImportReview } from './ImportReview';
import { MenuReadingAnimation } from './MenuReadingAnimation';

const POLL_INTERVAL_MS = 3_000;
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.xlsx,.xls';

type Stage =
  | { kind: 'loading' }
  | { kind: 'upload' }
  | { kind: 'job'; job: ImportJob }
  | { kind: 'done'; result: ApproveResult };

export function MenuImportWorkspace({
  restaurantId,
  currencyCode,
}: {
  restaurantId: string;
  currencyCode: string;
}) {
  const { t, tp } = useStaffI18n();
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [menus, setMenus] = useState<Menu[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [pickProblem, setPickProblem] = useState<SelectionProblem | null>(null);
  const [menuId, setMenuId] = useState('');
  const [hint, setHint] = useState<ImportLanguageHint>('auto');
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const fail = useCallback((caught: unknown) => {
    if (isUnauthenticatedError(caught)) {
      redirectToLogin();
      return;
    }
    setError(describeError(caught));
  }, []);

  // First load: the menus to import into, and any unfinished import to resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedMenus, jobs] = await Promise.all([
          menuApi.listMenus(restaurantId),
          importApi.listImports(restaurantId),
        ]);
        if (cancelled) return;
        setMenus(loadedMenus);
        setMenuId((loadedMenus.find((m) => m.isPrimary) ?? loadedMenus[0])?.id ?? '');
        const open = jobs.find((j) => j.status === 'PROCESSING' || j.status === 'READY_FOR_REVIEW');
        setStage(open ? { kind: 'job', job: open } : { kind: 'upload' });
      } catch (caught) {
        if (cancelled) return;
        fail(caught);
        setStage({ kind: 'upload' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, fail]);

  // While a job is being read, ask for its status until it settles.
  const processingId = stage.kind === 'job' && stage.job.status === 'PROCESSING' ? stage.job.publicId : null;
  useEffect(() => {
    if (!processingId) return;
    const timer = window.setInterval(() => {
      importApi
        .getImport(restaurantId, processingId)
        .then((job) => {
          if (job.status !== 'PROCESSING') setStage({ kind: 'job', job });
        })
        .catch(fail);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [restaurantId, processingId, fail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError(t('import.upload.noFile'));
      return;
    }
    if (!menuId) {
      setError(t('import.upload.noMenu'));
      return;
    }
    setSubmitting(true);
    try {
      const started = await importApi.startImport(restaurantId, {
        files,
        targetMenuId: menuId,
        languageHint: hint,
      });
      setStage({ kind: 'job', job: await importApi.getImport(restaurantId, started.publicId) });
      setFiles([]);
      setPickProblem(null);
    } catch (caught) {
      fail(caught);
    } finally {
      setSubmitting(false);
    }
  }

  /** Adds what the user picked to the list (several images at once, or one PDF / Excel file). */
  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // Reset, so the same file can be picked again after it was removed from the list.
    event.target.value = '';
    if (picked.length === 0) return;
    const result = addToSelection(files, picked);
    setFiles(result.files);
    setPickProblem(result.problem);
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((unused, position) => position !== index));
    setPickProblem(null);
  }

  function clearFiles() {
    setFiles([]);
    setPickProblem(null);
  }

  function problemText(problem: SelectionProblem): string {
    switch (problem.code) {
      case 'type':
        return t('import.upload.err.type', { name: problem.name });
      case 'size':
        return t('import.upload.err.size', { name: problem.name });
      case 'tooMany':
        return t('import.upload.err.tooMany', { max: MAX_IMPORT_FILES });
      case 'mixed':
        return t('import.upload.err.mixed');
      case 'total':
        return t('import.upload.err.total');
    }
  }

  function backToUpload() {
    setError(null);
    setStage({ kind: 'upload' });
  }

  const menuHref = `/staff/restaurants/${restaurantId}/menu`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('import.title')}
        description={t('import.subtitle')}
        actions={
          <Button asChild variant="secondary">
            <Link href={menuHref}>{t('import.back')}</Link>
          </Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {stage.kind === 'loading' ? <LoadingState label={t('import.loading')} /> : null}

      {stage.kind === 'upload' ? (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex max-w-xl flex-col gap-5">
            <FormField label={t('import.upload.file')} htmlFor="import-file">
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept={ACCEPT}
                multiple
                onChange={handlePick}
                className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-secondary-foreground"
              />
              <p className="text-xs text-muted-foreground">{t('import.upload.fileHint')}</p>
              <p className="text-xs text-muted-foreground">
                {t('import.upload.templateHint')}{' '}
                <a
                  href="/templates/menu-import-template.xlsx"
                  download
                  className="font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  {t('import.upload.template')}
                </a>
              </p>
              <AiPromptHelp />
              {pickProblem ? (
                <p role="alert" className="text-sm text-destructive" dir="auto">
                  {problemText(pickProblem)}
                </p>
              ) : null}
              {files.length > 0 ? (
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {t('import.upload.selected', { count: files.length, max: MAX_IMPORT_FILES })}
                    </p>
                    {files.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" onClick={clearFiles}>
                        {t('import.upload.clear')}
                      </Button>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-border rounded-md border border-border bg-card">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}|${file.size}|${file.lastModified}`}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground" dir="auto">
                            {file.name}
                          </span>
                          <span className="block text-xs text-muted-foreground" dir="ltr">
                            {formatFileSize(file.size)}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          aria-label={t('import.upload.removeNamed', { name: file.name })}
                        >
                          {t('import.upload.remove')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </FormField>

            <FormField label={t('import.upload.menu')} htmlFor="import-menu">
              <Select id="import-menu" value={menuId} onChange={(event) => setMenuId(event.target.value)}>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.translation.name || menu.nameInternal}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label={t('import.upload.language')} htmlFor="import-language">
              <Select
                id="import-language"
                value={hint}
                onChange={(event) => setHint(event.target.value as ImportLanguageHint)}
              >
                <option value="auto">{t('import.upload.languageAuto')}</option>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </Select>
            </FormField>

            <p className="text-sm text-muted-foreground">{t('import.upload.note')}</p>

            <div>
              <Button type="submit" disabled={submitting || menus.length === 0}>
                {submitting ? t('import.upload.submitting') : t('import.upload.submit')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {stage.kind === 'job' && stage.job.status === 'PROCESSING' ? (
        <Card>
          <div role="status" className="flex flex-col gap-2 py-4">
            <h2 className="text-center text-lg font-semibold text-foreground">{t('import.processing.title')}</h2>
            <MenuReadingAnimation />
            <p className="text-center text-sm text-muted-foreground">{t('import.processing.body')}</p>
            <p className="text-center text-xs text-muted-foreground" dir="auto">
              {t('import.processing.file', { name: stage.job.sourceFileName })}
            </p>
          </div>
        </Card>
      ) : null}

      {stage.kind === 'job' && stage.job.status === 'FAILED' ? (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('import.failed.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                (stage.job.errorCode && `import.failed.${stage.job.errorCode}` in knownFailures
                  ? `import.failed.${stage.job.errorCode}`
                  : 'import.failed.default') as MessageKey,
              )}
            </p>
            <Button onClick={backToUpload}>{t('import.failed.again')}</Button>
          </div>
        </Card>
      ) : null}

      {stage.kind === 'job' && stage.job.status === 'READY_FOR_REVIEW' ? (
        <ImportReview
          restaurantId={restaurantId}
          publicId={stage.job.publicId}
          currencyCode={currencyCode}
          onApproved={(result) => setStage({ kind: 'done', result })}
          onDiscarded={backToUpload}
        />
      ) : null}

      {stage.kind === 'job' && (stage.job.status === 'APPROVED' || stage.job.status === 'DISCARDED') ? (
        <Button onClick={backToUpload}>{t('import.approve.another')}</Button>
      ) : null}

      {stage.kind === 'done' ? (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <Alert variant="success" className="w-full">
              {tp('import.approve.done', stage.result.productsCreated)}
              {stage.result.categoriesCreated > 0
                ? ` ${tp('import.approve.doneCategories', stage.result.categoriesCreated)}`
                : ''}
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={menuHref}>{t('import.approve.viewMenu')}</Link>
              </Button>
              <Button variant="secondary" onClick={backToUpload}>
                {t('import.approve.another')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** Failure codes that have their own wording; anything else uses the generic text. */
const knownFailures: Record<string, true> = {
  'import.failed.EXTRACTION_TIMEOUT': true,
  'import.failed.AI_UNAVAILABLE': true,
  'import.failed.EMPTY_RESULT': true,
  'import.failed.EMPTY_SHEET': true,
  'import.failed.UNSUPPORTED_FILE': true,
  'import.failed.FILE_TOO_LARGE': true,
  'import.failed.TRUNCATED_OUTPUT': true,
  'import.failed.MODEL_BUSY': true,
};
