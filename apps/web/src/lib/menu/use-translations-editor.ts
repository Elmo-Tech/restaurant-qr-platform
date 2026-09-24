'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from './error-message';
import { useStaffI18n } from '../i18n/client';
import type { TranslationInput } from './api';

export interface TranslationRow {
  locale: string;
  name: string;
  description: string | null;
}

export interface TranslationDraft {
  name: string;
  description: string;
  /** Whether a saved translation row currently exists for this locale on the Backend. */
  exists: boolean;
  isSaving: boolean;
  isRemoving: boolean;
  error: string | null;
}

export type TranslationDrafts = Record<string, TranslationDraft>;

interface UseTranslationsEditorArgs {
  restaurantId: string;
  /** `null` while creating a not-yet-persisted entity -- there is nothing to attach a translation to yet (FT-1, Section 7/14). */
  entityId: string | null;
  /** Active secondary locale codes (the Restaurant's default locale excluded). */
  locales: string[];
  list: (restaurantId: string, entityId: string) => Promise<TranslationRow[]>;
  put: (
    restaurantId: string,
    entityId: string,
    locale: string,
    input: TranslationInput,
  ) => Promise<TranslationRow>;
  remove: (
    restaurantId: string,
    entityId: string,
    locale: string,
  ) => Promise<void>;
}

function emptyDraft(): TranslationDraft {
  return {
    name: '',
    description: '',
    exists: false,
    isSaving: false,
    isRemoving: false,
    error: null,
  };
}

/**
 * Shared secondary-language translation editor state (FT-1, Section 15/19),
 * used identically by the Menu Dialog, Category Dialog, and Product Editor.
 * Each Save/Remove acts on exactly one locale via the Backend's raw
 * translation endpoints (no fallback logic, Section 5) -- there is no
 * combined multi-locale transaction, so a failure on one locale never blocks
 * or hides the result of another (Section 19).
 *
 * Race safety mirrors `MenuWorkspace`'s established pattern: a request-
 * generation counter plus an `entityId` mirror ref discard a translations-
 * list response that resolves after the User has since switched entity or
 * closed the editor (Section 17).
 */
export function useTranslationsEditor({
  restaurantId,
  entityId,
  locales,
  list,
  put,
  remove,
}: UseTranslationsEditorArgs) {
  const { t } = useStaffI18n();
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    'idle',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<TranslationDrafts>({});

  const requestRef = useRef(0);
  const entityIdRef = useRef(entityId);

  useEffect(() => {
    entityIdRef.current = entityId;
  }, [entityId]);

  const load = useCallback(async () => {
    const id = entityId;
    if (!id || locales.length === 0) {
      setStatus('loaded');
      setLoadError(null);
      setDrafts({});
      return;
    }
    const requestId = ++requestRef.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const rows = await list(restaurantId, id);
      if (requestRef.current !== requestId || entityIdRef.current !== id) {
        return; // superseded -- discard.
      }
      const rowsByLocale = new Map(rows.map((row) => [row.locale, row]));
      const nextDrafts: TranslationDrafts = {};
      for (const locale of locales) {
        const row = rowsByLocale.get(locale);
        nextDrafts[locale] = row
          ? {
              name: row.name,
              description: row.description ?? '',
              exists: true,
              isSaving: false,
              isRemoving: false,
              error: null,
            }
          : emptyDraft();
      }
      setStatus('loaded');
      setDrafts(nextDrafts);
    } catch (error) {
      if (requestRef.current !== requestId || entityIdRef.current !== id) {
        return;
      }
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setStatus('error');
      setLoadError(describeError(error));
    }
  }, [entityId, locales, list, restaurantId]);

  useEffect(() => {
    // `queueMicrotask` matches the established repo convention (see
    // `MenuWorkspace`'s mount effect) for satisfying
    // `react-hooks/set-state-in-effect` -- unrelated to the race-safety
    // guards above, which live entirely in the requestId/entityId checks.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function updateDraft(
    locale: string,
    patch: Partial<Pick<TranslationDraft, 'name' | 'description'>>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? emptyDraft()), ...patch, error: null },
    }));
  }

  async function save(locale: string) {
    const id = entityId;
    if (!id) return;
    const draft = drafts[locale] ?? emptyDraft();
    const name = draft.name.trim();
    if (name === '') {
      setDrafts((prev) => ({
        ...prev,
        [locale]: { ...draft, error: t('menu.tr.nameRequired') },
      }));
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [locale]: { ...draft, isSaving: true, error: null },
    }));
    try {
      const saved = await put(restaurantId, id, locale, {
        name,
        description: draft.description.trim() === '' ? null : draft.description.trim(),
      });
      setDrafts((prev) => ({
        ...prev,
        [locale]: {
          name: saved.name,
          description: saved.description ?? '',
          exists: true,
          isSaving: false,
          isRemoving: false,
          error: null,
        },
      }));
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDrafts((prev) => ({
        ...prev,
        [locale]: { ...draft, isSaving: false, error: describeError(error) },
      }));
    }
  }

  async function removeTranslation(locale: string) {
    const id = entityId;
    if (!id) return;
    const draft = drafts[locale] ?? emptyDraft();
    setDrafts((prev) => ({
      ...prev,
      [locale]: { ...draft, isRemoving: true, error: null },
    }));
    try {
      await remove(restaurantId, id, locale);
      setDrafts((prev) => ({ ...prev, [locale]: emptyDraft() }));
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setDrafts((prev) => ({
        ...prev,
        [locale]: { ...draft, isRemoving: false, error: describeError(error) },
      }));
    }
  }

  return {
    status,
    loadError,
    drafts,
    updateDraft,
    save,
    removeTranslation,
  };
}
