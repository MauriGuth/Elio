import {
  IsString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  IsObject,
  IsArray,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsString()
  sector: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** { groupId: optionId } o { groupId: [optionId, ...] } */
  @IsOptional()
  @IsObject()
  modifierSelections?: Record<string, string | string[]>;

  /** IDs de filas recipe_ingredients que el cliente quitó en el POS (afecta validación de grupos ligados). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedRecipeIngredientIds?: string[];
}
