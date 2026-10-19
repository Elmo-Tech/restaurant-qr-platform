import { platformFetch } from "./client";

/** Mirrors the Backend's upgrade / renewal request inbox (`apps/api/src/platform/requests`, DEC-050). */
export type RequestKind = "UPGRADE" | "RENEWAL";
export type RequestStatus = "NEW" | "CONTACTED" | "DONE" | "DISMISSED";

export interface SubscriptionRequest {
  id: string;
  kind: RequestKind;
  packageName: string | null;
  message: string | null;
  status: RequestStatus;
  note: string | null;
  requestedByEmail: string;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
  restaurant: { id: string; name: string; status: string; packageName: string | null };
}

export const listRequests = (filter: "open" | "all") =>
  platformFetch<{ data: SubscriptionRequest[] }>(`/subscription-requests?filter=${filter}`).then((r) => r.data);

/** `note` missing keeps the note; an empty text clears it. */
export const updateRequest = (id: string, input: { status: RequestStatus; note?: string }) =>
  platformFetch<{ data: SubscriptionRequest }>(`/subscription-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  }).then((r) => r.data);
