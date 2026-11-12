import { platformFetch } from "./client";
import { PLATFORM_API } from "./config";
import { ApiError } from "./errors";

export type FoodSector = "RESTAURANT" | "CAFE" | "SWEETS" | "BUTCHER" | "HOME_FOOD";
export type FoodPresentation = "UNSPECIFIED" | "RAW" | "COOKED" | "READY_TO_SERVE";
export type FoodImageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export const SECTORS: FoodSector[] = ["RESTAURANT", "CAFE", "SWEETS", "BUTCHER", "HOME_FOOD"];
export const PRESENTATIONS: FoodPresentation[] = ["RAW", "COOKED", "READY_TO_SERVE"];

export interface FoodTag {
  id: string;
  code: string;
  group: string;
  nameAr: string;
  nameEn: string;
  nameIt: string;
}
export interface FoodImageAsset {
  id: string;
  name: string;
  originalFilename: string;
  assetPath: string;
  status: FoodImageStatus;
  presentation: FoodPresentation;
  sectors: FoodSector[];
  tags: FoodTag[];
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}
export interface ImagePage { items: FoodImageAsset[]; total: number; page: number; pageSize: number }
export interface ImageFilters {
  search?: string;
  sector?: FoodSector | "";
  presentation?: FoodPresentation | "";
  status?: FoodImageStatus | "";
  page?: number;
  pageSize?: number;
}
export interface ReviewInput {
  name: string;
  presentation: Exclude<FoodPresentation, "UNSPECIFIED">;
  sectors: FoodSector[];
  tagIds: string[];
}

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
};

export const listFoodImages = async (filters: ImageFilters = {}) => {
  const qs = queryString(filters);
  return (await platformFetch<{ data: ImagePage }>("/food-images" + (qs ? "?" + qs : ""))).data;
};
export const listFoodTags = async (search: string, limit = 25) =>
  (await platformFetch<{ data: FoodTag[] }>("/food-tags?" + queryString({ search, limit }))).data;
export const suggestFoodTags = async (name: string) =>
  (await platformFetch<{ data: FoodTag[] }>("/food-tags/suggest?" + queryString({ name }))).data;
export const getFoodImage = async (id: string) =>
  (await platformFetch<{ data: FoodImageAsset }>("/food-images/" + encodeURIComponent(id))).data;
export const foodImagePreviewUrl = (id: string) =>
  PLATFORM_API + "/food-images/" + encodeURIComponent(id) + "/preview";

export async function uploadFoodImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch(PLATFORM_API + "/food-images/upload", {
    method: "POST", credentials: "include", body: form,
  });
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, parsed);
  return (parsed as { data: { image: FoodImageAsset; suggestions: FoodTag[] } }).data;
}

export const reviewFoodImage = async (id: string, body: ReviewInput) =>
  (await platformFetch<{ data: FoodImageAsset }>("/food-images/" + encodeURIComponent(id) + "/review", { method: "POST", body })).data;

export const bulkApplyFoodImages = async (body: {
  ids: string[];
  presentation?: FoodPresentation;
  sectors?: FoodSector[];
  addTagIds?: string[];
}) =>
  (await platformFetch<{ data: { updated: number } }>("/food-images/bulk-apply", { method: "POST", body })).data;

export const publishFoodImages = async (ids: string[]) =>
  (await platformFetch<{ data: { published: number } }>("/food-images/publish", { method: "POST", body: { ids } })).data;

export const archiveFoodImage = async (id: string) =>
  (await platformFetch<{ data: { id: string; status: "ARCHIVED" } }>("/food-images/" + encodeURIComponent(id) + "/archive", { method: "POST" })).data;
export const restoreFoodImage = async (id: string) =>
  (await platformFetch<{ data: { id: string; status: "DRAFT" } }>("/food-images/" + encodeURIComponent(id) + "/restore", { method: "POST" })).data;
