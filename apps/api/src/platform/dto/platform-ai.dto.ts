import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The AI settings the Platform team changes from the console (DEC-059). The values are only shape-checked here;
 * `AiSettingsService` applies the real rules (model name pattern, label length, key format) and answers a stable code.
 */
export class UpdatePlatformAiSettingsDto {
  @IsOptional()
  @IsIn(['N8N', 'DIRECT'])
  engine?: 'N8N' | 'DIRECT';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  /** null or an empty text removes the fallback model. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fallbackModel?: string | null;
}

export class AddPlatformAiKeyDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  /** The API key itself. It is encrypted at once and never returned. */
  @IsString()
  @MaxLength(600)
  secret!: string;
}

export class UpdatePlatformAiKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
