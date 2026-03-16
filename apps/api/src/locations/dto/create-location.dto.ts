import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum LocationTypeEnum {
  WAREHOUSE = 'WAREHOUSE',
  CAFE = 'CAFE',
  RESTAURANT = 'RESTAURANT',
  EXPRESS = 'EXPRESS',
  HOTEL = 'HOTEL',
}

export class CreateLocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEnum(LocationTypeEnum)
  type: LocationTypeEnum;

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

  /** Punto de venta AFIP para este local (opcional). */
  @IsOptional()
  @IsInt()
  @Min(1)
  arcaPtoVta?: number;

  /** Latitud para geofence (obligatorio para restricción por GPS). */
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  /** Radio en metros para considerar "en el local" (default 200). */
  @IsOptional()
  @IsInt()
  @Min(50)
  geofenceRadiusMeters?: number;
}
