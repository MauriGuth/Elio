import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsObject,
  IsInt,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { LocationTypeEnum } from './create-location.dto';

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(LocationTypeEnum)
  type?: LocationTypeEnum;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;

  @IsOptional()
  @IsBoolean()
  hasTables?: boolean;

  /** Punto de venta AFIP para este local (opcional; si no se define, se usa el global). */
  @IsOptional()
  @IsInt()
  @Min(1)
  arcaPtoVta?: number;

  /** Plano del local: paredes, etc. { walls: [{ x1, y1, x2, y2 }] } */
  @IsOptional()
  @IsObject()
  mapConfig?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  geofenceRadiusMeters?: number;
}
