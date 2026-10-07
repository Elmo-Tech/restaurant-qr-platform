'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as branchesApi from '../../../../../../lib/branches/api';
import type { BranchItem } from '../../../../../../lib/branches/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { EmptyState } from '../../../../../../components/ui/EmptyState';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { IconQr } from '../../../../../../components/staff/icons';
import { SettingsTabs } from '../SettingsTabs';
import { BranchFormDialog } from './BranchFormDialog';

export interface BranchesWorkspaceProps {
  restaurantId: string;
  /** `branches.manage` -- edit / activate / deactivate. UX only. */
  canManage: boolean;
  /** `branches.manage` AND `allBranches` -- creating a Branch is Restaurant-structural. UX only. */
  canCreate: boolean;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Restaurant Settings -- Branches (FT-12). Lists every Branch the member can
 * see; create / edit through one form dialog; activate / deactivate through
 * the Backend lifecycle routes. There is deliberately no delete: a Branch is
 * only ever deactivated, so its Orders, Tables, Delivery areas and Staff
 * access stay intact. Each mutation settles by re-fetching the list.
 */
export function BranchesWorkspace({ restaurantId, canManage, canCreate }: BranchesWorkspaceProps) {
  const { t } = useStaffI18n();
  const [branches, setBranches] = useState<BranchItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ branchId: string; message: string } | null>(null);
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<'create' | BranchItem | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<BranchItem | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const loadRequestRef = useRef(0);
  const restaurantIdRef = useRef(restaurantId);
  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const loadBranches = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const requestedRestaurantId = restaurantId;
    try {
      const result = await branchesApi.listBranches(restaurantId);
      if (loadRequestRef.current !== requestId || restaurantIdRef.current !== requestedRestaurantId) return;
      setBranches(result);
      setLoadError(null);
    } catch (error) {
      if (loadRequestRef.current !== requestId || restaurantIdRef.current !== requestedRestaurantId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setLoadError(describeError(error));
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadBranches();
    });
  }, [loadBranches]);

  async function activate(branch: BranchItem) {
    if (pendingBranchId) return;
    setPendingBranchId(branch.id);
    setRowError(null);
    setNotice(null);
    try {
      await branchesApi.setBranchActive(restaurantId, branch.id, true);
      setNotice(t('branches.activate.success', { name: branch.name }));
      await loadBranches();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setRowError({ branchId: branch.id, message: describeError(error) });
    } finally {
      setPendingBranchId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget || pendingBranchId) return;
    const branch = deactivateTarget;
    setPendingBranchId(branch.id);
    setDeactivateError(null);
    try {
      await branchesApi.setBranchActive(restaurantId, branch.id, false);
      setDeactivateTarget(null);
      setNotice(t('branches.deactivate.success', { name: branch.name }));
      await loadBranches();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDeactivateError(describeError(error));
    } finally {
      setPendingBranchId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <SettingsTabs restaurantId={restaurantId} active="branches" />

      <SectionCard
        title={t('branches.heading')}
        description={t('branches.description')}
        icon={<IconQr />}
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setNotice(null);
                setFormTarget('create');
              }}
            >
              {t('branches.new')}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {!canManage ? <Alert variant="info">{t('branches.viewOnly')}</Alert> : null}
          {canManage && !canCreate ? <Alert variant="info">{t('branches.createNeedsFullScope')}</Alert> : null}
          {notice ? <Alert variant="success">{notice}</Alert> : null}

          {loadError && !branches ? (
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <span>{loadError}</span>
                <Button variant="secondary" size="sm" onClick={() => void loadBranches()}>
                  {t('common.retry')}
                </Button>
              </div>
            </Alert>
          ) : !branches ? (
            <LoadingState label={t('branches.loading')} />
          ) : branches.length === 0 ? (
            <EmptyState
              compact
              icon={<IconQr />}
              title={t('branches.empty.title')}
              description={t('branches.empty.description')}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {branches.map((branch) => {
                const isPending = pendingBranchId === branch.id;
                const isActive = branch.status === 'ACTIVE';
                return (
                  <li key={branch.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 dir="auto" className="min-w-0 break-words text-base font-semibold text-foreground">
                        {branch.name}
                      </h3>
                      <Badge variant={isActive ? 'success' : 'neutral'} dot>
                        {isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </div>

                    <dl className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <div className="flex gap-2">
                        <dt className="sr-only">{t('branches.form.timezone')}</dt>
                        <dd dir="ltr">{branch.timezone}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="sr-only">{t('branches.form.phone')}</dt>
                        <dd dir="ltr">{branch.phone ?? t('branches.noPhone')}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="sr-only">{t('branches.form.address')}</dt>
                        <dd dir="auto">{branch.address ?? t('branches.noAddress')}</dd>
                      </div>
                    </dl>

                    {rowError?.branchId === branch.id ? <Alert variant="error">{rowError.message}</Alert> : null}

                    {canManage ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            setNotice(null);
                            setFormTarget(branch);
                          }}
                        >
                          {t('branches.action.edit')}
                        </Button>
                        {isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                            disabled={isPending}
                            onClick={() => {
                              setNotice(null);
                              setDeactivateError(null);
                              setDeactivateTarget(branch);
                            }}
                          >
                            {t('branches.action.deactivate')}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => void activate(branch)}>
                            {isPending ? t('common.loading') : t('branches.action.activate')}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      <BranchFormDialog
        restaurantId={restaurantId}
        target={formTarget}
        defaultTimezone={browserTimezone()}
        onClose={() => setFormTarget(null)}
        onSaved={(saved, mode) => {
          setFormTarget(null);
          setNotice(
            t(mode === 'create' ? 'branches.create.success' : 'branches.edit.success', { name: saved.name }),
          );
          void loadBranches();
        }}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t('branches.deactivate.title', { name: deactivateTarget?.name ?? '' })}
        description={t('branches.deactivate.description')}
        confirmLabel={t('branches.deactivate.confirm')}
        isSubmitting={pendingBranchId !== null}
        error={deactivateError}
        onConfirm={() => void confirmDeactivate()}
        onClose={() => {
          setDeactivateTarget(null);
          setDeactivateError(null);
        }}
      />
    </div>
  );
}
