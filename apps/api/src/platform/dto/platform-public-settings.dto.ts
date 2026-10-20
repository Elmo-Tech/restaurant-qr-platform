import { IsUrl, MaxLength } from 'class-validator';

export class UpdatePlatformPublicSettingsDto {
  @MaxLength(2048)
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  poweredByUrl!: string;
}
