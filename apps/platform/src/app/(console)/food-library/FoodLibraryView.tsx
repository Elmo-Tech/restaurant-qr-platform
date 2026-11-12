"use client";

/* eslint-disable @next/next/no-img-element -- Cookie-authenticated API preview is not a Next image optimization resource. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { IconCheck, IconPlus, IconSearch, IconX } from "@/components/icons";
import { useI18n } from "@/lib/i18n/client";
import {
  archiveFoodImage, bulkApplyFoodImages, foodImagePreviewUrl, getFoodImage,
  listFoodImages, listFoodTags, PRESENTATIONS, publishFoodImages,
  reviewFoodImage, restoreFoodImage, SECTORS, suggestFoodTags, uploadFoodImage,
  type FoodImageAsset, type FoodImageStatus, type FoodPresentation, type FoodSector,
  type FoodTag, type ImageFilters,
} from "@/lib/api/food-library";

type Feedback = { tone: "success" | "danger"; text: string } | null;
type ReviewDraft = { name: string; presentation: FoodPresentation; sectors: FoodSector[]; tagIds: string[] };
const EMPTY_FILTERS: ImageFilters = { search: "", status: "", presentation: "", sector: "" };
const MAX_FILES = 30;

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return "Request failed.";
}

function selectedTagLabel(tag: FoodTag, locale: string): string {
  return locale === "ar" ? tag.nameAr : tag.nameEn;
}

function TagChips({ image, locale }: { image: FoodImageAsset; locale: string }) {
  return (
    <div className="mt-2 flex min-h-5 flex-wrap gap-1">
      {image.tags.slice(0, 3).map((tag) => (
        <span key={tag.id} title={tag.nameIt} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {selectedTagLabel(tag, locale)}
        </span>
      ))}
      {image.tags.length > 3 ? <span className="text-xs text-muted-foreground">+{image.tags.length - 3}</span> : null}
    </div>
  );
}

/**
 * App-like, mobile-first platform gallery.
 * Suggestions NEVER set RAW/COOKED/sector and do not approve an image.
 */
