import { ForbiddenException } from '@nestjs/common';
import type { FeatureNotAvailableError } from './features';

/**
 * The response for a Staff action that needs a feature the platform has not allowed this Restaurant
 * (DEC-043): `403 FEATURE_NOT_AVAILABLE`, naming the feature so the dashboard can say which one.
 */
export function featureNotAvailableException(
  error: FeatureNotAvailableError,
): ForbiddenException {
  return new ForbiddenException({
    error: {
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'This feature is not included in the restaurant package.',
      feature: error.feature,
    },
  });
}
