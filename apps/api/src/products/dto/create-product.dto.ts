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
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  sku: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  familia?: string;

  @IsString()
  @MaxLength(20)
  unit: string;

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  /** Precio de venta por local (locationId -> precio). Si no se indica, se usa salePrice. */
  @IsOptional()
  @IsObject()
  salePriceByLocation?: Record<string, number>;

  /** Alias en PascalCase por si el cliente o proxy envía así (forbidNonWhitelisted). */
  @IsOptional()
  @IsObject()
  SalePriceByLocation?: Record<string, number>;
}