export function FoodLibraryView() {
  const { t, locale } = useI18n();
  const [filters, setFilters] = useState<ImageFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [images, setImages] = useState<FoodImageAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [detail, setDetail] = useState<FoodImageAsset | null>(null);
  const [review, setReview] = useState<ReviewDraft>({ name: "", presentation: "UNSPECIFIED", sectors: [], tagIds: [] });
  const [suggestions, setSuggestions] = useState<FoodTag[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<FoodTag[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkState, setBulkState] = useState<FoodPresentation | "">("");
  const [bulkSector, setBulkSector] = useState<FoodSector | "">("");
  const [bulkTag, setBulkTag] = useState<FoodTag | null>(null);
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkResults, setBulkResults] = useState<FoodTag[]>([]);
  const pickRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef(0);
  const detailId = useRef<string | null>(null);

  const load = useCallback(async (nextFilters: ImageFilters, nextPage: number) => {
    const request = ++loadRef.current;
    setLoading(true);
    try {
      const result = await listFoodImages({ ...nextFilters, page: nextPage, pageSize: 24 });
      if (request !== loadRef.current) return;
      setImages(result.items);
      setTotal(result.total);
    } catch (caught) {
      if (request === loadRef.current) setFeedback({ tone: "danger", text: errorMessage(caught) });
    } finally {
      if (request === loadRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(filters, page); }, 230);
    return () => clearTimeout(timer);
  }, [filters, page, load]);

  useEffect(() => {
    if (!detail) return;
    const timer = setTimeout(() => {
      void listFoodTags(tagQuery, 30).then(setTagResults).catch(() => setTagResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [tagQuery, detail]);

  useEffect(() => {
    if (!bulkOpen) return;
    const timer = setTimeout(() => {
      void listFoodTags(bulkQuery, 25).then(setBulkResults).catch(() => setBulkResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [bulkQuery, bulkOpen]);

  useEffect(() => {
    if (!uploadOpen && !detail && !bulkOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [uploadOpen, detail, bulkOpen]);

  const chosen = images.filter((img) => selected.includes(img.id));
  const canPublish = chosen.length > 0 && chosen.every((img) =>
    img.status !== "ARCHIVED" && img.reviewedAt && img.presentation !== "UNSPECIFIED" &&
    img.tags.length > 0 && img.sectors.length > 0,
  );

  function changeFilter(next: Partial<ImageFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setSelected([]);
    setPage(1);
    setFeedback(null);
  }

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  function chooseFiles(chosenFiles: FileList | null) {
    if (!chosenFiles?.length) return;
    setFiles([...chosenFiles].slice(0, MAX_FILES));
    setUploadProgress({ done: 0, total: 0 });
    setUploadOpen(true);
    setFeedback(null);
    if (pickRef.current) pickRef.current.value = "";
  }

  async function doUpload() {
    if (!files.length || busy) return;
    setBusy(true);
    setFeedback(null);
    setUploadProgress({ done: 0, total: files.length });
    let cursor = 0, done = 0, failed = 0;
    const workers = Array.from({ length: Math.min(3, files.length) }, async () => {
      while (cursor < files.length) {
        const file = files[cursor++];
        try {
          await uploadFoodImage(file);
        } catch {
          failed++;
        } finally {
          done++;
          setUploadProgress({ done, total: files.length });
        }
      }
    });
    await Promise.all(workers);
    setBusy(false);
    setUploadOpen(false);
    setFiles([]);
    setFilters({ ...EMPTY_FILTERS, status: "DRAFT" });
    setSelected([]);
    setPage(1);
    setFeedback(failed > 0
      ? { tone: "danger", text: t("food.uploadErrors", { count: failed }) }
      : { tone: "success", text: t("food.uploadFinished") });
    // Refresh after upload even when filters are unchanged.
    await load({ ...EMPTY_FILTERS, status: "DRAFT" }, 1);
  }

  async function openDetail(image: FoodImageAsset) {
    detailId.current = image.id;
    setDetail(image);
    setReview({
      name: image.name, presentation: image.presentation, sectors: [...image.sectors],
      tagIds: image.tags.map((tag) => tag.id),
    });
    setTagQuery("");
    setSuggestions([]);
    try {
      const suggested = await suggestFoodTags(image.name);
      if (detailId.current === image.id) setSuggestions(suggested);
    } catch {
      // A failed suggestion lookup must not block manual review.
    }
  }

  function closeDetail() {
    if (busy) return;
    detailId.current = null;
    setDetail(null);
  }

  function toggleSector(sector: FoodSector) {
    setReview((prev) => ({ ...prev, sectors: prev.sectors.includes(sector)
      ? prev.sectors.filter((s) => s !== sector) : [...prev.sectors, sector] }));
  }

  function toggleTag(id: string) {
    setReview((prev) => ({ ...prev, tagIds: prev.tagIds.includes(id)
      ? prev.tagIds.filter((tag) => tag !== id) : [...prev.tagIds, id] }));
  }

  async function saveReview() {
    if (!detail || busy) return;
    if (review.name.trim().length < 2 || review.presentation === "UNSPECIFIED" ||
        review.sectors.length === 0 || review.tagIds.length === 0) {
      setFeedback({ tone: "danger", text: t("food.reviewRequired") });
      return;
    }
    setBusy(true);
    try {
      const updated = await reviewFoodImage(detail.id, {
        name: review.name.trim(), presentation: review.presentation, sectors: review.sectors, tagIds: review.tagIds,
      });
      setDetail(updated);
      setImages((items) => items.map((item) => item.id === updated.id ? updated : item));
      setFeedback({ tone: "success", text: t("food.reviewSaved") });
    } catch (caught) {
      setFeedback({ tone: "danger", text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function publish(ids: string[]) {
    if (!ids.length || busy) return;
    if (!window.confirm(t("food.publishConfirm", { count: ids.length }))) return;
    setBusy(true);
    try {
      await publishFoodImages(ids);
      setFeedback({ tone: "success", text: t("food.published") });
      setSelected([]);
      if (detail) setDetail(await getFoodImage(detail.id));
      await load(filters, page);
    } catch (caught) {
      setFeedback({ tone: "danger", text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function archiveOrRestore() {
    if (!detail || busy) return;
    const isArchive = detail.status !== "ARCHIVED";
    if (isArchive && !window.confirm(t("food.archiveConfirm"))) return;
    setBusy(true);
    try {
      if (isArchive) await archiveFoodImage(detail.id);
      else await restoreFoodImage(detail.id);
      setFeedback({ tone: "success", text: t(isArchive ? "food.archived" : "food.restored") });
      setDetail(null);
      setSelected([]);
      await load(filters, page);
    } catch (caught) {
      setFeedback({ tone: "danger", text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function applyBulk() {
    if (!selected.length || busy) return;
    if (!bulkState && !bulkSector && !bulkTag) {
      setFeedback({ tone: "danger", text: t("food.bulkChoose") });
      return;
    }
    setBusy(true);
    try {
      await bulkApplyFoodImages({
        ids: selected,
        ...(bulkState ? { presentation: bulkState } : {}),
        ...(bulkSector ? { sectors: [bulkSector] } : {}),
        ...(bulkTag ? { addTagIds: [bulkTag.id] } : {}),
      });
      setBulkOpen(false);
      setFeedback({ tone: "success", text: t("food.bulkApplied") });
      await load(filters, page);
    } catch (caught) {
      setFeedback({ tone: "danger", text: errorMessage(caught) });
    } finally { setBusy(false); }
  }

  async function reviewSelected() {
    if (!chosen.length || busy) return;
    if (chosen.some((img) => img.status === "ARCHIVED" || img.presentation === "UNSPECIFIED" ||
      !img.name.trim() || img.tags.length === 0 || img.sectors.length === 0)) {
      setFeedback({ tone: "danger", text: t("food.reviewRequired") });
      return;
    }
    if (!window.confirm(t("food.reviewSelectedConfirm", { count: chosen.length }))) return;
    setBusy(true);
    let failed = 0;
    // Bound concurrent writes and keep each image review authoritative at the API.
    for (let start = 0; start < chosen.length; start += 3) {
      const batch = chosen.slice(start, start + 3);
      const completed = await Promise.allSettled(batch.map((img) => reviewFoodImage(img.id, {
        name: img.name,
        presentation: img.presentation as Exclude<FoodPresentation, "UNSPECIFIED">,
        sectors: img.sectors,
        tagIds: img.tags.map((tag) => tag.id),
      })));
      failed += completed.filter((item) => item.status === "rejected").length;
    }
    setBusy(false);
    setFeedback({ tone: failed ? "danger" : "success", text: t(failed ? "food.genericError" : "food.reviewSelectedDone") });
    await load(filters, page);
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("food.title")}
        description={t("food.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/food-library/tags" className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm hover:bg-surface-2">{t("tag.title")}</Link>
            <Button variant="primary" onClick={() => pickRef.current?.click()}><IconPlus />{t("food.upload")}</Button>
          </div>
        }
      />
      <input ref={pickRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
        aria-label={t("food.chooseFiles")} onChange={(e) => chooseFiles(e.target.files)} />
      {feedback ? <Alert tone={feedback.tone} className="mb-4">{feedback.text}</Alert> : null}

      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(230px,1fr)_repeat(3,minmax(130px,170px))]">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground"><IconSearch width={17} /></span>
            <Input aria-label={t("food.search")} placeholder={t("food.search")} value={filters.search ?? ""}
              onChange={(e) => changeFilter({ search: e.target.value })} className="ps-10" />
          </div>
          <Select aria-label={t("food.status")} value={filters.status ?? ""}
            onChange={(e) => changeFilter({ status: e.target.value as FoodImageStatus | "" })}>
            <option value="">{t("food.status")}: {t("food.any")}</option>
            {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((status) =>
              <option key={status} value={status}>{t("food." + status as "food.DRAFT")}</option>)}
          </Select>
          <Select aria-label={t("food.sector")} value={filters.sector ?? ""}
            onChange={(e) => changeFilter({ sector: e.target.value as FoodSector | "" })}>
            <option value="">{t("food.sector")}: {t("food.any")}</option>
            {SECTORS.map((sector) => <option key={sector} value={sector}>{t("food." + sector as "food.RESTAURANT")}</option>)}
          </Select>
          <Select aria-label={t("food.presentation")} value={filters.presentation ?? ""}
            onChange={(e) => changeFilter({ presentation: e.target.value as FoodPresentation | "" })}>
            <option value="">{t("food.presentation")}: {t("food.any")}</option>
            {PRESENTATIONS.map((p) => <option key={p} value={p}>{t("food." + p as "food.RAW")}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="text-xs font-semibold text-muted-foreground">{t("food.results", { count: total })}</span>
          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{t("food.selected", { count: selected.length })}</Badge>
              <Button size="sm" onClick={() => setSelected([])}>{t("food.clearSelection")}</Button>
              <Button size="sm" onClick={() => setBulkOpen(true)} disabled={busy}>{t("food.bulk")}</Button>
              <Button size="sm" onClick={() => void reviewSelected()} disabled={busy}>{t("food.reviewSelected")}</Button>
              <Button size="sm" variant="primary" onClick={() => void publish(selected)}
                disabled={!canPublish || busy}>{t("food.publish")}</Button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : images.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">{t("food.empty")}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:p-4 xl:grid-cols-4">
            {images.map((image) => (
              <article key={image.id} className={"min-w-0 overflow-hidden rounded-xl border bg-surface transition-shadow hover:shadow-card " +
                (selected.includes(image.id) ? "border-primary" : "border-border")}>
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
                  <button type="button" onClick={() => void openDetail(image)}
                    className="block h-full w-full" aria-label={t("food.edit") + ": " + image.name}>
                    <img src={foodImagePreviewUrl(image.id)} alt={image.name} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  <label className="absolute start-2 top-2 grid size-8 place-items-center rounded-lg border border-border bg-surface/95 shadow-card">
                    <input type="checkbox" checked={selected.includes(image.id)} onChange={() => toggle(image.id)}
                      aria-label={t("food.select") + ": " + image.name} className="size-4 accent-primary" />
                  </label>
                  <span className="absolute end-2 top-2">
                    <Badge tone={image.status === "PUBLISHED" ? "success" : image.status === "ARCHIVED" ? "neutral" : "warning"}>
                      {t("food." + image.status as "food.DRAFT")}
                    </Badge>
                  </span>
                </div>
                <div className="p-3">
                  <button type="button" onClick={() => void openDetail(image)} className="w-full truncate text-start text-[13px] font-semibold text-foreground hover:text-primary-text">
                    {image.name}
                  </button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("food." + image.presentation as "food.RAW")}
                    <span className="mx-1.5 text-border-strong">·</span>
                    {image.sectors.length ? image.sectors.map((s) => t("food." + s as "food.RESTAURANT")).join("، ") : t("food.reviewRequired")}
                  </p>
                  <TagChips image={image} locale={locale} />
                  <div className="mt-3 border-t border-border pt-2 text-[11px]">
                    {image.reviewedAt
                      ? <span className="inline-flex items-center gap-1 text-success"><IconCheck width={14} />{t("food.reviewed")}</span>
                      : <span className="text-warning">{t("food.needsReview")}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {total > 24 && (
          <div className="flex items-center justify-center gap-3 border-t border-border p-4">
            <Button size="sm" disabled={page <= 1 || loading} onClick={() => { setSelected([]); setPage((p) => p - 1); }}>{t("common.previous")}</Button>
            <span className="text-xs text-muted-foreground">{page} / {Math.ceil(total / 24)}</span>
            <Button size="sm" disabled={page >= Math.ceil(total / 24) || loading} onClick={() => { setSelected([]); setPage((p) => p + 1); }}>{t("common.next")}</Button>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">{t("food.publishHint")}</p>

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" role="presentation">
          <section role="dialog" aria-modal="true" aria-label={t("food.uploadTitle")}
            className="flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col rounded-2xl border border-border bg-surface shadow-pop">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div><h2 className="text-lg font-semibold">{t("food.uploadTitle")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("food.uploadHint")}</p></div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUploadOpen(false)}
                aria-label={t("food.close")}><IconX /></Button>
            </header>
            <div className="min-h-0 overflow-auto p-4">
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-text">▧</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>×</Button>
                  </div>
                ))}
              </div>
              {busy ? <p role="status" className="mt-3 text-sm text-primary-text">
                {t("food.uploading", { done: uploadProgress.done, total: uploadProgress.total })}</p> : null}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
              <Button disabled={busy} onClick={() => setUploadOpen(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" disabled={busy || !files.length} onClick={() => void doUpload()}>
                {t("food.uploadNow")} ({files.length})
              </Button>
            </footer>
          </section>
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 bg-black/60" role="presentation">
          <button className="absolute inset-0 h-full w-full cursor-default" aria-label={t("food.close")} onClick={closeDetail}/>
          <aside role="dialog" aria-modal="true" aria-label={t("food.detail")}
            className="absolute inset-y-0 end-0 flex w-full max-w-[540px] flex-col border-s border-border bg-surface shadow-pop">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">{t("food.detail")}</h2>
              <Button variant="ghost" size="sm" disabled={busy} onClick={closeDetail} aria-label={t("food.close")}><IconX /></Button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <div className="aspect-[16/9] overflow-hidden rounded-xl bg-surface-2">
                <img src={foodImagePreviewUrl(detail.id)} alt={detail.name} className="h-full w-full object-cover" />
              </div>
              <Alert>{t("food.reviewNote")}</Alert>
              <div><Label htmlFor="food-name">{t("food.name")}</Label>
                <Input id="food-name" value={review.name} disabled={detail.status === "ARCHIVED"}
                  onChange={(e) => setReview((p) => ({ ...p, name: e.target.value }))} /></div>
              <div><Label htmlFor="food-state">{t("food.presentation")}</Label>
                <Select id="food-state" value={review.presentation} disabled={detail.status === "ARCHIVED"}
                  onChange={(e) => setReview((p) => ({ ...p, presentation: e.target.value as FoodPresentation }))}>
                  <option value="UNSPECIFIED">{t("food.UNSPECIFIED")}</option>
                  {PRESENTATIONS.map((p) => <option value={p} key={p}>{t("food." + p as "food.RAW")}</option>)}
                </Select>
              </div>
              <div><p className="mb-2 text-[13px] font-medium">{t("food.sector")}</p>
                <div className="flex flex-wrap gap-2">{SECTORS.map((s) =>
                  <label key={s} className={"flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs " +
                    (review.sectors.includes(s) ? "border-primary bg-primary-soft text-primary-text" : "border-border bg-surface")}>
                    <input type="checkbox" checked={review.sectors.includes(s)} disabled={detail.status === "ARCHIVED"}
                      onChange={() => toggleSector(s)} className="accent-primary"/>
                    {t("food." + s as "food.RESTAURANT")}
                  </label>
                )}</div></div>

              <div><Label htmlFor="food-tags">{t("food.tags")}</Label>
                <div className="mb-2 flex flex-wrap gap-1">
                  {[...detail.tags, ...suggestions, ...tagResults].filter((tag, idx, all) =>
                    review.tagIds.includes(tag.id) && all.findIndex((x) => x.id === tag.id) === idx,
                  ).map((tag) => (
                    <button type="button" key={tag.id} disabled={detail.status === "ARCHIVED"}
                      onClick={() => toggleTag(tag.id)} title={t("food.removeTag") + ": " + tag.nameIt}
                      className="rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary-text">
                      {selectedTagLabel(tag, locale)} ×
                    </button>
                  ))}
                </div>
                <Input id="food-tags" value={tagQuery} disabled={detail.status === "ARCHIVED"}
                  placeholder={t("food.tagsSearch")} onChange={(e) => setTagQuery(e.target.value)} />
                {suggestions.some((tag) => !review.tagIds.includes(tag.id)) ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-muted-foreground">{t("food.tagSuggestion")}</p>
                    <div className="flex flex-wrap gap-1.5">{suggestions.filter((tag) => !review.tagIds.includes(tag.id)).map((tag) =>
                      <button type="button" key={tag.id} onClick={() => toggleTag(tag.id)}
                        className="rounded-md border border-dashed border-border-strong px-2 py-1 text-xs hover:bg-surface-2">
                        + {selectedTagLabel(tag, locale)}
                      </button>,
                    )}</div>
                  </div>
                ) : null}
                <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-border">
                  {tagResults.filter((tag) => !review.tagIds.includes(tag.id)).slice(0, 15).map((tag) =>
                    <button type="button" key={tag.id} onClick={() => toggleTag(tag.id)}
                      className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start text-xs hover:bg-surface-2">
                      <span>{selectedTagLabel(tag, locale)}</span><span dir="ltr" className="text-muted-foreground">{tag.code}</span>
                    </button>,
                  )}
                </div>
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <Button size="sm" disabled={busy} onClick={() => void archiveOrRestore()}>
                {t(detail.status === "ARCHIVED" ? "food.restore" : "food.archive")}
              </Button>
              <div className="flex flex-wrap gap-2">
                {detail.status === "DRAFT" && detail.reviewedAt ? (
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void publish([detail.id])}>{t("food.publish")}</Button>
                ) : null}
                {detail.status !== "ARCHIVED" ? (
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveReview()}>
                    {t("food.reviewSave")}
                  </Button>
                ) : null}
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      {bulkOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-3">
          <section role="dialog" aria-modal="true" aria-label={t("food.bulk")}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-pop">
            <header className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">{t("food.bulk")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("food.bulkHint")}</p>
            </header>
            <div className="space-y-4 p-5">
              <Badge tone="primary">{t("food.selected", { count: selected.length })}</Badge>
              <div><Label>{t("food.presentation")}</Label>
                <Select value={bulkState} onChange={(e) => setBulkState(e.target.value as FoodPresentation | "")}>
                  <option value="">{t("food.any")}</option>
                  {PRESENTATIONS.map((p) => <option key={p} value={p}>{t("food." + p as "food.RAW")}</option>)}
                </Select></div>
              <div><Label>{t("food.sector")}</Label>
                <Select value={bulkSector} onChange={(e) => setBulkSector(e.target.value as FoodSector | "")}>
                  <option value="">{t("food.any")}</option>
                  {SECTORS.map((s) => <option key={s} value={s}>{t("food." + s as "food.RESTAURANT")}</option>)}
                </Select></div>
              <div><Label>{t("food.bulkTag")}</Label>
                <Input value={bulkQuery} placeholder={t("food.tagsSearch")} onChange={(e) => { setBulkQuery(e.target.value); setBulkTag(null); }}/>
                {bulkTag ? <Badge tone="primary" className="mt-2">{selectedTagLabel(bulkTag, locale)}</Badge> : null}
                {bulkQuery && !bulkTag ? <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-border">
                  {bulkResults.map((tag) =>
                    <button type="button" key={tag.id} className="block w-full px-3 py-2 text-start text-xs hover:bg-surface-2"
                      onClick={() => { setBulkTag(tag); setBulkQuery(selectedTagLabel(tag, locale)); }}>
                      {selectedTagLabel(tag, locale)} <span className="text-muted-foreground" dir="ltr">{tag.code}</span>
                    </button>)}
                </div> : null}
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border p-4">
              <Button disabled={busy} onClick={() => setBulkOpen(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" disabled={busy || (!bulkState && !bulkSector && !bulkTag)} onClick={() => void applyBulk()}>
                {t("food.bulkApply")}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
