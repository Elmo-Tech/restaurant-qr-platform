import { IsIn } from 'class-validator';

export const MENU_TEMPLATES = [
  'CLASSIC',
  'LIST',
  'GALLERY',
  'MENU',
  'FLOATING',
  'CENTERED',
  'COMPACT',
  'EDITORIAL',
  'EMBER',
  'BLOOM',
  'BREW',
] as const;
export type MenuTemplateInput = (typeof MENU_TEMPLATES)[number];

/** The Guest menu template (DEC-044): how the same menu is laid out. Presentation only. */
export class UpdateMenuTemplateDto {
  @IsIn(MENU_TEMPLATES, {
    message: `menuTemplate must be one of: ${MENU_TEMPLATES.join(', ')}`,
  })
  menuTemplate!: MenuTemplateInput;
}
