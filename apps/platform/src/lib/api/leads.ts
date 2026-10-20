import { platformFetch } from "./client";

/** Mirrors the Backend's inbox of landing page requests (`apps/api/src/platform/leads`, DEC-053). */
export type LeadKind = "SUBSCRIBE" | "TRIAL";
export type LeadStatus = "NEW" | "CONTACTED" | "DONE" | "DISMISSED";

export interface SignupLead {
  id: string;
  kind: LeadKind;
  packageName: string | null;
  name: string;
  email: string;
  phone: string;
  restaurantName: string | null;
  message: string | null;
  locale: string;
  status: LeadStatus;
  note: string | null;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
}

export const listLeads = (filter: "open" | "all") =>
  platformFetch<{ data: SignupLead[] }>(`/leads?filter=${filter}`).then((r) => r.data);

/** `note` missing keeps the note; an empty text clears it. */
export const updateLead = (id: string, input: { status: LeadStatus; note?: string }) =>
  platformFetch<{ data: SignupLead }>(`/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  }).then((r) => r.data);
