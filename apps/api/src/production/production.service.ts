import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { CompleteProductionDto } from './dto/complete-production.dto';

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    locationId?: string;
    status?: string;
    recipeId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      status,
      recipeId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (recipeId) where.recipeId = recipeId;

    if (dateFrom || dateTo) {
      where.plannedDate = {};
      if (dateFrom) where.plannedDate.gte = new Date(dateFrom);
      if (dateTo) where.plannedDate.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          recipe: {
            select: { id: true, name: true, version: true, yieldUnit: true },
          },
          location: {
            select: { id: true, name: true, type: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findBatchByCode(code: string) {
    const batch = await this.prisma.productionBatch.findUnique({
      where: { batchCode: code },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        productionOrder: {
          select: {
            id: true,
            orderNumber: true,
            completedAt: true,
            recipe: { select: { name: true } },
            location: { select: { id: true, name: true } },
          },
        },
        producedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!batch) {
      throw new NotFoundException(`Batch with code "${code}" not found`);
    }
    return batch;
  }

  /** Respuesta completa del lote para vista pública (QR): incluye orden, items (insumos) y costos */
  async findBatchByCodeForPublic(code: string) {
    const batch = await this.prisma.productionBatch.findUnique({
      where: { batchCode: code },
      include: {
        product: {
          select: { id: true, sku: true, name: true, unit: true },
        },
        productionOrder: {
          select: {
            id: true,
            orderNumber: true,
            estimatedCost: true,
            plannedQty: true,
            recipe: { select: { name: true, yieldQty: true, yieldUnit: true } },
            location: { select: { id: true, name: true } },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    unit: true,
                  },
                },
              },
            },
          },
        },
        producedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!batch) {
      throw new NotFoundException(`Batch with code "${code}" not found`);
    }
    return batch;
  }

  async findById(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                avgCost: true,
              },
            },
          },
        },
        recipe: {
          select: {
            id: true,
            name: true,
            version: true,
            yieldQty: true,
            yieldUnit: true,
            productId: true,
            ingredients: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    unit: true,
                    avgCost: true,
                  },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        location: {
          select: { id: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        startedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        completedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        batches: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
            producedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Production order with ID "${id}" not found`);
    }

    const ingredientProductIds = new Set<string>();
    for (const item of order.items) {
      ingredientProductIds.add(item.productId);
    }
    for (const ingredient of order.recipe.ingredients) {
      ingredientProductIds.add(ingredient.productId);
    }

    const stockLevels = ingredientProductIds.size
      ? await this.prisma.stockLevel.findMany({
          where: {
            locationId: order.locationId,
            productId: { in: Array.from(ingredientProductIds) },
          },
          select: {
            productId: true,
            quantity: true,
          },
        })
      : [];

    const stockByProductId = new Map(
      stockLevels.map((level) => [level.productId, level.quantity]),
    );

    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        requiredQty: item.plannedQty,
        availableQty: stockByProductId.get(item.productId) ?? 0,
        currentStock: stockByProductId.get(item.productId) ?? 0,
      })),
      recipe: {
        ...order.recipe,
        ingredients: order.recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          requiredQty:
            ((ingredient.qtyPerYield ?? 0) * (order.plannedQty ?? 0)) /
            (order.recipe.yieldQty || 1),
          availableStock: stockByProductId.get(ingredient.productId) ?? 0,
        })),
      },
    };
  }

  async create(data: CreateProductionDto, userId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: data.recipeId },
      include: { ingredients: true },
    });

    if (!recipe) {
      throw new NotFoundException(
        `Recipe with ID "${data.recipeId}" not found`,
      );
    }

    const location = await this.prisma.location.findUnique({
      where: { id: data.locationId },
    });

    if (!location) {
      throw new NotFoundException(
        `Location with ID "${data.locationId}" not found`,
      );
    }

    if (data.plannedDate) {
      const plannedStr = String(data.plannedDate).slice(0, 10);
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (plannedStr < todayStr) {
        throw new BadRequestException(
          'La fecha planificada no puede ser anterior a hoy.',
        );
      }
    }

    // Generate order number: PO-YYYYMMDD-XXX
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const todayCount = await this.prisma.productionOrder.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    const orderNumber = `PO-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;

    // Calculate items from recipe ingredients
    const items = recipe.ingredients.map((ing) => ({
      productId: ing.productId,
      plannedQty: (ing.qtyPerYield * data.plannedQty) / recipe.yieldQty,
      unitCost: 0,
      status: 'pending',
    }));

    // Fetch product costs for estimated cost
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, avgCost: true },
    });
    const costMap = new Map(products.map((p) => [p.id, p.avgCost]));

    let estimatedCost = 0;
    const itemsWithCost = items.map((item) => {
      const unitCost = costMap.get(item.productId) ?? 0;
      estimatedCost += unitCost * item.plannedQty;
      return { ...item, unitCost };
    });

    estimatedCost = Math.round(estimatedCost * 100) / 100;

    return this.prisma.productionOrder.create({
      data: {
        orderNumber,
        recipeId: data.recipeId,
        locationId: data.locationId,
        plannedQty: data.plannedQty,
        status: 'draft',
        estimatedCost,
        plannedDate: new Date(data.plannedDate),
        notes: data.notes,
        createdById: userId,
        items: {
          create: itemsWithCost,
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
        recipe: {
          select: { id: true, name: true, version: true },
        },
        location: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async start(id: string, userId: string) {
    const order = await this.findById(id);

    if (!['draft', 'pending'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot start order with status "${order.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const stockLevels = await tx.stockLevel.findMany({
        where: {
          locationId: order.locationId,
          productId: { in: order.items.map((item) => item.productId) },
        },
        select: {
          productId: true,
          quantity: true,
        },
      });

      const stockMap = new Map(
        stockLevels.map((stockLevel) => [stockLevel.productId, stockLevel.quantity]),
      );

      const missingItems = order.items.filter((item) => {
        const availableQty = stockMap.get(item.productId) ?? 0;
        return availableQty < item.plannedQty;
      });

      if (missingItems.length > 0) {
        const missingNames = missingItems
          .map((item) => item.product?.name || item.productId)
          .join(', ');
        throw new BadRequestException(
          `No hay stock suficiente para iniciar la producción. Faltante en: ${missingNames}`,
        );
      }

      // Create stock movements (production_out) for each ingredient
      for (const item of order.items) {
        // Decrease stock level
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: order.locationId,
            },
          },
        });

        const currentQty = stockLevel?.quantity ?? 0;

        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: order.locationId,
            },
          },
          update: {
            quantity: currentQty - item.plannedQty,
          },
          create: {
            productId: item.productId,
            locationId: order.locationId,
            quantity: -item.plannedQty,
          },
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: order.locationId,
            type: 'production_out',
            quantity: -item.plannedQty,
            unitCost: item.unitCost,
            referenceType: 'production_order',
            referenceId: order.id,
            userId,
          },
        });
      }

      // Update order status
      return tx.productionOrder.update({
        where: { id },
        data: {
          status: 'in_progress',
          startedAt: new Date(),
          startedById: userId,
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
          recipe: { select: { id: true, name: true, version: true } },
          location: { select: { id: true, name: true } },
        },
      });
    });
  }

  async complete(id: string, data: CompleteProductionDto, userId: string) {
    const order = await this.findById(id);

    if (order.status !== 'in_progress') {
      throw new BadRequestException(
        `Cannot complete order with status "${order.status}"`,
      );
    }

    const status =
      data.actualQty !== order.plannedQty
        ? 'completed_adjusted'
        : 'completed';

    return this.prisma.$transaction(async (tx) => {
      // Create stock movement (production_in) for produced product
      if (order.recipe.productId) {
        // Increase stock for produced product
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: order.recipe.productId,
              locationId: order.locationId,
            },
          },
        });

        const currentQty = stockLevel?.quantity ?? 0;

        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: order.recipe.productId,
              locationId: order.locationId,
            },
          },
          update: {
            quantity: currentQty + data.actualQty,
          },
          create: {
            productId: order.recipe.productId,
            locationId: order.locationId,
            quantity: data.actualQty,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: order.recipe.productId,
            locationId: order.locationId,
            type: 'production_in',
            quantity: data.actualQty,
            referenceType: 'production_order',
            referenceId: order.id,
            userId,
          },
        });

        // Lote con QR para trazabilidad (producción primaria)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const uniquePart = order.id.slice(-8).toUpperCase();
        const batchCode = `BATCH-${dateStr}-${uniquePart}`;
        await tx.productionBatch.create({
          data: {
            productionOrderId: order.id,
            productId: order.recipe.productId,
            quantity: data.actualQty,
            unit: order.recipe.yieldUnit,
            batchCode,
            qrCode: batchCode,
            producedById: userId,
          },
        });
      }

      // Calculate actual cost (ingredient cost + labor)
      const ingredientCost = order.items.reduce(
        (sum, item) => sum + (item.unitCost ?? 0) * item.plannedQty,
        0,
      );
      const actualCost =
        Math.round((ingredientCost + (data.laborCost ?? 0)) * 100) / 100;

      // Update order
      return tx.productionOrder.update({
        where: { id },
        data: {
          status,
          actualQty: data.actualQty,
          wasteQty: data.wasteQty ?? 0,
          wasteNotes: data.wasteNotes,
          laborCost: data.laborCost,
          actualCost,
          completedAt: new Date(),
          completedById: userId,
          notes: data.notes ?? order.notes,
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
          recipe: { select: { id: true, name: true, version: true } },
          location: { select: { id: true, name: true } },
        },
      });
    });
  }

  async cancel(id: string) {
    const order = await this.findById(id);

    if (['completed', 'completed_adjusted', 'cancelled'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order with status "${order.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // If in_progress, reverse stock movements
      if (order.status === 'in_progress') {
        for (const item of order.items) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: order.locationId,
              },
            },
          });

          const currentQty = stockLevel?.quantity ?? 0;

          await tx.stockLevel.update({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: order.locationId,
              },
            },
            data: {
              quantity: currentQty + item.plannedQty,
            },
          });
        }
      }

      return tx.productionOrder.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
  }

  async getDashboardStats(locationId?: string) {
    const where: any = {};
    if (locationId) where.locationId = locationId;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [
      draftCount,
      pendingCount,
      inProgressCount,
      completedCount,
      cancelledCount,
      todayProduction,
      todayCost,
    ] = await Promise.all([
      this.prisma.productionOrder.count({
        where: { ...where, status: 'draft' },
      }),
      this.prisma.productionOrder.count({
        where: { ...where, status: 'pending' },
      }),
      this.prisma.productionOrder.count({
        where: { ...where, status: 'in_progress' },
      }),
      this.prisma.productionOrder.count({
        where: {
          ...where,
          status: { in: ['completed', 'completed_adjusted'] },
        },
      }),
      this.prisma.productionOrder.count({
        where: { ...where, status: 'cancelled' },
      }),
      this.prisma.productionOrder.count({
        where: {
          ...where,
          plannedDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.productionOrder.findMany({
        where: {
          ...where,
          completedAt: { gte: todayStart, lt: todayEnd },
          status: { in: ['completed', 'completed_adjusted'] },
        },
        select: { actualCost: true },
      }),
    ]);

    const totalCostToday = todayCost.reduce(
      (sum, o) => sum + (o.actualCost ?? 0),
      0,
    );

    return {
      byStatus: {
        draft: draftCount,
        pending: pendingCount,
        in_progress: inProgressCount,
        completed: completedCount,
        cancelled: cancelledCount,
      },
      totalProductionToday: todayProduction,
      totalCostToday: Math.round(totalCostToday * 100) / 100,
    };
  }
}
