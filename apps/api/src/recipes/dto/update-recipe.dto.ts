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
  Max,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateRecipeIngredientDto } from './create-recipe.dto';

export class UpdateRecipeDto {
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
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  yieldQty?: number;

  @IsOptional()
  @IsString()
  yieldUnit?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  prepTimeMin?: number;

  /** Días de vida útil; null para borrar el valor. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1)
  @Max(3650)
  shelfLifeDays?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

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
