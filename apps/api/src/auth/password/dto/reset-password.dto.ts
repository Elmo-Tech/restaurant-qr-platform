import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty({ message: 'newPassword should not be empty' })
  @Length(10, 128, { message: 'newPassword must be between 10 and 128 characters' })
  newPassword!: string;
}
