import { IsIn } from 'class-validator';
import { EDITORIAL_PRICE_DISPLAYS, type EditorialPriceDisplay } from '../editorial-template-config';

export class EditorialTemplateSettingsDto {
  @IsIn(EDITORIAL_PRICE_DISPLAYS)
  priceDisplay!: EditorialPriceDisplay;
}
