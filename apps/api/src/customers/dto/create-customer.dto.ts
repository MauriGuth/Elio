import {
  IsString,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  locationId: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsString()
  @MaxLength(20)
  cuit: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  /** Límite de cuenta corriente (opcional). Si se setea, el cliente puede recibir ventas a cuenta corriente. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  /** `client` = cliente · `employee` = empleado */
  @IsOptional()
  @IsIn(['client', 'employee'])
  accountKind?: 'client' | 'employee';
}
