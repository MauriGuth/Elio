import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsObject,
} from 'class-validator';

/** Cantidad de billetes/monedas por denominación: { "10000": 2, "5000": 5, ... } */
export type OpenDenominationsMap = Record<string, number>;

export class OpenRegisterDto {
  @IsString()
  locationId: string;

  /**
   * Monto de apertura. Si se envía `denominations`, el servidor recalcula este valor
   * como suma de (denominación × cantidad) y persiste el desglose.
   */
  @IsNumber()
  @Min(0)
  openingAmount: number;

  /** Conteo por denominación al abrir caja (opcional). */
  @IsOptional()
  @IsObject()
  denominations?: OpenDenominationsMap;

  @IsOptional()
  @IsString()
  name?: string;

  /** Turno del día: 'morning' (mañana) | 'afternoon' (tarde) */
  @IsOptional()
  @IsString()
  shift?: string;
}
