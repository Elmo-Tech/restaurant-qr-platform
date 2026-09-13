'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as settingsApi from '../../../../../../lib/settings/api';
import type { RestaurantLocalesResponse } from '../../../../../../lib/settings/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { SettingsTabs } from '../SettingsTabs';
import { LanguageRow } from './LanguageRow';

export interface LanguagesWorkspaceProps {
  restaurantId: string;
  /** `restaurant.manage` AND `allBranches === true` (Section 6). */
  canManage: boolean;
  /** `restaurant.manage` alone, regardless of Branch scope -- used only for the explanatory read-only note (Section 7), mirroring `MenuWorkspace`'s `hasMenuManagePermission` convention. */
  hasRestaurantManagePermission: boolean;
}

/**
 * Restaurant Settings -- Languages workspace (LOC-3). Owns the one GET/PUT
 * round trip; consumes the Backend's merged Platform-registry response
 * directly (`getRestaurantLocales`) -- never a hardcoded locale list
 * (Section 14). No global state/cache framework, mirroring
 * `MenuWorkspace`'s exact local-React-state approach.
 *
 * Race safety (Section 16), scaled down from `MenuWorkspace`'s multi-level
 * pattern to this single-list case: `loadRequestRef` guards a stale GET
 * response; `restaurantIdRef` always mirrors the latest `restaurantId` prop
 * so an in-flight GET or PUT started under a since-navigated-away
 * Restaurant can never apply its result to the wrong Restaurant's UI.
 * `pendingLocale` both drives the per-row pending UI and blocks a second
 * toggle call while one is already in flight, for any locale.
 */
export function LanguagesWorkspace({
  restaurantId,
  canManage,
  hasRestaurantManagePermission,
}: LanguagesWorkspaceProps) {
  const [data, setData] = useState<RestaurantLocalesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<{
    locale: string;
    message: string;
  } | null>(null);

  const restaurantIdRef = useRef(restaurantId);
  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);
  const loadRequestRef = useRef(0);

  const loadLocales = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const requestedRestaurantId = restaurantId;
    try {
      const result = await settingsApi.getRestaurantLocales(restaurantId);
      if (
        loadRequestRef.current !== requestId ||
        restaurantIdRef.current !== requestedRestaurantId
      ) {
        return; // superseded by a newer request, or the User navigated away.
      }
      setData(result);
      setLoadError(null);
    } catch (error) {
      if (
        loadRequestRef.current !== requestId ||
        restaurantIdRef.current !== requestedRestaurantId
      ) {
        return;
      }
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setLoadError(describeError(error));
    }
  }, [restaurantId]);

  useEffect(() => {
    // `queueMicrotask` here mirrors `MenuWorkspace`'s identical fix -- purely
    // to satisfy eslint-plugin-react-hooks' `set-state-in-effect` rule
    // (`loadLocales` internally calls `setState`), unrelated to the
    // race-safety guarantees above (those live in the requestId ref checks
    // inside `loadLocales`, not in timing).
    queueMicrotask(() => {
      void loadLocales();
    });
  }, [loadLocales]);

  async function handleToggle(locale: string, nextIsActive: boolean) {
    if (pendingLocale) return; // one mutation in flight at a time (Section 16).
    const requestedRestaurantId = restaurantId;
    setPendingLocale(locale);
    setMutationError(null);
    try {
      await settingsApi.setRestaurantLocaleState(
        restaurantId,
        locale,
        nextIsActive,
      );
      if (restaurantIdRef.current !== requestedRestaurantId) return;
      // Settle from the server's own current state rather than
      // optimistically assuming the request body was applied verbatim
      // (Section 16: "do not optimistically lie about server state").
      await loadLocales();
    } catch (error) {
      if (restaurantIdRef.current !== requestedRestaurantId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setMutationError({ locale, message: describeError(error) });
    } finally {
      if (restaurantIdRef.current === requestedRestaurantId) {
        setPendingLocale(null);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-[#1D1A18]">
          Restaurant Settings
        </h1>
        <p className="mt-1 text-sm text-[#655D56]">
          Manage configuration for this restaurant.
        </p>
      </div>

      <SettingsTabs restaurantId={restaurantId} />

      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-[#1D1A18]">Languages</h2>
          <p className="mt-1 text-sm text-[#655D56]">
            Choose which languages your menu content can be translated into.
          </p>
        </div>

        {!canManage && hasRestaurantManagePermission ? (
          <Alert variant="info">
            Full Restaurant branch scope is required to manage Languages.
          </Alert>
        ) : !canManage ? (
          <Alert variant="info">
            You have view-only access to Restaurant Settings.
          </Alert>
        ) : null}

        {loadError && !data ? (
          <Alert variant="error">
            <div className="flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <Button
                variant="secondary"
                className="px-2 py-1 text-xs"
                onClick={() => void loadLocales()}
              >
                Retry
              </Button>
            </div>
          </Alert>
        ) : !data ? (
          <LoadingState label="Loading languages…" />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {data.locales.map((row) => (
                <LanguageRow
                  key={row.locale}
                  row={row}
                  canManage={canManage}
                  isPending={pendingLocale === row.locale}
                  onToggle={handleToggle}
                />
              ))}
            </div>

            {mutationError ? (
              <Alert variant="error">{mutationError.message}</Alert>
            ) : null}

            <p className="text-xs text-[#655D56]">
              Disabling a language hides it from editing for now. Existing
              translations are kept and become available again if you
              re-enable it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
