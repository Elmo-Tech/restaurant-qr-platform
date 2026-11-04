"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label } from "@/components/ui";
import { updateRestaurantMenuSlug, type MenuLink } from "@/lib/api/platform";
import { ApiError } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n/client";

/**
 * The Restaurant's readable Guest Menu link (DEC-066): `/q/{slug}`. The slug is generated from the
 * restaurant's name; the Platform team can correct it here. The previous link keeps redirecting, so
 * nothing already printed or shared breaks.
 */
export function MenuLinkCard({
  restaurantId,
  link,
  onSaved,
}: {
  restaurantId: string;
  link: MenuLink;
  onSaved: (link: MenuLink) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(link.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = link.url && link.slug ? link.url.slice(0, link.url.length - link.slug.length - 3) : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const slug = value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) {
      setProblem(t("menuLink.err.format"));
      return;
    }
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const next = await updateRestaurantMenuSlug(restaurantId, slug);
      onSaved({
        slug: next.slug,
        formerSlugs: link.slug && link.slug !== next.slug ? [...link.formerSlugs, link.slug] : link.formerSlugs,
        url: origin ? `${origin}/q/${next.slug}` : null,
      });
      setValue(next.slug);
      setEditing(false);
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "SLUG_TAKEN") setProblem(t("menuLink.err.taken"));
      else if (caught instanceof ApiError && caught.code === "SLUG_RESERVED") setProblem(t("menuLink.err.reserved"));
      else if (caught instanceof ApiError && caught.code === "SLUG_INVALID") setProblem(t("menuLink.err.format"));
      else setProblem(t("menuLink.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("menuLink.section")} description={t("menuLink.description")} />
      <div className="space-y-4 p-5">
        {saved ? <Alert tone="success">{t("menuLink.saved")}</Alert> : null}
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {!editing ? (
          <>
            {link.slug ? (
              <p dir="ltr" className="break-all text-start text-sm font-semibold text-foreground">
                {link.url ?? `/q/${link.slug}`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("menuLink.none")}</p>
            )}
            {link.formerSlugs.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("menuLink.former")}{" "}
                <span dir="ltr" className="break-all">
                  {link.formerSlugs.map((slug) => `/q/${slug}`).join(" · ")}
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {link.url ? (
                <Button type="button" variant="secondary" onClick={() => void copy()}>
                  {copied ? t("menuLink.copied") : t("menuLink.copy")}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => { setEditing(true); setSaved(false); setValue(link.slug ?? ""); }}>
                {t("menuLink.edit")}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="menu-link-slug">{t("menuLink.field")}</Label>
              <div dir="ltr" className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">/q/</span>
                <Input
                  id="menu-link-slug"
                  dir="ltr"
                  className="text-start"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={40}
                  disabled={busy}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("menuLink.hint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {t("menuLink.save")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => { setEditing(false); setProblem(null); }}
              >
                {t("menuLink.cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
