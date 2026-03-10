import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
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
}
