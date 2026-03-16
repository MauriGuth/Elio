import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsBoolean,
  ValidateIf,
  IsArray,
} from 'class-validator';
import { Role } from '../../../generated/prisma';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== '')
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsString()
  locationId?: string | null;

  /** Múltiples ubicaciones asignadas. Si se envía, reemplaza la lista actual. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
