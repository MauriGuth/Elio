import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { LocationType, Prisma } from '../../generated/prisma';
import { isCategorySlugAllowedForPurchaseOrders } from '../common/purchase-order-category';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getStockLevels(filters: {
    locationId?: string;
    productId?: string;
    status?: string; // 'critical' | 'medium' | 'normal'
  }) {
    const where: Prisma.StockLevelWhereInput = {};

    if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    if (filters.productId) {
      where.productId = filters.productId;
    }

    const stockLevels = await this.prisma.stockLevel.findMany({
      where,
      include: {
        product: true,
        location: true,
      },
      orderBy: [{ product: { name: 'asc' } }],
    });

    if (filters.status) {
      return stockLevels.filter((sl) => {
        const stockStatus = this.getStockStatus(sl.quantity, sl.minQuantity);
        return stockStatus === filters.status;
      });
    }

    return stockLevels.map((sl) => ({
      ...sl,
      status: this.getStockStatus(sl.quantity, sl.minQuantity),
    }));
  }

  async getMovements(filters: {
    productId?: string;
    locationId?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: true,
          location: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async adjustStock(data: AdjustStockDto, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${data.productId}" not found`);
    }

    const location = await this.prisma.stockLevel.findUnique({
      where: {
        productId_locationId: {
          productId: data.productId,
          locationId: data.locationId,
        },
      },
    });

    return this.prisma.$transaction(async (tx) => {
      // Upsert stock level with the new quantity
      const stockLevel = await tx.stockLevel.upsert({
        where: {
          productId_locationId: {
            productId: data.productId,
            locationId: data.locationId,
          },
        },
        update: {
          quantity: data.quantity,
          lastCountedAt: new Date(),
        },
        create: {
          productId: data.productId,
          locationId: data.locationId,
          quantity: data.quantity,
          lastCountedAt: new Date(),
        },
      });

      const previousQty = location?.quantity ?? 0;
      const difference = data.quantity - previousQty;

      // Create correction movement
      const movement = await tx.stockMovement.create({
        data: {
          productId: data.productId,
          locationId: data.locationId,
          type: 'CORRECTION',
          quantity: difference,
          notes: `Correction: ${data.reason}${data.notes ? ` - ${data.notes}` : ''}`,
          userId,
        },
        include: {
          product: true,
          location: true,
        },
      });

      // Log to audit
      await tx.auditLog.create({
        data: {
          userId,
          action: 'STOCK_ADJUSTMENT',
          entityType: 'StockLevel',
          entityId: stockLevel.id,
          oldData: JSON.stringify({ quantity: previousQty }),
          newData: JSON.stringify({
            quantity: data.quantity,
            reason: data.reason,
            notes: data.notes,
          }),
        },
      });

      return { stockLevel, movement };
    });
  }

  async createMovement(data: CreateMovementDto, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: data.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${data.productId}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Create the movement
      const movement = await tx.stockMovement.create({
        data: {
          productId: data.productId,
          locationId: data.locationId,
          type: data.type,
          quantity: data.quantity,
          unitCost: data.unitCost,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          lotNumber: data.lotNumber,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
          notes: data.notes,
          userId,
        },
        include: {
          product: true,
          location: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Update stock level
      await tx.stockLevel.upsert({
        where: {
          productId_locationId: {
            productId: data.productId,
            locationId: data.locationId,
          },
        },
        update: {
          quantity: { increment: data.quantity },
        },
        create: {
          productId: data.productId,
          locationId: data.locationId,
          quantity: data.quantity,
        },
      });

      return movement;
    });
  }

  async getStockSummary(locationId?: string) {
    const where: Prisma.StockLevelWhereInput = {};

    if (locationId) {
      where.locationId = locationId;
    }

    const stockLevels = await this.prisma.stockLevel.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            avgCost: true,
          },
        },
      },
    });

    let critical = 0;
    let medium = 0;
    let normal = 0;
    let totalValue = 0;

    for (const sl of stockLevels) {
      const status = this.getStockStatus(sl.quantity, sl.minQuantity);
      if (status === 'critical') critical++;
      else if (status === 'medium') medium++;
      else normal++;

      totalValue += sl.quantity * sl.product.avgCost;
    }

    return {
      totalProducts: stockLevels.length,
      critical,
      medium,
      normal,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  }

  private getStockStatus(
    quantity: number,
    minQuantity: number,
  ): 'critical' | 'medium' | 'normal' {
    if (quantity <= minQuantity) return 'critical';
    if (quantity <= minQuantity * 1.5) return 'medium';
    return 'normal';
  }

  /**
   * Resumen para logística: por local/depósito, productos con stock crítico o bajo,
   * sugerencia de pedido (mín/máx y por demanda) y ventas/consumo real (últimos 7 y 30 días).
   * Sin locationId: solo locales de negocio (excluye depósito — el depósito es origen de reposición).
   * @param purchaseOnly Si true, solo filas cuya categoría sea tipo producto o insumo (pedidos de compra).
   */
  async getLogisticsSummary(
    locationId?: string,
    options?: { purchaseOnly?: boolean },
  ) {
    const where: Prisma.StockLevelWhereInput = {};
    if (locationId) {
      where.locationId = locationId;
    } else {
      where.location = { type: { not: LocationType.WAREHOUSE } };
    }

    const levels = await this.prisma.stockLevel.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            avgCost: true,
            familia: true,
            categoryId: true,
            category: { select: { name: true, slug: true } },
            productSuppliers: {
              where: { supplier: { isActive: true } },
              take: 1,
              select: { supplier: { select: { id: true, name: true } } },
            },
          },
        },
        location: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: [
        { location: { name: 'asc' } },
        { product: { name: 'asc' } },
      ],
    });

    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const movementWhere: Prisma.StockMovementWhereInput = {
      type: 'sale',
      createdAt: { gte: last30 },
    };
    if (locationId) {
      movementWhere.locationId = locationId;
    } else {
      movementWhere.location = { type: { not: LocationType.WAREHOUSE } };
    }

    const salesMovements = await this.prisma.stockMovement.findMany({
      where: movementWhere,
      select: { productId: true, locationId: true, quantity: true, createdAt: true },
    });

    const sold7ByKey = new Map<string, number>();
    const sold30ByKey = new Map<string, number>();
    for (const m of salesMovements) {
      const key = `${m.productId}:${m.locationId}`;
      const qty = Math.abs(Number(m.quantity));
      if (m.createdAt >= last7) {
        sold7ByKey.set(key, (sold7ByKey.get(key) ?? 0) + qty);
      }
      sold30ByKey.set(key, (sold30ByKey.get(key) ?? 0) + qty);
    }

    // Envíos ya preparados / en tránsito: considerar esas cantidades como "en camino" para no duplicar faltante
    const pendingShipments = await this.prisma.shipment.findMany({
      where: {
        status: { in: ['prepared', 'dispatched', 'in_transit', 'reception_control'] },
        ...(locationId
          ? { destinationId: locationId }
          : { destination: { type: { not: LocationType.WAREHOUSE } } }),
      },
      select: { destinationId: true, items: { select: { productId: true, sentQty: true } } },
    });
    const pendingByKey = new Map<string, number>();
    for (const sh of pendingShipments) {
      for (const it of sh.items) {
        const key = `${it.productId}:${sh.destinationId}`;
        pendingByKey.set(key, (pendingByKey.get(key) ?? 0) + Number(it.sentQty));
      }
    }

    const result: Array<{
      id: string;
      productId: string;
      product: {
        id: string;
        name: string;
        sku: string | null;
        unit: string;
        avgCost: number;
        familia?: string | null;
        category?: { name: string; slug: string } | null;
        productSuppliers?: Array<{ supplier: { id: string; name: string } }>;
      };
      locationId: string;
      location: { id: string; name: string; type: string };
      quantity: number;
      minQuantity: number;
      maxQuantity: number | null;
      status: 'critical' | 'medium' | 'normal';
      suggestedOrderQty: number;
      soldLast7Days: number;
      soldLast30Days: number;
      suggestedOrderQtyByDemand: number;
    }> = [];

    const purchaseOnly = options?.purchaseOnly === true;

    for (const sl of levels) {
      const catSlug = (sl.product as { category?: { slug?: string } | null })
        ?.category?.slug;
      if (
        purchaseOnly &&
        !isCategorySlugAllowedForPurchaseOrders(catSlug ?? null)
      ) {
        continue;
      }
      const key = `${sl.productId}:${sl.locationId}`;
      const pendingQty = pendingByKey.get(key) ?? 0;
      const effectiveQty = sl.quantity + pendingQty;
      const status = this.getStockStatus(effectiveQty, sl.minQuantity);
      const target = sl.maxQuantity != null ? sl.maxQuantity : sl.minQuantity * 2;
      const suggestedOrderQty =
        status === 'critical' || status === 'medium'
          ? Math.max(0, Math.ceil(target - effectiveQty))
          : 0;

      const sold7 = sold7ByKey.get(key) ?? 0;
      const sold30 = sold30ByKey.get(key) ?? 0;
      const suggestedOrderQtyByDemand = Math.max(
        0,
        Math.ceil(sold7 - effectiveQty),
      );

      result.push({
        id: sl.id,
        productId: sl.productId,
        product: sl.product as {
          id: string;
          name: string;
          sku: string | null;
          unit: string;
          avgCost: number;
          familia?: string | null;
          category?: { name: string; slug: string } | null;
          productSuppliers?: Array<{ supplier: { id: string; name: string } }>;
        },
        locationId: sl.locationId,
        location: sl.location as { id: string; name: string; type: string },
        quantity: sl.quantity,
        minQuantity: sl.minQuantity,
        maxQuantity: sl.maxQuantity,
        status,
        suggestedOrderQty,
        soldLast7Days: Math.round(sold7 * 100) / 100,
        soldLast30Days: Math.round(sold30 * 100) / 100,
        suggestedOrderQtyByDemand,
      });
    }

    return result;
  }

  async updateLevel(id: string, data: UpdateLevelDto) {
    const level = await this.prisma.stockLevel.findUnique({
      where: { id },
    });
    if (!level) {
      throw new NotFoundException(`Stock level with ID "${id}" not found`);
    }
    return this.prisma.stockLevel.update({
      where: { id },
      data: {
        ...(data.minQuantity !== undefined && { minQuantity: data.minQuantity }),
        ...(data.maxQuantity !== undefined && { maxQuantity: data.maxQuantity }),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }
}
