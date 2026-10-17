'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as importApi from '../../../../../../lib/menu-import/api';
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

  const [file, setFile] = useState<File | null>(null);
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
    if (!file) {
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
        file,
        targetMenuId: menuId,
        languageHint: hint,
      });
      setStage({ kind: 'job', job: await importApi.getImport(restaurantId, started.publicId) });
      setFile(null);
    } catch (caught) {
      fail(caught);
    } finally {
      setSubmitting(false);
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
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer rounded-md border border-input bg-card text-sm text-foreground file:me-3 file:cursor-pointer file:border-0 file:bg-secondary file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-secondary-foreground"
              />
              <p className="text-xs text-muted-foreground">{t('import.upload.fileHint')}</p>
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
};
