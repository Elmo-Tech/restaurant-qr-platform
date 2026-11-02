import { IsIn } from 'class-validator';
import { MENU_TEMPLATE_KEYS, type MenuTemplateKey } from '../../entitlements/templates';

export const EXCLUSIVE_DESIGN_STATUSES = [
  'RESERVED',
  'ACTIVE_BASE',
  'DISABLED',
] as const;

export type ExclusiveDesignMode =
  (typeof EXCLUSIVE_DESIGN_STATUSES)[number];

export class ExclusiveDesignDto {
  /** Temporary stock renderer; not a new global package template. */
  @IsIn(MENU_TEMPLATE_KEYS)
  baseTemplate!: MenuTemplateKey;

  /** Only Platform Admin may reserve, activate or disable the private slot. */
  @IsIn(EXCLUSIVE_DESIGN_STATUSES)
  status!: ExclusiveDesignMode;
}
