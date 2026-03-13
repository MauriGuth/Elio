import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(locationId: string, search?: string) {
    const where: any = { locationId, isActive: true };
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { cuit: { contains: term } },
      ];
    }
    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findByCuit(locationId: string, cuit: string) {
    const normalized = cuit.replace(/\D/g, '');
    return this.prisma.customer.findFirst({
      where: {
        locationId,
        isActive: true,
        OR: [
          { cuit: cuit },
          { cuit: normalized },
          { cuit: normalized.replace(/^(\d{2})(\d{8})(\d)$/, '$1-$2-$3') },
        ],
      },
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const cuitNorm = dto.cuit.replace(/\D/g, '');
    const existing = await this.prisma.customer.findFirst({
      where: {
        locationId: dto.locationId,
        OR: [
          { cuit: dto.cuit },
          { cuit: cuitNorm },
          { cuit: cuitNorm.length === 11 ? `${cuitNorm.slice(0, 2)}-${cuitNorm.slice(2, 10)}-${cuitNorm.slice(10)}` : dto.cuit },
        ],
      },
    });
    if (existing) {
      throw new ConflictException('Ya existe un cliente con ese CUIT en este local');
    }
    return this.prisma.customer.create({
      data: {
        locationId: dto.locationId,
        name: dto.name,
        legalName: dto.legalName,
        cuit: dto.cuit,
        taxCondition: dto.taxCondition,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        email: dto.email,
        address: dto.address,
        phone: dto.phone,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findById(id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.cuit !== undefined && { cuit: dto.cuit }),
        ...(dto.taxCondition !== undefined && { taxCondition: dto.taxCondition }),
        ...(dto.documentType !== undefined && { documentType: dto.documentType }),
        ...(dto.documentNumber !== undefined && { documentNumber: dto.documentNumber }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
