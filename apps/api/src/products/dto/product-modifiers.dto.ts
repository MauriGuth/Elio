import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductModifierGroupDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSelect?: number;
}

export class UpdateProductModifierGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSelect?: number;
}

export class CreateProductModifierOptionDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  priceDelta?: number;
}

export class UpdateProductModifierOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  priceDelta?: number;
}

export class ModifierStockLineInputDto {
  @IsString()
  productId: string;

  /** Por unidad vendida: positivo = más consumo, negativo = menos (ej. “sin” un ingrediente de la receta). */
  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  quantity: number;
}

export class SetModifierStockLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierStockLineInputDto)
  lines: ModifierStockLineInputDto[];
}
