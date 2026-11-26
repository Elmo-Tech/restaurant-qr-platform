'use client';

import { useEffect, useRef, useState } from 'react';
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { EmptyState } from '../../../../../../components/ui/EmptyState';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { Select } from '../../../../../../components/ui/Select';
import { ApiError } from '../../../../../../lib/api/errors';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localizedName } from '../../../../../../lib/i18n/localized-name';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import { getPromotion, listPromotions, listPromotionTargets, promotionScopes, promotionStatuses, runPromotionAction,
  type Promotion, type PromotionAction, type PromotionFilters, type PromotionsPage, type PromotionTargets,
} from '../../../../../../lib/promotions/api';
import { hasUuidShape } from '../../../../../../lib/promotions/draft';
import { promotionError } from '../../../../../../lib/promotions/errors';
import { MenuSectionTabs } from '../MenuSectionTabs';
import { PromotionEditor } from './PromotionEditor';

const statusTone = { ACTIVE: 'success', INACTIVE: 'neutral', ARCHIVED: 'neutral' } as const;
const actionLabels: Record<PromotionAction, MessageKey> = {
  activate: 'common.activate', deactivate: 'common.deactivate', archive: 'promotions.archive', delete: 'common.delete',
};
const actionNotices: Record<PromotionAction, MessageKey> = {
  activate: 'promotions.activateDone', deactivate: 'promotions.deactivateDone', archive: 'promotions.archiveDone', delete: 'promotions.deleteDone',
};

type Load<T> = { value: T } | { error: MessageKey };

function MoneyDiscount({ row, currencyCode }: { row: Promotion; currencyCode: string }) {
  return <bdi dir="ltr" className="tabular-nums">{row.discountType === 'PERCENTAGE' ? `${row.value}%` : `${row.value} ${currencyCode}`}</bdi>;
}

function PromotionParticipation({ row, targets }: { row: Promotion; targets: PromotionTargets | null }) {
  const { t, locale } = useStaffI18n();
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
  const formatDate = (value: string) => date.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const schedule = row.startsOn && row.endsOn
    ? t('promotions.listSchedule.range', { start: formatDate(row.startsOn), end: formatDate(row.endsOn) })
    : row.startsOn ? t('promotions.listSchedule.start', { start: formatDate(row.startsOn) })
    : row.endsOn ? t('promotions.listSchedule.end', { end: formatDate(row.endsOn) })
    : t('promotions.listSchedule.none');
  const branches = row.branchIds.map((id) => targets?.branches.find((branch) => branch.id === id))
    .filter((branch) => branch !== undefined).map((branch) => localizedName(branch, locale));
  return (
    <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <div><dt className="sr-only">{t('promotions.schedule')}</dt><dd>{schedule}</dd></div>
      <div className="min-w-0"><dt className="sr-only">{t('promotions.branchTargets')}</dt><dd className="break-words">
        {!row.branchIds.length ? t('promotions.listBranches.all')
          : branches.length === row.branchIds.length && branches.length <= 2 ? branches.map((name, index) => <span key={`${name}-${index}`}>{index ? ' · ' : ''}<bdi>{name}</bdi></span>)
          : t('promotions.listBranches.selected', { count: row.branchIds.length })}
      </dd></div>
      {row.priority !== 100 ? <div><dt className="sr-only">{t('promotions.priority')}</dt><dd>{t('promotions.listPriority', { priority: row.priority })}</dd></div> : null}
    </dl>
  );
}

