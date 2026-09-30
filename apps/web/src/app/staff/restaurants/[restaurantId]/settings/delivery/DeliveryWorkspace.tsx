'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as deliveryApi from '../../../../../../lib/delivery/api';
import type {
  DeliveryBranch,
  DeliveryZone,
} from '../../../../../../lib/delivery/api';
import { ApiError } from '../../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SettingsTabs } from '../SettingsTabs';

/** Mirrors the Backend's accepted decimal-string shape -- helpful client validation only, never authoritative. */
const MONEY_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;

export interface DeliveryWorkspaceProps {
  restaurantId: string;
  currencyCode: string;
  /** `restaurant.manage` AND `allBranches === true`. */
  canManage: boolean;
  hasRestaurantManagePermission: boolean;
}

/**
 * FT-8: Restaurant Settings -> Delivery. Each Branch lists its Delivery zones
 * (name, fee, minimum order, active/inactive) with add/edit/deactivate, and
 * delete only when no Order has ever used the zone. A Branch is offered for
 * Delivery to Guests only while it is ACTIVE and has at least one ACTIVE
 * zone. No nested `<form>` anywhere (plain buttons with explicit handlers).
 */
export function DeliveryWorkspace({
  restaurantId,
  currencyCode,
  canManage,
  hasRestaurantManagePermission: hasManagePermission,
}: DeliveryWorkspaceProps) {
  const { t } = useStaffI18n();
  const [branches, setBranches] = useState<DeliveryBranch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBranches(await deliveryApi.listDeliveryBranches(restaurantId));
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function replaceZone(branchId: string, zone: DeliveryZone) {
    setBranches((prev) =>
      (prev ?? []).map((branch) =>
        branch.id === branchId
          ? { ...branch, zones: branch.zones.map((z) => (z.id === zone.id ? zone : z)) }
          : branch,
      ),
    );
  }

  function addZone(branchId: string, zone: DeliveryZone) {
    setBranches((prev) =>
      (prev ?? []).map((branch) =>
        branch.id === branchId ? { ...branch, zones: [...branch.zones, zone] } : branch,
      ),
    );
  }

  function removeZone(branchId: string, zoneId: string) {
    setBranches((prev) =>
      (prev ?? []).map((branch) =>
        branch.id === branchId
          ? { ...branch, zones: branch.zones.filter((z) => z.id !== zoneId) }
          : branch,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.delivery.subtitle')} />

      <SettingsTabs restaurantId={restaurantId} active="delivery" />

      {!canManage && hasManagePermission ? (
        <Alert variant="info">{t('settings.delivery.needsFullScope')}</Alert>
      ) : null}

      <p className="text-sm text-muted-foreground">{t('settings.delivery.rule')}</p>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {branches === null && !error ? <LoadingState label={t('settings.delivery.loading')} /> : null}

      {branches !== null && branches.length === 0 ? (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          {t('settings.delivery.noBranches')}
        </Card>
      ) : null}

      {branches?.map((branch) => (
        <BranchCard
          key={branch.id}
          restaurantId={restaurantId}
          currencyCode={currencyCode}
          canManage={canManage}
          branch={branch}
          onZoneChanged={(zone) => replaceZone(branch.id, zone)}
          onZoneCreated={(zone) => addZone(branch.id, zone)}
          onZoneDeleted={(zoneId) => removeZone(branch.id, zoneId)}
        />
      ))}
    </div>
  );
}

function BranchCard({
  restaurantId,
  currencyCode,
  canManage,
  branch,
  onZoneChanged,
  onZoneCreated,
  onZoneDeleted,
}: {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  branch: DeliveryBranch;
  onZoneChanged: (zone: DeliveryZone) => void;
  onZoneCreated: (zone: DeliveryZone) => void;
  onZoneDeleted: (zoneId: string) => void;
}) {
  const { t } = useStaffI18n();
  const [isAdding, setIsAdding] = useState(false);
  const activeZones = branch.zones.filter((zone) => zone.status === 'ACTIVE').length;
  const offered = branch.status === 'ACTIVE' && activeZones > 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 dir="auto" className="text-base font-semibold text-foreground">
            {branch.name}
          </h2>
          {branch.status === 'INACTIVE' ? (
            <Badge variant="neutral">{t('settings.delivery.branchInactive')}</Badge>
          ) : null}
        </div>
        <Badge variant={offered ? 'success' : 'neutral'}>
          {offered ? t('settings.delivery.available') : t('settings.delivery.notOffered')}
        </Badge>
      </div>

      {branch.zones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.delivery.noAreas')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {branch.zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              restaurantId={restaurantId}
              currencyCode={currencyCode}
              canManage={canManage}
              zone={zone}
              onChanged={onZoneChanged}
              onDeleted={onZoneDeleted}
            />
          ))}
        </ul>
      )}

      {isAdding ? (
        <ZoneForm
          currencyCode={currencyCode}
          submitLabel={t('settings.delivery.addAreaSubmit')}
          onCancel={() => setIsAdding(false)}
          onSubmit={async (values) => {
            const created = await deliveryApi.createDeliveryZone(restaurantId, branch.id, values);
            onZoneCreated(created);
            setIsAdding(false);
          }}
        />
      ) : (
        <div>
          <Button variant="secondary" disabled={!canManage} onClick={() => setIsAdding(true)}>
            {t('settings.delivery.addArea')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ZoneRow({
  restaurantId,
  currencyCode,
  canManage,
  zone,
  onChanged,
  onDeleted,
}: {
  restaurantId: string;
  currencyCode: string;
  canManage: boolean;
  zone: DeliveryZone;
  onChanged: (zone: DeliveryZone) => void;
  onDeleted: (zoneId: string) => void;
}) {
  const { t } = useStaffI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      if (err instanceof ApiError && err.code === 'DELIVERY_ZONE_HAS_ORDERS') {
        setError(t('settings.delivery.hasOrders'));
      } else {
        setError(describeError(err));
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (isEditing) {
    return (
      <li>
        <ZoneForm
          currencyCode={currencyCode}
          initial={zone}
          submitLabel={t('common.save')}
          onCancel={() => setIsEditing(false)}
          onSubmit={async (values) => {
            const updated = await deliveryApi.updateDeliveryZone(restaurantId, zone.id, values);
            onChanged(updated);
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  const minimum =
    zone.minimumOrder === '0.00'
      ? t('settings.delivery.noMinimum')
      : t('settings.delivery.minimum', { amount: zone.minimumOrder, currency: currencyCode });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <bdi dir="auto">{zone.name}</bdi>
          {zone.status === 'INACTIVE' ? <Badge variant="neutral">{t('settings.delivery.inactive')}</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('settings.delivery.feeLine', { fee: zone.deliveryFee, currency: currencyCode })} · {minimum}
        </p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={!canManage || isBusy} onClick={() => setIsEditing(true)}>
          {t('common.edit')}
        </Button>
        <Button
          variant="secondary"
          disabled={!canManage || isBusy}
          onClick={() =>
            void run(async () => {
              const updated = await deliveryApi.updateDeliveryZone(restaurantId, zone.id, {
                status: zone.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
              });
              onChanged(updated);
            })
          }
        >
          {zone.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}
        </Button>
        {zone.canDelete ? (
          <Button
            variant="danger"
            disabled={!canManage || isBusy}
            onClick={() => {
              if (!window.confirm(t('settings.delivery.confirmDelete', { name: zone.name }))) return;
              void run(async () => {
                await deliveryApi.deleteDeliveryZone(restaurantId, zone.id);
                onDeleted(zone.id);
              });
            }}
          >
            {t('common.delete')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ZoneForm({
  currencyCode,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  currencyCode: string;
  initial?: DeliveryZone;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: { name: string; deliveryFee: string; minimumOrder: string }) => Promise<void>;
}) {
  const { t } = useStaffI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [deliveryFee, setDeliveryFee] = useState(initial?.deliveryFee ?? '0.00');
  const [minimumOrder, setMinimumOrder] = useState(initial?.minimumOrder ?? '0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (name.trim() === '') {
      setError(t('settings.delivery.nameRequired'));
      return;
    }
    if (!MONEY_PATTERN.test(deliveryFee) || !MONEY_PATTERN.test(minimumOrder)) {
      setError(t('settings.delivery.amountsInvalid'));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), deliveryFee, minimumOrder });
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label={t('settings.delivery.areaName')} htmlFor="zone-name">
          <Input
            id="zone-name"
            value={name}
            dir="auto"
            maxLength={100}
            placeholder={t('settings.delivery.areaNamePlaceholder')}
            disabled={isSubmitting}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label={t('settings.delivery.fee', { currency: currencyCode })} htmlFor="zone-fee">
          <Input
            id="zone-fee"
            inputMode="decimal"
            dir="ltr"
            value={deliveryFee}
            disabled={isSubmitting}
            onChange={(e) => setDeliveryFee(e.target.value)}
          />
        </FormField>
        <FormField label={t('settings.delivery.minimumOrder', { currency: currencyCode })} htmlFor="zone-minimum">
          <Input
            id="zone-minimum"
            inputMode="decimal"
            dir="ltr"
            value={minimumOrder}
            disabled={isSubmitting}
            onChange={(e) => setMinimumOrder(e.target.value)}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? t('common.saving') : submitLabel}
        </Button>
        <Button variant="secondary" disabled={isSubmitting} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
