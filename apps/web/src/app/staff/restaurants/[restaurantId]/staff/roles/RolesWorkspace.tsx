'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as staffApi from '../../../../../../lib/staff/api';
import type { StaffRole } from '../../../../../../lib/staff/types';
import { ApiError } from '../../../../../../lib/api/errors';
import { roleDisplayName } from '../../../../../../lib/staff/role-display';
import { resolvePermissionGroups } from '../../../../../../lib/staff/permission-catalog';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { Select } from '../../../../../../components/ui/Select';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { IconStaff } from '../../../../../../components/staff/icons';
import { cn } from '../../../../../../lib/utils';
import { StaffTabs } from '../StaffTabs';

const NAME_MAX_LENGTH = 60;

export interface RolesWorkspaceProps {
  restaurantId: string;
  /** `roles.manage` -- UX only; the Backend enforces it on every change. */
  canManage: boolean;
  /** The signed-in user's own permissions: a role can only be given permissions its editor holds. */
  editorPermissions: readonly string[];
}

function sameSet(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((key) => a.has(key));
}

/**
 * Staff & Access -- Roles & Permissions (FT-12C). A Role is WHAT a user may do
 * (Branch access, WHERE, stays on the user). Create, rename, edit permissions
 * and delete Restaurant Roles; Owner is protected and read-only. Every change
 * settles by writing to the Backend and replacing the Role from its response
 * (never optimistic). The Backend enforces the real rules -- Owner protection,
 * no escalation beyond your own permissions, `ROLE_IN_USE` -- this screen only
 * mirrors them so the controls are never misleading.
 */
export function RolesWorkspace({ restaurantId, canManage, editorPermissions }: RolesWorkspaceProps) {
  const { t, tp } = useStaffI18n();
  const [roles, setRoles] = useState<StaffRole[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);

  const loadRequestRef = useRef(0);
  const restaurantIdRef = useRef(restaurantId);
  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const requestedRestaurantId = restaurantId;
    try {
      const result = await staffApi.listStaffRoles(restaurantId);
      if (loadRequestRef.current !== requestId || restaurantIdRef.current !== requestedRestaurantId) return;
      setRoles(result);
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
      void load();
    });
  }, [load]);

  const activeRole = roles ? (roles.find((role) => role.id === selectedId) ?? roles[0]) : null;
  const held = new Set(editorPermissions);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('staff.title')} description={t('staff.subtitle')} />

      <StaffTabs restaurantId={restaurantId} active="roles" />

      <Alert variant="info">{t('roles.intro')}</Alert>
      {!canManage ? <Alert variant="info">{t('roles.viewOnly')}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {loadError && !roles ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : !roles || !activeRole ? (
        <LoadingState label={t('roles.loading')} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label={t('roles.list')} className="flex flex-col gap-3">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {roles.map((role) => {
                const isActive = role.id === activeRole.id;
                return (
                  <li key={role.id} className="flex-shrink-0 lg:flex-shrink">
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setSelectedId(role.id);
                      }}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'flex w-full min-w-[9rem] flex-col items-start gap-1 rounded-lg border px-4 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        isActive ? 'border-primary bg-accent/50' : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span dir="auto" className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {roleDisplayName(role, t)}
                        </span>
                        {role.isProtected ? <Badge variant="primary">{t('roles.protected')}</Badge> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">{tp('roles.members', role.memberCount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {canManage ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setNotice(null);
                  setNewRoleOpen(true);
                }}
              >
                + {t('roles.new')}
              </Button>
            ) : null}
          </nav>

          <RoleEditor
            key={`${activeRole.id}|${activeRole.name}|${activeRole.permissions.join(',')}`}
            restaurantId={restaurantId}
            role={activeRole}
            canManage={canManage}
            held={held}
            onSaved={(saved) => {
              setRoles((current) => (current ? current.map((role) => (role.id === saved.id ? saved : role)) : current));
              setNotice(t('roles.saved', { name: saved.name }));
            }}
            onDeleted={(deleted) => {
              setSelectedId(null);
              setNotice(t('roles.deleted', { name: deleted.name }));
              void load();
            }}
          />
        </div>
      )}

      <NewRoleDialog
        open={newRoleOpen}
        restaurantId={restaurantId}
        roles={roles ?? []}
        held={held}
        onClose={() => setNewRoleOpen(false)}
        onCreated={(created) => {
          setNewRoleOpen(false);
          setSelectedId(created.id);
          setNotice(t('roles.created', { name: created.name }));
          void load();
        }}
      />
    </div>
  );
}

