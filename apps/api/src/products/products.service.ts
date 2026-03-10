import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    search?: string;
    categoryId?: string;
    familia?: string;
    /** Si se envía, solo devuelve productos que tienen stock (StockLevel) en ese local. Para POS/cajas por local. */
    locationId?: string;
    isActive?: boolean;
    isSellable?: boolean;
    isIngredient?: boolean;
    isProduced?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (filters.locationId?.trim()) {
      where.stockLevels = {
        some: { locationId: filters.locationId.trim() },
      };
    }

    if (filters.search?.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { barcode: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.familia?.trim()) {
      where.familia = filters.familia.trim();
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.isSellable !== undefined) {
      where.isSellable = filters.isSellable;
    }

    if (filters.isIngredient !== undefined) {
      where.isIngredient = filters.isIngredient;
    }

    if (filters.isProduced !== undefined) {
      where.isProduced = filters.isProduced;
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          stockLevels: {
            include: {
              location: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        stockLevels: {
          include: {
            location: true,
          },
        },
        productSuppliers: {
          include: {
            supplier: true,
          },
        },
        recipeIngredients: {
          include: {
            recipe: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return product;
  }

  async create(data: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { sku: data.sku },
    });

    if (existing) {
      throw new ConflictException(`Product with SKU "${data.sku}" already exists`);
    }

    const category = await this.prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${data.categoryId}" not found`);
    }

    return this.prisma.product.create({
      data,
      include: {
        category: true,
        stockLevels: {
          include: {
            location: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (data.sku && data.sku !== product.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { sku: data.sku, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Product with SKU "${data.sku}" already exists`);
      }
    }

    if (data.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID "${data.categoryId}" not found`);
      }
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
        stockLevels: {
          include: {
            location: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getStockByLocation(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    return this.prisma.stockLevel.findMany({
      where: { productId },
      include: {
        location: true,
      },
      orderBy: { location: { name: 'asc' } },
    });
  }
}
