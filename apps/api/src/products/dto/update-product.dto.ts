import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  Min,
  IsObject,
  IsIn,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(100)
  familia?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(100)
  subfamilia?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lastCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsBoolean()
  isSellable?: boolean;

  @IsOptional()
  @IsBoolean()
  isIngredient?: boolean;

  @IsOptional()
  @IsBoolean()
  isProduced?: boolean;

  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  /** Al vender, descontar insumos de la receta (café/bar al momento) en lugar del producto terminado. */
  @IsOptional()
  @IsBoolean()
  consumeRecipeOnSale?: boolean;

  /** null limpia el valor y vuelve a la inferencia por categoría en el POS. */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsIn(['kitchen', 'bar', 'coffee', 'bakery'])
  preparationSector?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  /** Precio de venta por local (locationId -> precio). Si no se indica para un local, se usa salePrice del producto. */
  @IsOptional()
  @IsObject()
  salePriceByLocation?: Record<string, number>;

  /** Alias en PascalCase por si el cliente o proxy envía así (forbidNonWhitelisted). */
  @IsOptional()
  @IsObject()
  SalePriceByLocation?: Record<string, number>;
}
