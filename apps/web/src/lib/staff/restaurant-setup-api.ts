import { apiFetch } from '../api/client';
import type { SetupStepView } from './restaurant-setup';

export interface LiveSetupStatus {
  enrolled: boolean;
  hidden: boolean;
  completed: boolean;
  owner: boolean;
  canReview: boolean;
  steps: SetupStepView[];
}

export type SetupReviewAction =
  | 'LANGUAGES' | 'ORDERING' | 'PREVIEW' | 'BRANDING_SKIP';

const endpoint = (restaurantId: string) =>
  '/restaurants/' + encodeURIComponent(restaurantId) + '/setup';

/** Only the NestJS API computes truth, validates reviews and persists state. */
export async function getSetupStatus(restaurantId: string): Promise<LiveSetupStatus> {
  const response = await apiFetch<{ data: LiveSetupStatus }>(endpoint(restaurantId));
  return response.data;
}

async function post(restaurantId: string, path: string, body?: unknown): Promise<LiveSetupStatus> {
  const response = await apiFetch<{ data: LiveSetupStatus }>(endpoint(restaurantId) + path, {
    method: 'POST',
    ...(body !== undefined ? { body } : {}),
  });
  return response.data;
}

export const enrollSetup = (restaurantId: string) => post(restaurantId, '/enroll');
export const setSetupVisibility = (restaurantId: string, hidden: boolean) =>
  post(restaurantId, '/visibility', { hidden });
export const reviewSetupStep = (restaurantId: string, step: SetupReviewAction) =>
  post(restaurantId, '/review', { step });
export const completeSetup = (restaurantId: string) => post(restaurantId, '/complete');
