import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsDateString,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateShipmentItemDto } from './create-shipment.dto';

export class CreateShipmentStopDto {
  @IsString()
  locationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  @ArrayMinSize(1)
  items: CreateShipmentItemDto[];
}

export class CreateMultiShipmentDto {
  @IsString()
  originId: string;

  @IsOptional()
  @IsDateString()
  estimatedArrival?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Paradas en orden de visita (local 1º, 2º, …). Cada una con su lista de ítems. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentStopDto)
  @ArrayMinSize(2)
  stops: CreateShipmentStopDto[];
}
