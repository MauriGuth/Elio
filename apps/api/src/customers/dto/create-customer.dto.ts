import { IsString, IsOptional, MaxLength } from 'class-validator';

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
}
