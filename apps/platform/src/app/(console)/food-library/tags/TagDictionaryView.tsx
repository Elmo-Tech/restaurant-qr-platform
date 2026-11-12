"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Alert, Badge, Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { IconPlus, IconX } from "@/components/icons";
import { useI18n } from "@/lib/i18n/client";
import { ApiError } from "@/lib/api/errors";
import {
  FOOD_TAG_GROUPS,
  listTagCatalog,
  createFoodTag,
  updateFoodTag,
  type FoodTagGroup,
  type FoodTagRecord,
  type FoodTagWrite,
} from "@/lib/api/food-library";

type FormValue = Omit<FoodTagWrite, "aliasesAr" | "aliasesEn" | "aliasesIt"> & {
  aliasesAr: string;
  aliasesEn: string;
  aliasesIt: string;
};

const NEW_TAG: FormValue = {
  code: "",
  group: "DISH",
  nameAr: "",
  nameEn: "",
  nameIt: "",
  aliasesAr: "",
  aliasesEn: "",
  aliasesIt: "",
};

const GROUP_KEYS: Record<FoodTagGroup, "tag.group.PROTEIN" | "tag.group.CUT" |
  "tag.group.DISH" | "tag.group.HOME" | "tag.group.DESSERT" | "tag.group.DRINK" |
  "tag.group.INGREDIENT" | "tag.group.PREPARATION" | "tag.group.SAUCE" |
  "tag.group.BAKERY" | "tag.group.PORTION"> = {
    PROTEIN: "tag.group.PROTEIN",
    CUT: "tag.group.CUT",
    DISH: "tag.group.DISH",
    HOME: "tag.group.HOME",
    DESSERT: "tag.group.DESSERT",
    DRINK: "tag.group.DRINK",
    INGREDIENT: "tag.group.INGREDIENT",
    PREPARATION: "tag.group.PREPARATION",
    SAUCE: "tag.group.SAUCE",
    BAKERY: "tag.group.BAKERY",
    PORTION: "tag.group.PORTION",
  };

