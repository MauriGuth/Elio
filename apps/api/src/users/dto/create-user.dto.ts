import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Role } from '../../../generated/prisma';

export class CreateUserDto {
  @IsEmail({ require_tld: false })
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsEnum(Role)
  role: Role;

  /** Una ubicación (se mantiene por compatibilidad; si se envía locationIds, se usa el primero como default). */
  @IsOptional()
  @IsString()
  locationId?: string;

  /** Múltiples ubicaciones asignadas al usuario. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
