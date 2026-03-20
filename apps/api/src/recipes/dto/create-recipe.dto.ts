import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRecipeIngredientDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0)
  qtyPerYield: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /** Grupo de opciones del producto de salida (ej. tipo de pan). El consumo base de esta fila no se suma; aplica stock por opción. */
  @IsOptional()
  @IsString()
  modifierGroupId?: string | null;
}

export class CreateRecipeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNumber()
  @Min(0.01)
  yieldQty: number;

  @IsString()
  yieldUnit: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  prepTimeMin?: number;

  /** Ubicaciones donde se puede elaborar esta receta. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  /** Tiempo de elaboración (min) por ubicación. Clave = locationId. */
  @IsOptional()
  prepTimeByLocation?: Record<string, number>;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeIngredientDto)
  ingredients?: CreateRecipeIngredientDto[];
}