function commas(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toForm(tag: FoodTagRecord): FormValue {
  const withoutLabel = (names: string[], label: string) =>
    names.filter((name) => name.toLocaleLowerCase() !== label.toLocaleLowerCase()).join(", ");
  return {
    code: tag.code,
    group: tag.group,
    nameAr: tag.nameAr,
    nameEn: tag.nameEn,
    nameIt: tag.nameIt,
    aliasesAr: withoutLabel(tag.aliases.ar, tag.nameAr),
    aliasesEn: withoutLabel(tag.aliases.en, tag.nameEn),
    aliasesIt: withoutLabel(tag.aliases.it, tag.nameIt),
  };
}

/** Platform-only dictionary. Canonical code never changes after creation. */
export function TagDictionaryView() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<FoodTagGroup | "">("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [tags, setTags] = useState<FoodTagRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<"new" | FoodTagRecord | null>(null);
  const [draft, setDraft] = useState<FormValue>(NEW_TAG);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ danger: boolean; message: string } | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void listTagCatalog({ search, group, page, pageSize: 25 })
        .then((result) => {
          if (cancelled) return;
          setTags(result.items);
          setTotal(result.total);
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setFeedback({ danger: true, message: caught instanceof Error ? caught.message : t("common.error") });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 240);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, group, page, revision, t]);

  useEffect(() => {
    if (!editor) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => { document.body.style.overflow = overflow; };
  }, [editor]);

  function edit(tag?: FoodTagRecord) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(tag ? toForm(tag) : { ...NEW_TAG });
    setEditor(tag ?? "new");
    setFeedback(null);
  }

  function close() {
    if (saving) return;
    setEditor(null);
    triggerRef.current?.focus();
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const candidates = modalRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
    );
    if (!candidates?.length) return;
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function change<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    setFeedback(null);
    setSaving(true);
    const payload: FoodTagWrite = {
      code: draft.code,
      group: draft.group,
      nameAr: draft.nameAr.trim(),
      nameEn: draft.nameEn.trim(),
      nameIt: draft.nameIt.trim(),
      aliasesAr: commas(draft.aliasesAr),
      aliasesEn: commas(draft.aliasesEn),
      aliasesIt: commas(draft.aliasesIt),
    };
    try {
      if (editor === "new") await createFoodTag(payload);
      else await updateFoodTag(editor.id, payload);
      setEditor(null);
      setPage(1);
      setRevision((value) => value + 1);
      setFeedback({ danger: false, message: t("tag.saved") });
      triggerRef.current?.focus();
    } catch (caught) {
      setFeedback({
        danger: true,
        message: caught instanceof ApiError && (caught.code === "FOOD_TAG_CONFLICT" ||
          caught.code === "FOOD_TAG_ALIAS_CONFLICT")
          ? t("tag.aliasConflict")
          : caught instanceof Error ? caught.message : t("common.error"),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("tag.title")}
        description={t("tag.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/food-library" className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm hover:bg-surface-2">
              {t("tag.gallery")}
            </Link>
            <Button variant="primary" onClick={() => edit()}><IconPlus />{t("tag.new")}</Button>
          </div>
        }
      />
      {feedback && !editor ? <Alert tone={feedback.danger ? "danger" : "success"} className="mb-4">{feedback.message}</Alert> : null}
      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[1fr_230px]">
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            aria-label={t("tag.search")} placeholder={t("tag.search")} />
          <Select value={group} onChange={(event) => { setGroup(event.target.value as FoodTagGroup | ""); setPage(1); }}
            aria-label={t("tag.group")}>
            <option value="">{t("tag.allGroups")}</option>
            {FOOD_TAG_GROUPS.map((value) => <option key={value} value={value}>{t(GROUP_KEYS[value])}</option>)}
          </Select>
        </div>
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">{t("tag.results", { count: total })}</div>
        {loading ? <div className="p-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          : tags.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">{t("tag.empty")}</div>
          : (
            <>
              <div className="grid gap-2 p-3 md:hidden">
                {tags.map((tag) => (
                  <article key={tag.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span dir="ltr" className="min-w-0 break-all font-mono text-xs font-semibold text-primary-text">{tag.code}</span>
                      <Button size="sm" onClick={() => edit(tag)}>{t("tag.edit")}</Button>
                    </div>
                    <p className="mt-2 text-sm font-medium">{locale === "ar" ? tag.nameAr : tag.nameEn}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{tag.nameEn} · {tag.nameIt}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{t(GROUP_KEYS[tag.group])}</Badge>
                      <Badge>{t("tag.images", { count: tag.imageCount })}</Badge>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full table-auto text-start text-[13px]">
                  <thead className="bg-surface-2 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.code")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.ar")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.en")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.it")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.group")}</th>
                      <th className="px-4 py-3 text-start font-medium">{t("tag.photos")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {tags.map((tag) => (
                      <tr key={tag.id} className="border-t border-border">
                        <td dir="ltr" className="px-4 py-3 text-start font-mono text-xs text-primary-text">{tag.code}</td>
                        <td className="px-4 py-3" dir="rtl">{tag.nameAr}</td>
                        <td className="px-4 py-3" dir="ltr">{tag.nameEn}</td>
                        <td className="px-4 py-3" dir="ltr">{tag.nameIt}</td>
                        <td className="px-4 py-3"><Badge>{t(GROUP_KEYS[tag.group])}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground">{tag.imageCount}</td>
                        <td className="px-4 py-3 text-end">
                          <Button size="sm" onClick={() => edit(tag)}>{t("tag.edit")}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        {total > 25 && (
          <div className="flex items-center justify-center gap-3 border-t border-border p-4">
            <Button size="sm" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>{t("common.previous")}</Button>
            <span className="text-xs text-muted-foreground">{page} / {Math.ceil(total / 25)}</span>
            <Button size="sm" disabled={page * 25 >= total || loading} onClick={() => setPage((p) => p + 1)}>{t("common.next")}</Button>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">{t("tag.bottomHint")}</p>

      {editor ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-3">
          <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="tag-dialog-title"
            onKeyDown={handleKeys}
            className="flex max-h-[calc(100dvh-24px)] w-full max-w-[640px] flex-col rounded-2xl border border-border bg-surface shadow-pop">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id="tag-dialog-title" className="text-lg font-semibold">
                {t(editor === "new" ? "tag.createTitle" : "tag.editTitle")}
              </h2>
              <Button size="sm" variant="ghost" aria-label={t("food.close")} disabled={saving} onClick={close}><IconX /></Button>
            </header>
            <form onSubmit={(event) => void save(event)} className="min-h-0 flex flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {feedback?.danger ? <Alert tone="danger">{feedback.message}</Alert> : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="tag-code">{t("tag.code")}</Label>
                    <Input id="tag-code" ref={firstFieldRef} value={draft.code} dir="ltr"
                      disabled={editor !== "new"} required maxLength={80}
                      placeholder="CHICKEN_BURGER"
                      onChange={(event) => change("code", event.target.value.toUpperCase().replace(/\s/g, "_"))} />
                  </div>
                  <div>
                    <Label htmlFor="tag-group">{t("tag.group")}</Label>
                    <Select id="tag-group" value={draft.group}
                      onChange={(event) => change("group", event.target.value as FoodTagGroup)}>
                      {FOOD_TAG_GROUPS.map((value) => <option key={value} value={value}>{t(GROUP_KEYS[value])}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label htmlFor="tag-ar">{t("tag.ar")}</Label>
                    <Input id="tag-ar" dir="rtl" required maxLength={120} value={draft.nameAr}
                      onChange={(event) => change("nameAr", event.target.value)} placeholder="دجاج" /></div>
                  <div><Label htmlFor="tag-en">{t("tag.en")}</Label>
                    <Input id="tag-en" dir="ltr" required maxLength={120} value={draft.nameEn}
                      onChange={(event) => change("nameEn", event.target.value)} placeholder="Chicken" /></div>
                  <div><Label htmlFor="tag-it">{t("tag.it")}</Label>
                    <Input id="tag-it" dir="ltr" required maxLength={120} value={draft.nameIt}
                      onChange={(event) => change("nameIt", event.target.value)} placeholder="Pollo" /></div>
                </div>
                <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{t("tag.aliases")}</summary>
                  <p className="mt-2 text-xs text-muted-foreground">{t("tag.aliasHint")}</p>
                  <div className="mt-3 space-y-3">
                    <div><Label htmlFor="aliases-ar">{t("tag.aliasAr")}</Label>
                      <Input id="aliases-ar" dir="rtl" value={draft.aliasesAr} placeholder="فراخ، دجاجة"
                        onChange={(event) => change("aliasesAr", event.target.value.replace(/،/g, ","))} /></div>
                    <div><Label htmlFor="aliases-en">{t("tag.aliasEn")}</Label>
                      <Input id="aliases-en" dir="ltr" value={draft.aliasesEn} placeholder="Poultry, Chicken meat"
                        onChange={(event) => change("aliasesEn", event.target.value)} /></div>
                    <div><Label htmlFor="aliases-it">{t("tag.aliasIt")}</Label>
                      <Input id="aliases-it" dir="ltr" value={draft.aliasesIt} placeholder="Carne di pollo"
                        onChange={(event) => change("aliasesIt", event.target.value)} /></div>
                  </div>
                </details>
                <p className="text-xs text-muted-foreground">{t("tag.editWarning")}</p>
              </div>
              <footer className="flex justify-end gap-2 border-t border-border p-4">
                <Button type="button" disabled={saving} onClick={close}>{t("common.cancel")}</Button>
                <Button type="submit" variant="primary" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
