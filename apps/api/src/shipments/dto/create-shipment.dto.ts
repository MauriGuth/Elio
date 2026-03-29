import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateShipmentItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.01)
  sentQty: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsString()
  lotNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateShipmentDto {
  @IsString()
  originId: string;

  /** Obligatorio si el origen es el local «retiro en proveedor». */
  @IsOptional()
  @IsString()
  pickupSupplierId?: string;

  @IsString()
  destinationId: string;

  @IsOptional()
  @IsDateString()
  estimatedArrival?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedDurationMin?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items: CreateShipmentItemDto[];
}
