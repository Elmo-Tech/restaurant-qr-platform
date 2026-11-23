"use client";

import { useId, useState, type ReactNode } from "react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import type { MenuChoiceDraft, MenuTranslation, OnboardingMenuDraft, RestaurantDraft } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { menuCounts } from "@/lib/onboarding-menu";
import { TextField } from "./fields";

type Kind = "menu" | "category" | "product" | "variant" | "group" | "option";
type Translated = { translations: MenuTranslation[] };

export function MenuEditor({ draft, restaurant, disabled, onChange }: {
  draft: OnboardingMenuDraft;
  restaurant: RestaurantDraft;
  disabled: boolean;
  onChange: (draft: OnboardingMenuDraft) => void;
}) {
  const { t } = useI18n();
  const defaultLocale = restaurant.defaultLocale ?? "ar";
  const enabledLocales = Array.from(new Set([defaultLocale, ...restaurant.additionalLocales]));
  const counts = menuCounts(draft);
  const translated = { disabled, defaultLocale, enabledLocales };
  const blankText = (): Translated => ({ translations: [{ locale: defaultLocale, name: "" }] });
  const blankChoice = (): MenuChoiceDraft => ({ ...blankText(), price: "" });

  return (
    <Card>
      <CardHeader title={t("onboarding.menu.editor")} description={t("onboarding.menu.editorHint")} />
      <div className="p-3 sm:p-5">
        <Rows {...translated} kind="menu" items={draft.menus} canAdd={counts.menus < 10} create={() => ({ ...blankText(), categories: [] })}
          onChange={(menus) => onChange({ menus })}>
          {(menu, setMenu) => (
            <>
              <Translations {...translated} value={menu.translations} onChange={(translations) => setMenu({ ...menu, translations })} description />
              <Rows {...translated} kind="category" items={menu.categories} canAdd={counts.categories < 80}
                create={() => ({ ...blankText(), products: [] })} onChange={(categories) => setMenu({ ...menu, categories })}>
                {(category, setCategory) => (
                  <>
                    <Translations {...translated} value={category.translations} onChange={(translations) => setCategory({ ...category, translations })} description />
                    <Rows {...translated} kind="product" items={category.products} canAdd={counts.products < 800}
                      create={() => ({ ...blankChoice(), variants: [], modifierGroups: [] })} onChange={(products) => setCategory({ ...category, products })}>
                      {(product, setProduct) => (
                        <>
                          <Translations {...translated} value={product.translations} onChange={(translations) => setProduct({ ...product, translations })} description />
                          <Price price={product.price} currency={restaurant.currencyCode} disabled={disabled} onChange={(price) => setProduct({ ...product, price })} />
                          <Rows {...translated} kind="variant" items={product.variants} canAdd={product.variants.length < 32}
                            create={blankChoice} onChange={(variants) => setProduct({ ...product, variants })}>
                            {(variant, setVariant) => (
                              <>
                                <Translations {...translated} value={variant.translations} onChange={(translations) => setVariant({ ...variant, translations })} />
                                <Price price={variant.price} currency={restaurant.currencyCode} disabled={disabled} onChange={(price) => setVariant({ ...variant, price })} label="fullPrice" />
                              </>
                            )}
                          </Rows>
                          <Rows {...translated} kind="group" items={product.modifierGroups} canAdd={product.modifierGroups.length < 20}
                            create={() => ({ ...blankText(), minSelections: 0, maxSelections: 1, options: [] })}
                            onChange={(modifierGroups) => setProduct({ ...product, modifierGroups })}>
                            {(group, setGroup) => (
                              <>
                                <Translations {...translated} value={group.translations} onChange={(translations) => setGroup({ ...group, translations })} description />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <SelectionCount label="min" value={group.minSelections} disabled={disabled} onChange={(minSelections) => setGroup({ ...group, minSelections })} />
                                  <SelectionCount label="max" value={group.maxSelections} disabled={disabled} onChange={(maxSelections) => setGroup({ ...group, maxSelections })} />
                                </div>
                                <Rows {...translated} kind="option" items={group.options} canAdd={group.options.length < 32}
                                  create={blankChoice} onChange={(options) => setGroup({ ...group, options })}>
                                  {(option, setOption) => (
                                    <>
                                      <Translations {...translated} value={option.translations} onChange={(translations) => setOption({ ...option, translations })} />
                                      <Price price={option.price} currency={restaurant.currencyCode} disabled={disabled} onChange={(price) => setOption({ ...option, price })} label="extraPrice" />
                                    </>
                                  )}
                                </Rows>
                              </>
                            )}
                          </Rows>
                        </>
                      )}
                    </Rows>
                  </>
                )}
              </Rows>
            </>
          )}
        </Rows>
      </div>
    </Card>
  );
}

