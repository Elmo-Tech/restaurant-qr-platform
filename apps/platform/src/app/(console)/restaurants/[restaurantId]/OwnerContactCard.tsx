"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label } from "@/components/ui";
import { updateRestaurantOwnerContact, type OwnerContact } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";

export function OwnerContactCard({
  restaurantId,
  contact,
  onSaved,
}: {
  restaurantId: string;
  contact: OwnerContact | null;
  onSaved: (contact: OwnerContact) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(!contact);
  const [fullName, setFullName] = useState(contact?.fullName ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [facebookUrl, setFacebookUrl] = useState(contact?.facebookUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function restore() {
    setFullName(contact?.fullName ?? "");
    setPhone(contact?.phone ?? "");
    setFacebookUrl(contact?.facebookUrl ?? "");
    setEditing(!contact);
    setProblem(null);
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setProblem(t("ownerContact.err.name"));
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setProblem(t("ownerContact.err.phone"));
      return;
    }
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const next = await updateRestaurantOwnerContact(restaurantId, {
        fullName: trimmedName,
        phone: phone.trim(),
        facebookUrl: facebookUrl.trim() || null,
      });
      onSaved(next);
      setFullName(next.fullName);
      setPhone(next.phone);
      setFacebookUrl(next.facebookUrl ?? "");
      setEditing(false);
      setSaved(true);
    } catch {
      setProblem(t("ownerContact.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("ownerContact.section")} description={t("ownerContact.description")} />
      <div className="space-y-4 p-5">
        {saved ? <Alert tone="success">{t("ownerContact.saved")}</Alert> : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {!editing && contact ? (
          <>
            <div className="space-y-2">
              <p className="break-words text-sm font-semibold text-foreground">{contact.fullName}</p>
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                dir="ltr"
                className="inline-flex min-h-10 items-center gap-2 text-start text-sm font-medium text-primary-text hover:underline"
              >
                {contact.phone} · {t("ownerContact.call")}
              </a>
              {contact.facebookUrl ? (
                <div>
                  <a
                    href={contact.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center text-sm font-medium text-primary-text hover:underline"
                  >
                    {t("ownerContact.openFacebook")}
                  </a>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="secondary" onClick={() => { setEditing(true); setSaved(false); }}>
              {t("ownerContact.edit")}
            </Button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="owner-contact-name">{t("ownerContact.name")}</Label>
              <Input
                id="owner-contact-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                disabled={busy}
                required
              />
            </div>
            <div>
              <Label htmlFor="owner-contact-phone">{t("ownerContact.phone")}</Label>
              <Input
                id="owner-contact-phone"
                type="tel"
                dir="ltr"
                className="text-start"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={32}
                disabled={busy}
                placeholder="+201012345678"
                required
              />
            </div>
            <div>
              <Label htmlFor="owner-contact-facebook">{t("ownerContact.facebook")}</Label>
              <Input
                id="owner-contact-facebook"
                dir="ltr"
                className="text-start"
                value={facebookUrl}
                onChange={(e) => setFacebookUrl(e.target.value)}
                maxLength={300}
                disabled={busy}
                placeholder="https://facebook.com/..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("common.saving") : t("ownerContact.save")}
              </Button>
              {contact ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={restore}>
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
