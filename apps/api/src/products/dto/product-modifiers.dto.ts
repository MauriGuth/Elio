import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  ValidateIf,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Regla POS: mostrar grupo solo si la opción del grupo con `whenPriorGroupSortOrder` coincide en `label`. */
export type ModifierVisibilityRuleDto = {
  whenPriorGroupSortOrder: number;
  whenSelectedOptionLabels: string[];
  whenPriorGroupId?: string;
  whenPriorGroupIds?: string[];
};

/** Clase anidada requerida por ValidationPipe (whitelist + transform) para que `visibilityRule` no se pierda. */
export class ModifierVisibilityRuleBodyDto implements ModifierVisibilityRuleDto {
  @IsInt()
  whenPriorGroupSortOrder!: number;

  /** Si varios grupos comparten `sortOrder`, el POS/API usan este id para no confundir el grupo «padre». */
  @IsOptional()
  @IsString()
  whenPriorGroupId?: string;

  /** Múltiples grupos de referencia (OR): visible si coincide con cualquiera. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whenPriorGroupIds?: string[];

  @IsArray()
  @IsString({ each: true })
  whenSelectedOptionLabels!: string[];
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ModifierVisibilityRuleBodyDto)
  visibilityRule?: ModifierVisibilityRuleBodyDto;
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

  /** null = quitar regla. Objeto = regla POS (requiere clase anidada para que pase el ValidationPipe). */
  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @ValidateNested()
  @Type(() => ModifierVisibilityRuleBodyDto)
  visibilityRule?: ModifierVisibilityRuleBodyDto | null;
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

/** Crea opción POS + insumos por venta a partir de ingredientes base de una receta (sin crear otra receta). */
export class CreateModifierOptionFromRecipeDto {
  @IsString()
  recipeId!: string;

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