export function PromotionsWorkspace({ restaurantId, currencyCode, canManage, offersEnabled, canViewProducts, initialZoneId }: {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  offersEnabled: boolean;
  canViewProducts: boolean;
  initialZoneId?: string;
}) {
  const { t, locale } = useStaffI18n();
  const [filters, setFilters] = useState<PromotionFilters>({ page: 1, zoneId: initialZoneId?.toLowerCase() });
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [targetsRevision, setTargetsRevision] = useState(0);
  const [list, setList] = useState<{ key: string; result: Load<PromotionsPage> } | null>(null);
  const [targets, setTargets] = useState<PromotionTargets | null>(null);
  const [targetLoad, setTargetLoad] = useState<{ revision: number; error?: MessageKey } | null>(null);
  const [selection, setSelection] = useState<{ mode: 'create' } | { mode: 'existing'; promotion: Promotion } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ promotion: Promotion; action: PromotionAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [operationError, setOperationError] = useState<MessageKey | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusToList = useRef(false);

  const key = JSON.stringify([filters, revision]);
  const loaded = list?.key === key ? list.result : null;
  const targetsResult = targetLoad?.revision === targetsRevision ? targetLoad : null;
  const knownZone = filters.zoneId && targets?.deliveryZones.find((row) => row.id === filters.zoneId);
  const invalidZone = Boolean(filters.zoneId && (!hasUuidShape(filters.zoneId) || (targets && !knownZone)));

  useEffect(() => {
    if (invalidZone) return;
    let current = true;
    listPromotions(restaurantId, filters).then(
      (value) => {
        if (!current) return;
        const lastPage = Math.max(1, Math.ceil(value.meta.total / value.meta.pageSize));
        if (filters.page > lastPage) setFilters({ ...filters, page: lastPage });
        else setList({ key, result: { value } });
      },
      (caught: unknown) => { if (current) setList({ key, result: { error: promotionError(caught) } }); },
    );
    return () => { current = false; };
  }, [restaurantId, invalidZone, filters, key]);

  useEffect(() => {
    let current = true;
    listPromotionTargets(restaurantId).then(
      (value) => { if (current) {
        setTargets(value);
        setTargetLoad({ revision: targetsRevision });
      } },
      (caught: unknown) => { if (current) setTargetLoad({ revision: targetsRevision, error: promotionError(caught) }); },
    );
    return () => { current = false; };
  }, [restaurantId, targetsRevision]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === (filters.search ?? '')) return;
    const timeout = window.setTimeout(() => setFilters((prior) => ({ ...prior, search: normalized || undefined, page: 1 })), 250);
    return () => window.clearTimeout(timeout);
  }, [search, filters.search]);

  const opened = selection !== null;
  useEffect(() => {
    if (opened) titleRef.current?.focus();
    else if (returnFocusToList.current) {
      returnFocusToList.current = false;
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [opened]);

  function refresh() { setRevision((value) => value + 1); }
  function returnToList() { setSelection(null); setOperationError(null); }
  function open(next: NonNullable<typeof selection>) {
    returnFocusToList.current = true;
    setNotice(null);
    setOperationError(null);
    setSelection(next);
  }

  async function reloadPromotion(promotion: Promotion) {
    setReloading(true);
    try {
      const latest = await getPromotion(restaurantId, promotion.id);
      setSelection({ mode: 'existing', promotion: latest });
      setEditorRevision((value) => value + 1);
      setOperationError(null);
      setTargetsRevision((value) => value + 1);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setSelection(null);
      setOperationError(promotionError(caught));
    } finally {
      refresh();
      setReloading(false);
    }
  }

  async function mutate() {
    if (!pendingAction || busy) return;
    const { promotion, action } = pendingAction;
    setBusy(true);
    setOperationError(null);
    try {
      await runPromotionAction(restaurantId, promotion, action);
      setNotice(actionNotices[action]);
      setSelection(null);
      refresh();
    } catch (caught) {
      const error = promotionError(caught);
      if (caught instanceof ApiError && caught.code === 'PROMOTION_HAS_HISTORICAL_REFERENCES') {
        // A racing order takes away Delete but leaves Archive available.
        setSelection({ mode: 'existing', promotion: { ...promotion, canDelete: false } });
        refresh();
      } else {
        await reloadPromotion(promotion);
      }
      setOperationError(error);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  const promotion = selection?.mode === 'existing' ? selection.promotion : null;
  const page = loaded && 'value' in loaded ? loaded.value : null;
  const pageCount = page ? Math.max(1, Math.ceil(page.meta.total / page.meta.pageSize)) : 1;
  const filtered = Boolean(filters.scope || filters.status || filters.search || filters.zoneId);
  const actionBar = canManage && promotion ? (
    <div className="flex flex-wrap items-center gap-2">
      {promotion.status !== 'ARCHIVED' ? (
        <>
          <Button type="button" variant="secondary" onClick={() => setPendingAction({ promotion, action: promotion.status === 'ACTIVE' ? 'deactivate' : 'activate' })}>
            {t(actionLabels[promotion.status === 'ACTIVE' ? 'deactivate' : 'activate'])}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPendingAction({ promotion, action: 'archive' })}>{t('promotions.archive')}</Button>
        </>
      ) : null}
      {promotion.canDelete ? (
        <Button type="button" variant="ghost" className="text-destructive" onClick={() => setPendingAction({ promotion, action: 'delete' })}>{t('common.delete')}</Button>
      ) : <span className="text-xs text-muted-foreground">{t('promotions.historyLocked')}</span>}
    </div>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-5">
      {!opened ? <MenuHubBackLink restaurantId={restaurantId} parent="hub" /> : null}
      {!opened ? <PageHeader title={t('promotions.title')} description={t('promotions.description')} actions={canManage && targets ? (
        <Button onClick={() => open({ mode: 'create' })}>{t('promotions.create')}</Button>
      ) : undefined} /> : null}
      {!opened ? <MenuSectionTabs restaurantId={restaurantId} active="promotions" promotionsEnabled offersEnabled={offersEnabled} canViewProducts={canViewProducts} /> : null}
      {notice ? <Alert variant="success">{t(notice)}</Alert> : null}
      {operationError ? <Alert variant="error">{t(operationError)}</Alert> : null}
      {targetsResult?.error ? (
        <Alert variant="error"><div className="flex flex-wrap items-center gap-2">{t(targetsResult.error)} <Button type="button" variant="secondary" onClick={() => setTargetsRevision((value) => value + 1)}>{t('common.retry')}</Button></div></Alert>
      ) : null}
      {opened ? (
        <>
          <h1 ref={titleRef} tabIndex={-1} className="text-[28px] font-bold outline-none">
            {t(selection.mode === 'create' ? 'promotions.create' : canManage && promotion?.status !== 'ARCHIVED' ? 'promotions.edit' : 'promotions.details')}
          </h1>
          {targets ? (
            <PromotionEditor key={promotion ? `${promotion.id}:${promotion.updatedAt}:${editorRevision}` : 'new'} restaurantId={restaurantId} original={promotion} targets={targets}
              initialZoneId={selection.mode === 'create' && knownZone ? knownZone.id : undefined}
              currencyCode={currencyCode} canEdit={canManage && promotion?.status !== 'ARCHIVED'}
              onBack={returnToList} onReload={reloadPromotion} reloading={reloading}
              onReloadTargets={() => setTargetsRevision((value) => value + 1)} targetsRefreshing={!targetsResult}
              onUncertainCreate={() => { setFilters({ page: 1 }); setSearch(''); refresh(); returnToList(); setOperationError('promotions.uncertainCreate'); }}
              onSaved={(saved) => { setNotice(promotion ? 'promotions.saved' : 'promotions.created'); setSelection({ mode: 'existing', promotion: saved }); refresh(); }}
              actionBar={actionBar}
            />
          ) : <><Button variant="secondary" className="self-start" onClick={returnToList}>{t('promotions.viewList')}</Button>{!targetsResult ? <LoadingState /> : null}</>}
        </>
      ) : (
        <>
          {!canManage ? <Alert variant="info">{t('promotions.readOnly')}</Alert> : null}
          <Card className="p-4">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
              <FormField label={t('promotions.search')} htmlFor="promo-search">
                <Input ref={searchRef} id="promo-search" type="search" dir="auto" maxLength={120} className="h-11" value={search} onChange={(e) => setSearch(e.target.value)} />
              </FormField>
              <FormField label={t('common.status')} htmlFor="promo-status">
                <Select id="promo-status" value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, page: 1, status: promotionStatuses.find((value) => value === e.target.value) })}>
                  <option value="">{t('promotions.allStatuses')}</option>
                  {promotionStatuses.map((status) => <option key={status} value={status}>{t(`promotions.status.${status}`)}</option>)}
                </Select>
              </FormField>
              <FormField label={t('promotions.scope')} htmlFor="promo-scope">
                <Select id="promo-scope" value={filters.scope ?? ''} onChange={(e) => setFilters({ ...filters, page: 1, scope: promotionScopes.find((value) => value === e.target.value) })}>
                  <option value="">{t('promotions.allScopes')}</option>
                  {promotionScopes.map((scope) => <option key={scope} value={scope}>{t(`promotions.scope.${scope}`)}</option>)}
                </Select>
              </FormField>
              <FormField label={t('promotions.linkedZone')} htmlFor="promo-zone">
                <Select id="promo-zone" value={filters.zoneId ?? ''} onChange={(e) => setFilters({ ...filters, page: 1, zoneId: e.target.value || undefined })}>
                  <option value="">{t('promotions.anyZone')}</option>
                  {filters.zoneId && !knownZone ? <option value={filters.zoneId}>{t('promotions.unavailableSelection')}</option> : null}
                  {targets?.deliveryZones.map((zone) => {
                    const branch = targets.branches.find((row) => row.id === zone.branchId);
                    return <option key={zone.id} value={zone.id}>{localizedName(zone, locale)}{branch ? ` · ${localizedName(branch, locale)}` : ''}</option>;
                  })}
                </Select>
              </FormField>
            </div>
            {filtered || search ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{filters.zoneId ? t('promotions.zoneFilterHint') : null}</p>
                <Button type="button" variant="ghost" onClick={() => { setSearch(''); setFilters({ page: 1 }); }}>{t('promotions.reset')}</Button>
              </div>
            ) : null}
          </Card>
          {invalidZone ? <Alert variant="warning">{t('promotions.zoneUnavailable')}</Alert> : !loaded ? <LoadingState /> : 'error' in loaded ? (
            <Alert variant="error"><div className="flex flex-wrap items-center gap-2">{t(loaded.error)} <Button type="button" variant="secondary" onClick={refresh}>{t('common.retry')}</Button></div></Alert>
          ) : loaded.value.data.length === 0 ? (
            <EmptyState title={t(filtered ? 'promotions.emptyFiltered' : 'promotions.empty')} description={t(filtered ? 'promotions.emptyFilteredHelp' : 'promotions.emptyHelp')} />
          ) : (
            <ul className="grid min-w-0 gap-2" aria-label={t('promotions.title')}>
              {loaded.value.data.map((row) => {
                const title = row.translations.find((entry) => entry.locale === locale)?.title ?? row.translations.find((entry) => entry.locale === targets?.defaultLocale)?.title ?? row.translations[0]?.title;
                const zones = row.deliveryZoneIds.flatMap((id) => {
                  const zone = targets?.deliveryZones.find((option) => option.id === id);
                  return zone ? [localizedName(zone, locale)] : [];
                });
                return (
                  <li key={row.id}>
                    <Card className="grid min-w-0 gap-3 p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-center">
                      <div className="min-w-0 space-y-1">
                        <h2 className="break-words font-semibold" dir="auto">{row.internalName}</h2>
                        {title && title !== row.internalName ? <p dir="auto" className="break-words text-sm text-muted-foreground">{title}</p> : null}
                        {row.status !== 'ARCHIVED' ? <PromotionParticipation row={row} targets={targets} /> : null}
                        {row.status !== 'ARCHIVED' && zones.length ? <p className="break-words text-xs text-muted-foreground">{zones.slice(0, 3).map((name, index) => <span key={`${name}-${index}`}>{index ? ' · ' : ''}<bdi>{name}</bdi></span>)}{zones.length > 3 ? ` +${zones.length - 3}` : ''}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant={statusTone[row.status]} dot>{t(`promotions.status.${row.status}`)}</Badge>
                        <span>{t(`promotions.scope.${row.scope}`)}</span><MoneyDiscount row={row} currencyCode={currencyCode} />
                      </div>
                      <Button variant="secondary" className="h-11 justify-self-start sm:justify-self-end" onClick={() => open({ mode: 'existing', promotion: row })}>
                        {t(canManage && row.status !== 'ARCHIVED' ? 'common.edit' : 'promotions.view')}
                      </Button>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          {page && pageCount > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" disabled={page.meta.page === 1} onClick={() => setFilters({ ...filters, page: page.meta.page - 1 })}>{t('promotions.prev')}</Button>
              <span className="text-sm text-muted-foreground">{t('promotions.page', { page: page.meta.page, pages: pageCount })}</span>
              <Button variant="secondary" disabled={page.meta.page >= pageCount} onClick={() => setFilters({ ...filters, page: page.meta.page + 1 })}>{t('promotions.next')}</Button>
            </div>
          ) : null}
        </>
      )}
      <Dialog open={pendingAction !== null} title={pendingAction ? t(actionLabels[pendingAction.action]) : ''}
        subtitle={pendingAction?.promotion.internalName} submitLabel={busy ? t('common.saving') : pendingAction ? t(actionLabels[pendingAction.action]) : ''}
        isSubmitting={busy} submitVariant={pendingAction?.action === 'archive' || pendingAction?.action === 'delete' ? 'danger' : 'primary'}
        onClose={() => setPendingAction(null)} onSubmit={(event) => { event.preventDefault(); void mutate(); }}>
        {pendingAction ? <p>{t(`promotions.confirm.${pendingAction.action}`)}</p> : null}
      </Dialog>
    </div>
  );
}
