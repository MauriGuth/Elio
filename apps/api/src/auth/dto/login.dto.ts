import { IsEmail, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class LoginDto {
  @IsEmail({ require_tld: false })
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  /** Latitud GPS (requerida para roles con restricción por ubicación). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  /** Longitud GPS (requerida para roles con restricción por ubicación). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
}
