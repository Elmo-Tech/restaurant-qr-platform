import { ApiError } from '../api/errors';
import { messages, type MessageKey } from '../i18n/messages';
import { isUnauthenticatedError, redirectToLogin } from '../menu/error-message';

function hasProblem(caught: ApiError, code: string): boolean {
  const problems = (caught.details as { problems?: { code?: unknown }[] } | undefined)?.problems;
  return Array.isArray(problems) && problems.some((problem) => problem.code === code);
}

export function promotionError(caught: unknown): MessageKey {
  if (isUnauthenticatedError(caught)) redirectToLogin();
  if (!(caught instanceof ApiError)) return 'error.network';
  if (caught.code === 'PROMOTION_INVALID' && hasProblem(caught, 'FIXED_ITEM_SCOPE_NOT_ENABLED')) return 'error.FIXED_ITEM_SCOPE_NOT_ENABLED';
  if (caught.code === 'PROMOTION_INVALID' && hasProblem(caught, 'MINIMUM_SUBTOTAL_REQUIRED')) return 'error.MINIMUM_SUBTOTAL_REQUIRED';
  if (caught.code === 'PROMOTION_INVALID' && hasProblem(caught, 'MINIMUM_SUBTOTAL_NOT_POSITIVE')) return 'error.MINIMUM_SUBTOTAL_NOT_POSITIVE';
  const key = `error.${caught.code}`;
  return Object.hasOwn(messages.en, key) ? key as MessageKey : 'promotions.requestError';
}

export function needsPromotionReload(caught: unknown): boolean {
  return !(caught instanceof ApiError) || caught.status >= 500 || caught.status === 404 ||
    caught.code === 'PROMOTION_CHANGED' || caught.code === 'PROMOTION_ARCHIVED';
}
