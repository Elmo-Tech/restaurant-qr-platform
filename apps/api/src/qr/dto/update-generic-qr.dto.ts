import { IsIn } from 'class-validator';

export const GENERIC_QR_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type GenericQrStatusInput = (typeof GENERIC_QR_STATUSES)[number];

/** FT-9: the only client-writable Generic QR field -- its lifecycle status. */
export class UpdateGenericQrDto {
  @IsIn(GENERIC_QR_STATUSES, {
    message: `status must be one of: ${GENERIC_QR_STATUSES.join(', ')}`,
  })
  status!: GenericQrStatusInput;
}
