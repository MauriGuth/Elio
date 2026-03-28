import { IsArray, IsString } from 'class-validator';

export class ReorderShipmentStopsDto {
  /** IDs de ShipmentStop en el orden deseado de visita */
  @IsArray()
  @IsString({ each: true })
  stopIds: string[];
}
