import { IsDefined, IsIn, ValidateIf } from 'class-validator';
import { MENU_TEMPLATE_KEYS, type MenuTemplateKey } from '../../entitlements/templates';

export const EXCLUSIVE_DESIGN_STATUSES = [
  'RESERVED',
  'ACTIVE_BASE',
  'ACTIVE_CUSTOM',
  'DISABLED',
] as const;

export type ExclusiveDesignMode =
  (typeof EXCLUSIVE_DESIGN_STATUSES)[number];

export const VERIFIED_EXCLUSIVE_RENDERERS = ['VERDE_NAPOLI_V1'] as const;
export type VerifiedExclusiveRenderer = (typeof VERIFIED_EXCLUSIVE_RENDERERS)[number];

export class ExclusiveDesignDto {
  /** Temporary stock renderer; not a new global package template. */
  @IsIn(MENU_TEMPLATE_KEYS)
  baseTemplate!: MenuTemplateKey;

  /** Only Platform Admin may reserve, activate or disable the private slot. */
  @IsIn(EXCLUSIVE_DESIGN_STATUSES)
  status!: ExclusiveDesignMode;

  /** Required only when publishing a compiled bespoke renderer; never arbitrary HTML/CSS/JS. */
  @ValidateIf((value: ExclusiveDesignDto) => value.status === 'ACTIVE_CUSTOM')
  @IsDefined()
  @IsIn(VERIFIED_EXCLUSIVE_RENDERERS)
  rendererKey?: VerifiedExclusiveRenderer;
}