function RoleEditor({
  restaurantId,
  role,
  canManage,
  held,
  onSaved,
  onDeleted,
}: {
  restaurantId: string;
  role: StaffRole;
  canManage: boolean;
  held: ReadonlySet<string>;
  onSaved: (role: StaffRole) => void;
  onDeleted: (role: StaffRole) => void;
}) {
  const { t, tp } = useStaffI18n();
  const editable = canManage && !role.isProtected;
  const [name, setName] = useState(role.name);
  const [draft, setDraft] = useState<ReadonlySet<string>>(() => new Set(role.permissions));
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const trimmedName = name.trim();
  const isDirty = trimmedName !== role.name || !sameSet(draft, role.permissions);

  function toggle(permission: string) {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !editable) return;
    if (!trimmedName) {
      setNameError(t('roles.name.error.required'));
      return;
    }
    setNameError(null);
    setFormError(null);
    setIsSaving(true);
    try {
      const saved = await staffApi.updateStaffRole(restaurantId, role.id, {
        ...(trimmedName !== role.name ? { name: trimmedName } : {}),
        permissions: [...draft],
      });
      onSaved(saved);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setFormError(describeError(error));
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await staffApi.deleteStaffRole(restaurantId, role.id);
      setDeleteOpen(false);
      onDeleted(role);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      if (error instanceof ApiError && error.code === 'ROLE_IN_USE') {
        const count = (error.details as { memberCount?: number } | undefined)?.memberCount ?? role.memberCount;
        setDeleteError(tp('roles.inUse', count));
      } else {
        setDeleteError(describeError(error));
      }
      setIsDeleting(false);
    }
  }

  return (
    <SectionCard
      title={<span dir="auto">{roleDisplayName(role, t)}</span>}
      description={t('roles.description')}
      icon={<IconStaff />}
      actions={role.isProtected ? <Badge variant="primary">{t('roles.protected')}</Badge> : null}
    >
      <form onSubmit={handleSave} className="flex flex-col gap-5" noValidate>
        {role.isProtected ? <Alert variant="warning">{t('roles.protectedNote')}</Alert> : null}
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <div className="max-w-md">
          <FormField label={t('roles.name')} htmlFor="role-name" error={nameError ?? undefined}>
            <Input
              id="role-name"
              dir="auto"
              maxLength={NAME_MAX_LENGTH}
              placeholder={t('roles.name.placeholder')}
              value={role.isProtected ? roleDisplayName(role, t) : name}
              disabled={!editable || isSaving}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">{t('roles.permissions')}</h3>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            {resolvePermissionGroups([...(role.isProtected ? role.permissions : draft)]).map((group) => (
              <section key={group.id} className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-foreground">{group.label ? t(group.label) : t('roles.other')}</h4>
                <ul className="flex flex-col gap-1.5">
                  {group.permissions.map((permission) => {
                    const label = permission.label ? t(permission.label) : permission.key;
                    const checked = role.isProtected ? true : draft.has(permission.key);
                    // You may always take a permission away, but only give one you hold yourself.
                    const locked = editable && !checked && !held.has(permission.key);
                    return (
                      <li key={permission.key}>
                        <label
                          className={cn('flex items-start gap-2.5 text-sm', editable && !locked ? 'cursor-pointer' : '')}
                          title={locked ? t('roles.permissionLocked') : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!editable || isSaving || locked}
                            onChange={() => toggle(permission.key)}
                            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
                          />
                          <span className={cn(checked ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        {editable ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {role.memberCount > 0 ? (
              <p className="text-xs text-muted-foreground">{tp('roles.inUse', role.memberCount)}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSaving || !isDirty}>
                {isSaving ? t('roles.saving') : t('roles.save')}
              </Button>
              {isDirty && !isSaving ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setName(role.name);
                    setDraft(new Set(role.permissions));
                    setNameError(null);
                    setFormError(null);
                  }}
                >
                  {t('roles.discard')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="ms-auto text-destructive hover:bg-destructive-soft hover:text-destructive"
                disabled={isSaving}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
              >
                {t('roles.delete')}
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={deleteOpen}
        title={t('roles.deleteConfirm.title', { name: role.name })}
        description={t('roles.deleteConfirm.description')}
        confirmLabel={t('roles.deleteConfirm.confirm')}
        isSubmitting={isDeleting}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
      />
    </SectionCard>
  );
}

function NewRoleDialog({
  open,
  restaurantId,
  roles,
  held,
  onClose,
  onCreated,
}: {
  open: boolean;
  restaurantId: string;
  roles: StaffRole[];
  held: ReadonlySet<string>;
  onClose: () => void;
  onCreated: (role: StaffRole) => void;
}) {
  if (!open) return null;
  return (
    <NewRoleForm restaurantId={restaurantId} roles={roles} held={held} onClose={onClose} onCreated={onCreated} />
  );
}

function NewRoleForm({
  restaurantId,
  roles,
  held,
  onClose,
  onCreated,
}: Omit<Parameters<typeof NewRoleDialog>[0], 'open'>) {
  const { t } = useStaffI18n();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only templates whose permissions the creator holds in full can be copied.
  const templates = roles.filter((role) => role.permissions.every((permission) => held.has(permission)));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('roles.name.error.required'));
      return;
    }
    setNameError(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      const created = await staffApi.createStaffRole(restaurantId, {
        name: trimmed,
        permissions: templates.find((role) => role.id === copyFromId)?.permissions ?? [],
      });
      onCreated(created);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setFormError(describeError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      title={t('roles.new.title')}
      subtitle={t('roles.new.subtitle')}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('roles.new.submitting') : t('roles.new.submit')}
      onSubmit={handleSubmit}
      onClose={onClose}
      initialFocusRef={nameRef}
    >
      <div className="flex flex-col gap-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <FormField label={t('roles.name')} htmlFor="new-role-name" error={nameError ?? undefined}>
          <Input
            ref={nameRef}
            id="new-role-name"
            dir="auto"
            maxLength={NAME_MAX_LENGTH}
            placeholder={t('roles.name.placeholder')}
            value={name}
            disabled={isSubmitting}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />
        </FormField>

        <FormField label={t('roles.new.copyFrom')} htmlFor="new-role-copy">
          <Select
            id="new-role-copy"
            value={copyFromId}
            disabled={isSubmitting}
            onChange={(event) => setCopyFromId(event.target.value)}
          >
            <option value="">{t('roles.new.copyNone')}</option>
            {templates.map((role) => (
              <option key={role.id} value={role.id}>
                {roleDisplayName(role, t)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Dialog>
  );
}