function Rows<T extends Translated>({ kind, items, disabled, defaultLocale, canAdd, create, onChange, children }: {
  kind: Kind;
  items: T[];
  disabled: boolean;
  defaultLocale: string;
  canAdd: boolean;
  create: () => T;
  onChange: (items: T[]) => void;
  children: (item: T, update: (item: T) => void) => ReactNode;
}) {
  const { t, fmt } = useI18n();
  const id = useId();
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-heading`} className="text-sm font-semibold">{t(`onboarding.menu.list.${kind}`)}</h3>
        {!disabled ? (
          <Button type="button" disabled={!canAdd} onClick={() => {
            setExpanded(items.length);
            onChange([...items, create()]);
          }}>{t(`onboarding.menu.add.${kind}`)}</Button>
        ) : null}
      </div>
      {!canAdd && !disabled ? <p className="text-xs text-muted-foreground">{t("onboarding.menu.limit")}</p> : null}
      {items.length ? (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const prefix = t(`onboarding.menu.item.${kind}`, { n: fmt.number(index + 1) });
            const name = item.translations.find((entry) => entry.locale === defaultLocale && entry.name.trim())?.name ??
              item.translations.find((entry) => entry.name.trim())?.name;
            const open = expanded === index;
            return (
              <li key={index} className="min-w-0 overflow-hidden rounded-lg border border-border">
                <button type="button" aria-expanded={open} aria-controls={`${id}-${index}`} onClick={() => setExpanded(open ? null : index)}
                  className="flex min-h-11 w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 bg-surface-2 px-2 py-2 text-start text-sm focus-visible:outline-offset-[-2px] sm:px-3">
                  <span aria-hidden="true" className="w-3 shrink-0 text-center">{open ? "−" : "+"}</span>
                  <span className="shrink-0 font-medium">{prefix}</span>
                  {name ? <bdi className="min-w-0 break-words text-muted-foreground">{name}</bdi> : null}
                  {kind === "menu" && index === 0 ? <Badge tone="primary">{t("onboarding.menu.primary")}</Badge> : null}
                </button>
                <div id={`${id}-${index}`} hidden={!open}>
                  {open ? (
                    <div className="min-w-0 space-y-4 p-2 sm:p-3">
                      {children(item, (updated) => onChange(items.map((entry, i) => i === index ? updated : entry)))}
                      {!disabled ? <RemoveRow key={index} label={prefix} onRemove={() => {
                        setExpanded(null);
                        onChange(items.filter((_, i) => i !== index));
                      }} /> : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="text-xs text-muted-foreground">{t("onboarding.menu.empty")}</p>}
    </section>
  );
}

function RemoveRow({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return asking ? (
    <div className="flex flex-wrap items-center gap-2">
      <p className="w-full text-xs text-muted-foreground">{t("onboarding.menu.removeConfirm", { item: label })}</p>
      <Button type="button" variant="danger" onClick={onRemove}>{t("onboarding.menu.remove", { item: label })}</Button>
      <Button type="button" onClick={() => setAsking(false)}>{t("common.back")}</Button>
    </div>
  ) : <Button type="button" variant="ghost" onClick={() => setAsking(true)}>{t("onboarding.menu.remove", { item: label })}</Button>;
}

function Translations({ value, defaultLocale, enabledLocales, disabled, description, onChange }: {
  value: MenuTranslation[];
  defaultLocale: string;
  enabledLocales: string[];
  disabled: boolean;
  description?: boolean;
  onChange: (value: MenuTranslation[]) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const locales = Array.from(new Set([...enabledLocales, ...value.map((entry) => entry.locale)]));
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {locales.map((locale) => {
        const current = value.find((entry) => entry.locale === locale);
        const language = locale === "ar" ? "العربية" : locale === "en" ? "English" : locale;
        const required = locale === defaultLocale;
        const active = enabledLocales.includes(locale);
        const update = (patch: Partial<MenuTranslation>) => onChange(current
          ? value.map((entry) => entry === current ? { ...entry, ...patch } : entry)
          : [...value, { locale, name: "", ...patch }]);
        return (
          <fieldset key={locale} className="min-w-0 space-y-2 rounded-lg border border-border px-2 pb-2 sm:px-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              {language} · {required ? t("onboarding.menu.defaultLocale") : t(active ? "onboarding.menu.optionalLocale" : "onboarding.menu.inactiveLocale")}
            </legend>
            <TextField id={`${id}-${locale}-name`} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}
              label={t("onboarding.menu.name")} maxLength={120} value={current?.name ?? ""} disabled={disabled || !active}
              onValue={(name) => update({ name })} />
            {description ? <TextField id={`${id}-${locale}-description`} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}
              label={t("onboarding.menu.description")} maxLength={500} value={current?.description ?? ""} disabled={disabled || !active}
              onValue={(description) => update({ description })} /> : null}
            {!required && current && !disabled ? <Button type="button" variant="ghost" onClick={() => onChange(value.filter((entry) => entry.locale !== locale))}>
              {t("onboarding.menu.removeTranslation", { language })}
            </Button> : null}
          </fieldset>
        );
      })}
    </div>
  );
}

function Price({ price, currency, onChange, disabled, label = "price" }: {
  price: string;
  currency: string | null;
  onChange: (price: string) => void;
  disabled: boolean;
  label?: "price" | "fullPrice" | "extraPrice";
}) {
  const { t } = useI18n();
  const id = useId();
  return <TextField id={id} label={<>{t(`onboarding.menu.${label}`)} {currency ? <bdi>({currency})</bdi> : null}</>}
    value={price} onValue={onChange} disabled={disabled} maxLength={15} inputMode="decimal" ltr autoComplete="off" />;
}

function SelectionCount({ label, value, disabled, onChange }: {
  label: "min" | "max";
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return <TextField id={id} label={t(`onboarding.menu.${label}`)} type="number" min={0} max={32} step={1} inputMode="numeric"
    value={String(value)} disabled={disabled} ltr onValue={(text) => {
      const next = Number(text);
      if (Number.isInteger(next) && next >= 0 && next <= 32) onChange(next);
    }} />;
}
