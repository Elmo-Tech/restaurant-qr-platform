import { IsIn, IsISO8601, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export const DASHBOARD_RANGES = ['today', 'yesterday', 'last7', 'last30', 'custom'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/**
 * FT-11 Section 7: the Dashboard's only supported date-range shapes.
 * `branchId` narrows within the Membership's own already-authorized Branch
 * scope, exactly like `ListOrdersQueryDto.branchId` (a foreign/unauthorized
 * value simply yields an empty result set, never a distinct error). `from`/
 * `to` are required only when `range` is `'custom'`, and are interpreted as
 * whole calendar days in the resolved Branch's own timezone (see
 * `dashboard-date-range.ts`), not raw UTC instants.
 */
export class DashboardQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;

  @IsIn(DASHBOARD_RANGES, {
    message: `range must be one of: ${DASHBOARD_RANGES.join(', ')}`,
  })
  range!: DashboardRange;

  @ValidateIf((dto: DashboardQueryDto) => dto.range === 'custom')
  @IsISO8601(
    { strict: true },
    { message: 'from must be an ISO 8601 date (e.g. 2026-09-01) when range is custom' },
  )
  from?: string;

  @ValidateIf((dto: DashboardQueryDto) => dto.range === 'custom')
  @IsISO8601(
    { strict: true },
    { message: 'to must be an ISO 8601 date (e.g. 2026-09-30) when range is custom' },
  )
  to?: string;
}
