import { IsBoolean } from 'class-validator';

/** The Restaurant's choice: show its exclusive design (true) or its stock template (false). */
export class ExclusiveDesignSelectionDto {
  @IsBoolean()
  useExclusive!: boolean;
}
