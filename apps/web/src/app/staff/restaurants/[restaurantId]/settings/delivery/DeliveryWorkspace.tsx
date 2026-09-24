'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
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
      <div>
        <h1 className="text-lg font-semibold text-[#1D1A18]">Restaurant Settings</h1>
        <p className="mt-1 text-sm text-[#655D56]">
          Delivery areas, fees and minimum orders for each branch.
        </p>
      </div>

      <SettingsTabs restaurantId={restaurantId} active="delivery" />

      {!canManage && hasManagePermission ? (
        <Alert variant="info">
          Full Restaurant branch scope is required to change Delivery settings.
        </Alert>
      ) : null}

      <p className="text-sm text-[#655D56]">
        Guests can order Delivery from a branch only while the branch is active and has at least one
        active delivery area.
      </p>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {branches === null && !error ? <LoadingState label="Loading delivery settings…" /> : null}

      {branches !== null && branches.length === 0 ? (
        <Card className="py-8 text-center text-sm text-[#655D56]">
          No branches available for delivery settings.
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
  const [isAdding, setIsAdding] = useState(false);
  const activeZones = branch.zones.filter((zone) => zone.status === 'ACTIVE').length;
  const offered = branch.status === 'ACTIVE' && activeZones > 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[#1D1A18]">{branch.name}</h2>
          {branch.status === 'INACTIVE' ? (
            <span className="rounded-full bg-[#F1EDE7] px-2 py-0.5 text-xs text-[#655D56]">
              Branch inactive
            </span>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            offered ? 'bg-[#DDF1DF] text-[#1E6B25]' : 'bg-[#F1EDE7] text-[#655D56]'
          }`}
        >
          {offered ? 'Delivery available' : 'Delivery not offered'}
        </span>
      </div>

      {branch.zones.length === 0 ? (
        <p className="text-sm text-[#655D56]">No delivery areas yet.</p>
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
          submitLabel="Add area"
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
            + Add delivery area
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
        setError('This area has orders and cannot be deleted. Deactivate it instead.');
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
          submitLabel="Save"
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

  const minimum = zone.minimumOrder === '0.00' ? 'No minimum' : `Minimum ${zone.minimumOrder} ${currencyCode}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#F8F5F1] px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1D1A18]">
          {zone.name}
          {zone.status === 'INACTIVE' ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-normal text-[#655D56]">
              Inactive
            </span>
          ) : null}
        </p>
        <p className="text-xs text-[#655D56]">
          <bdi dir="ltr">
            {zone.deliveryFee} {currencyCode}
          </bdi>{' '}
          delivery · {minimum}
        </p>
        {error ? <p className="mt-1 text-xs text-[#A4231B]">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={!canManage || isBusy} onClick={() => setIsEditing(true)}>
          Edit
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
          {zone.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
        {zone.canDelete ? (
          <Button
            variant="danger"
            disabled={!canManage || isBusy}
            onClick={() => {
              if (!window.confirm(`Delete "${zone.name}"? This cannot be undone.`)) return;
              void run(async () => {
                await deliveryApi.deleteDeliveryZone(restaurantId, zone.id);
                onDeleted(zone.id);
              });
            }}
          >
            Delete
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
  const [name, setName] = useState(initial?.name ?? '');
  const [deliveryFee, setDeliveryFee] = useState(initial?.deliveryFee ?? '0.00');
  const [minimumOrder, setMinimumOrder] = useState(initial?.minimumOrder ?? '0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (name.trim() === '') {
      setError('Area name is required.');
      return;
    }
    if (!MONEY_PATTERN.test(deliveryFee) || !MONEY_PATTERN.test(minimumOrder)) {
      setError('Fee and minimum must be non-negative amounts, e.g. 25.00.');
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
    <div className="flex flex-col gap-3 rounded-md border border-[#E5DED6] bg-white p-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="Area name" htmlFor="zone-name">
          <Input
            id="zone-name"
            value={name}
            maxLength={100}
            placeholder="e.g. University District"
            disabled={isSubmitting}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label={`Delivery fee (${currencyCode})`} htmlFor="zone-fee">
          <Input
            id="zone-fee"
            inputMode="decimal"
            value={deliveryFee}
            disabled={isSubmitting}
            onChange={(e) => setDeliveryFee(e.target.value)}
          />
        </FormField>
        <FormField label={`Minimum order (${currencyCode})`} htmlFor="zone-minimum">
          <Input
            id="zone-minimum"
            inputMode="decimal"
            value={minimumOrder}
            disabled={isSubmitting}
            onChange={(e) => setMinimumOrder(e.target.value)}
          />
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button variant="secondary" disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
