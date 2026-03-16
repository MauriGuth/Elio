import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
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

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
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
    const { locationIds = [], salePriceByLocation = {}, ...productData } = data;

    const existing = await this.prisma.product.findUnique({
      where: { sku: productData.sku },
    });

    if (existing) {
      throw new ConflictException(`Product with SKU "${productData.sku}" already exists`);
    }

    const category = await this.prisma.category.findUnique({
      where: { id: productData.categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${productData.categoryId}" not found`);
    }

    const uniqueLocationIds = [...new Set(locationIds.filter(Boolean))];
    if (uniqueLocationIds.length > 0) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueLocationIds } },
        select: { id: true },
      });

      if (locations.length !== uniqueLocationIds.length) {
        throw new NotFoundException('One or more selected locations were not found');
      }
    }

    const priceByLoc =
      salePriceByLocation && typeof salePriceByLocation === 'object' ? salePriceByLocation : {};

    return this.prisma.product.create({
      data: {
        ...productData,
        stockLevels:
          uniqueLocationIds.length > 0
            ? {
                create: uniqueLocationIds.map((locationId) => {
                  const locPrice = priceByLoc[locationId];
                  const salePrice =
                    locPrice != null && typeof locPrice === 'number' && locPrice >= 0
                      ? locPrice
                      : productData.salePrice ?? null;
                  return {
                    locationId,
                    quantity: 0,
                    minQuantity: 0,
                    salePrice,
                  };
                }),
              }
            : undefined,
      },
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
    const { locationIds, salePriceByLocation, ...productData } = data;
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (productData.sku && productData.sku !== product.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { sku: productData.sku, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Product with SKU "${productData.sku}" already exists`);
      }
    }

    if (productData.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: productData.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID "${productData.categoryId}" not found`);
      }
    }

    const uniqueLocationIds =
      locationIds !== undefined ? [...new Set(locationIds.filter(Boolean))] : undefined;

    if (uniqueLocationIds) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueLocationIds } },
        select: { id: true },
      });
      if (locations.length !== uniqueLocationIds.length) {
        throw new NotFoundException('One or more selected locations were not found');
      }
    }

    const priceByLoc =
      salePriceByLocation && typeof salePriceByLocation === 'object' ? salePriceByLocation : {};

    const defaultSalePrice =
      productData.salePrice !== undefined ? productData.salePrice : product.salePrice;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: productData,
      });

      if (uniqueLocationIds !== undefined) {
        const existingLevels = await tx.stockLevel.findMany({
          where: { productId: id },
          select: { id: true, locationId: true },
        });
        const existingLocationIds = existingLevels.map((level) => level.locationId);
        const locationIdsToDelete = existingLocationIds.filter(
          (locationId) => !uniqueLocationIds.includes(locationId),
        );
        const locationIdsToCreate = uniqueLocationIds.filter(
          (locationId) => !existingLocationIds.includes(locationId),
        );

        if (locationIdsToDelete.length > 0) {
          await tx.stockLevel.deleteMany({
            where: {
              productId: id,
              locationId: { in: locationIdsToDelete },
            },
          });
        }

        if (locationIdsToCreate.length > 0) {
          await tx.stockLevel.createMany({
            data: locationIdsToCreate.map((locationId) => {
              const locPrice = priceByLoc[locationId];
              const salePrice =
                locPrice != null && typeof locPrice === 'number' && locPrice >= 0
                  ? locPrice
                  : defaultSalePrice ?? null;
              return {
                productId: id,
                locationId,
                quantity: 0,
                minQuantity: 0,
                salePrice,
              };
            }),
          });
        }

        if (Object.keys(priceByLoc).length > 0) {
          for (const [locationId, price] of Object.entries(priceByLoc)) {
            if (typeof price !== 'number' || price < 0) continue;
            await tx.stockLevel.updateMany({
              where: { productId: id, locationId },
              data: { salePrice: price },
            });
          }
        }
      }
    });

    return this.prisma.product.findUniqueOrThrow({
      where: { id },
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

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.productSupplier.deleteMany({ where: { productId: id } });
        await tx.stockLevel.deleteMany({ where: { productId: id } });
        await tx.stockMovement.deleteMany({ where: { productId: id } });
        await tx.stockReconciliationItem.deleteMany({ where: { productId: id } });
        await tx.wasteRecord.deleteMany({ where: { productId: id } });
        await tx.goodsReceiptItem.deleteMany({ where: { productId: id } });
        await tx.purchaseOrderItem.deleteMany({ where: { productId: id } });
        await tx.shipmentItem.deleteMany({ where: { productId: id } });
        await tx.orderItem.deleteMany({ where: { productId: id } });
        await tx.recipeIngredient.deleteMany({ where: { productId: id } });
        await tx.productionOrderItem.deleteMany({ where: { productId: id } });
        await tx.productionBatch.deleteMany({ where: { productId: id } });
        await tx.recipe.updateMany({
          where: { productId: id },
          data: { productId: null },
        });
        await tx.product.delete({ where: { id } });
      });
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new BadRequestException(
          'No se pudo eliminar el producto porque sigue vinculado a registros del sistema.',
        );
      }
      throw error;
    }

    return { success: true, id };
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
