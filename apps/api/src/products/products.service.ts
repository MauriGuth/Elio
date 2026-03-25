import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  CreateProductModifierGroupDto,
  UpdateProductModifierGroupDto,
  CreateProductModifierOptionDto,
  CreateModifierOptionFromRecipeDto,
  UpdateProductModifierOptionDto,
  ModifierStockLineInputDto,
} from './dto/product-modifiers.dto';
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

    if (filters.categoryId === 'none') {
      where.categoryId = null;
    } else if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.familia === 'none') {
      where.familia = null;
    } else if (filters.familia?.trim()) {
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

    // Si la categoría está inactiva (soft-deleted), devolverla como null
    const processedData = data.map((p) => ({
      ...p,
      category: p.category?.isActive ? p.category : null,
    }));

    return { data: processedData, total, page, limit };
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
    const { locationIds = [], salePriceByLocation = {}, SalePriceByLocation: _skip, ...productData } = data as CreateProductDto & { SalePriceByLocation?: Record<string, number> };

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
      (salePriceByLocation && typeof salePriceByLocation === 'object' ? salePriceByLocation : null) ??
      ((data as any).SalePriceByLocation && typeof (data as any).SalePriceByLocation === 'object'
        ? (data as any).SalePriceByLocation
        : {});

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
    const { locationIds, salePriceByLocation, SalePriceByLocation: _skip, ...productData } = data as UpdateProductDto & { SalePriceByLocation?: Record<string, number> };
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

    const defaultSalePrice =
      productData.salePrice !== undefined ? productData.salePrice : product.salePrice;

    const priceByLoc =
      (salePriceByLocation && typeof salePriceByLocation === 'object' ? salePriceByLocation : null) ??
      ((data as any).SalePriceByLocation && typeof (data as any).SalePriceByLocation === 'object'
        ? (data as any).SalePriceByLocation
        : {});

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

  async getProductModifiers(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }
    // Catálogo único: todos los grupos (legacy pueden tener product_id de otro plato)
    return this.prisma.productModifierGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
          include: {
            stockLines: {
              include: {
                product: { select: { id: true, name: true, sku: true, unit: true } },
              },
            },
          },
        },
      },
    });
  }

  async createModifierGroup(productId: string, dto: CreateProductModifierGroupDto) {
    await this.findById(productId);
    return this.prisma.productModifierGroup.create({
      data: {
        productId: null,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        required: dto.required ?? false,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
        ...(dto.visibilityRule !== undefined
          ? { visibilityRule: dto.visibilityRule as object }
          : {}),
      },
    });
  }

  async updateModifierGroup(groupId: string, dto: UpdateProductModifierGroupDto) {
    const g = await this.prisma.productModifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!g) {
      throw new NotFoundException(`Modifier group "${groupId}" not found`);
    }
    return this.prisma.productModifierGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.minSelect !== undefined ? { minSelect: dto.minSelect } : {}),
        ...(dto.maxSelect !== undefined ? { maxSelect: dto.maxSelect } : {}),
        ...(dto.visibilityRule !== undefined
          ? {
              visibilityRule:
                dto.visibilityRule === null
                  ? Prisma.DbNull
                  : (dto.visibilityRule as object),
            }
          : {}),
      },
    });
  }

  async deleteModifierGroup(groupId: string) {
    const g = await this.prisma.productModifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!g) {
      throw new NotFoundException(`Modifier group "${groupId}" not found`);
    }
    await this.prisma.productModifierGroup.delete({ where: { id: groupId } });
    return { success: true, id: groupId };
  }

  async createModifierOption(groupId: string, dto: CreateProductModifierOptionDto) {
    const g = await this.prisma.productModifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!g) {
      throw new NotFoundException(`Modifier group "${groupId}" not found`);
    }
    return this.prisma.productModifierOption.create({
      data: {
        groupId,
        label: dto.label,
        sortOrder: dto.sortOrder ?? 0,
        priceDelta: dto.priceDelta ?? 0,
      },
    });
  }

  /**
   * Opción POS desde receta: copia solo ingredientes sin `modifierGroupId` como cantidades por unidad vendida
   * (qtyPerYield / yieldQty). No inserta filas en `recipes`.
   */
  async createModifierOptionFromRecipe(
    groupId: string,
    dto: CreateModifierOptionFromRecipeDto,
  ) {
    const g = await this.prisma.productModifierGroup.findUnique({
      where: { id: groupId },
    });
    if (!g) {
      throw new NotFoundException(`Modifier group "${groupId}" not found`);
    }
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
      include: { ingredients: true },
    });
    if (!recipe) {
      throw new NotFoundException(`Recipe "${dto.recipeId}" not found`);
    }
    if (!recipe.isActive) {
      throw new BadRequestException('La receta no está activa');
    }
    const yq = recipe.yieldQty;
    if (yq == null || yq <= 0) {
      throw new BadRequestException('La receta debe tener rendimiento (yieldQty) mayor a cero');
    }
    const baseIngs = recipe.ingredients.filter((i) => i.modifierGroupId == null);
    if (baseIngs.length === 0) {
      throw new BadRequestException(
        'Esta receta no tiene insumos base (sin grupo de variantes). Usá “Opción manual” o agregá ingredientes sin grupo en la receta.',
      );
    }
    const merged = new Map<string, number>();
    for (const ing of baseIngs) {
      const perUnit = ing.qtyPerYield / yq;
      merged.set(ing.productId, (merged.get(ing.productId) ?? 0) + perUnit);
    }
    const productIds = [...merged.keys()];
    const found = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (found.length !== productIds.length) {
      throw new BadRequestException('Un insumo de la receta ya no existe como producto');
    }
    const label = (dto.label?.trim() || recipe.name).trim();
    if (!label) {
      throw new BadRequestException('La opción necesita un nombre');
    }
    return this.prisma.$transaction(async (tx) => {
      const opt = await tx.productModifierOption.create({
        data: {
          groupId,
          label,
          sortOrder: dto.sortOrder ?? 0,
          priceDelta: dto.priceDelta ?? 0,
        },
      });
      await tx.productModifierStockLine.createMany({
        data: [...merged.entries()].map(([productId, quantity]) => ({
          optionId: opt.id,
          productId,
          quantity,
        })),
      });
      return opt;
    });
  }

  async updateModifierOption(optionId: string, dto: UpdateProductModifierOptionDto) {
    const o = await this.prisma.productModifierOption.findUnique({
      where: { id: optionId },
    });
    if (!o) {
      throw new NotFoundException(`Modifier option "${optionId}" not found`);
    }
    return this.prisma.productModifierOption.update({
      where: { id: optionId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.priceDelta !== undefined ? { priceDelta: dto.priceDelta } : {}),
      },
    });
  }

  async deleteModifierOption(optionId: string) {
    const o = await this.prisma.productModifierOption.findUnique({
      where: { id: optionId },
    });
    if (!o) {
      throw new NotFoundException(`Modifier option "${optionId}" not found`);
    }
    await this.prisma.productModifierOption.delete({ where: { id: optionId } });
    return { success: true, id: optionId };
  }

  async setModifierStockLines(optionId: string, lines: ModifierStockLineInputDto[]) {
    const o = await this.prisma.productModifierOption.findUnique({
      where: { id: optionId },
    });
    if (!o) {
      throw new NotFoundException(`Modifier option "${optionId}" not found`);
    }
    const productIds = [...new Set(lines.map((l) => l.productId))];
    if (productIds.length > 0) {
      const found = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (found.length !== productIds.length) {
        throw new NotFoundException('Uno o más productos (insumos) no existen');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productModifierStockLine.deleteMany({ where: { optionId } });
      if (lines.length > 0) {
        await tx.productModifierStockLine.createMany({
          data: lines.map((l) => ({
            optionId,
            productId: l.productId,
            quantity: l.quantity,
          })),
        });
      }
    });
    return this.prisma.productModifierStockLine.findMany({
      where: { optionId },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
    });
  }
}
