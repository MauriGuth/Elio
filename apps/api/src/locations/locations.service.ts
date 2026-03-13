import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    type?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const { type, isActive, search } = filters;

    const where: any = {};

    if (type) where.type = type;
    // Por defecto solo locales activos (los "eliminados" tienen isActive: false y no se listan)
    where.isActive = isActive !== undefined ? isActive : true;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { address: { contains: search } },
      ];
    }

    return this.prisma.location.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            stockLevels: true,
            productionOrders: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        stockLevels: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
          orderBy: { product: { name: 'asc' } },
        },
        _count: {
          select: {
            productionOrders: true,
            originShipments: true,
            destinationShipments: true,
            orders: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" not found`);
    }

    return location;
  }

  async create(data: CreateLocationDto) {
    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Ensure unique slug
    const existing = await this.prisma.location.findUnique({
      where: { slug },
    });

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    return this.prisma.location.create({
      data: {
        ...data,
        slug: finalSlug,
      },
    });
  }

  async update(id: string, data: UpdateLocationDto) {
    await this.findById(id);

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isProduction !== undefined) updateData.isProduction = data.isProduction;
    if (data.hasTables !== undefined) updateData.hasTables = data.hasTables;
    if (data.arcaPtoVta !== undefined) updateData.arcaPtoVta = data.arcaPtoVta;

    // mapConfig: asegurar objeto JSON serializable para Prisma (evita 500 por tipos/serialización)
    if (data.mapConfig !== undefined) {
      try {
        updateData.mapConfig = JSON.parse(JSON.stringify(data.mapConfig));
      } catch {
        throw new BadRequestException('mapConfig debe ser un objeto JSON válido');
      }
    }

    // Regenerate slug if name is being updated
    if (data.name) {
      const slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const existing = await this.prisma.location.findFirst({
        where: { slug, NOT: { id } },
      });

      (updateData as any).slug = existing ? `${slug}-${Date.now()}` : slug;
    }

    try {
      return await this.prisma.location.update({
        where: { id },
        data: updateData as any,
      });
    } catch (err: any) {
      console.error('Location update error:', err?.message ?? err);
      throw new BadRequestException(
        err?.meta?.message ?? err?.message ?? 'Error al actualizar el local',
      );
    }
  }

  async remove(id: string) {
    await this.findById(id);

    // Borrado real en BD: elimina el registro. Si hay datos relacionados (órdenes, stock, etc.)
    // Prisma lanzará y propagamos el error. Alternativa: soft delete (isActive: false) si se prefiere.
    try {
      await this.prisma.location.delete({
        where: { id },
      });
      return { deleted: true, id };
    } catch (err: any) {
      // Si falla por restricciones de FK (datos asociados), hacemos soft delete para que al menos desaparezca del listado
      if (err?.code === 'P2003' || err?.message?.includes('Foreign key')) {
        await this.prisma.location.update({
          where: { id },
          data: { isActive: false },
        });
        return { deleted: false, id, message: 'Local desactivado (tiene datos asociados)' };
      }
      throw err;
    }
  }

  async getDashboard(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            tables: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" not found`);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [
      totalProducts,
      criticalStockItems,
      todaySalesOrders,
      pendingShipments,
      todayProduction,
      recentMovements,
      activeAlerts,
      stockItems,
    ] = await Promise.all([
      // Total unique products in stock
      this.prisma.stockLevel.count({
        where: { locationId: id, quantity: { gt: 0 } },
      }),

      // Critical stock (quantity <= minQuantity)
      this.prisma.stockLevel
        .findMany({
          where: { locationId: id },
          select: { quantity: true, minQuantity: true },
        })
        .then((levels) =>
          levels.filter((l) => l.quantity <= l.minQuantity).length,
        ),

      // Today's sales (closed orders)
      this.prisma.order.aggregate({
        where: {
          locationId: id,
          closedAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { total: true },
        _count: true,
      }),

      // Pending shipments (incoming)
      this.prisma.shipment.count({
        where: {
          destinationId: id,
          status: { in: ['draft', 'dispatched'] },
        },
      }),

      // Today's production orders
      this.prisma.productionOrder.count({
        where: {
          locationId: id,
          plannedDate: { gte: todayStart, lt: todayEnd },
        },
      }),

      // Recent stock movements
      this.prisma.stockMovement.findMany({
        where: { locationId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          product: {
            select: { id: true, name: true, sku: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),

      // Active alerts
      this.prisma.alert.findMany({
        where: {
          locationId: id,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Stock del local: todos los niveles de stock con producto y categoría
      this.prisma.stockLevel.findMany({
        where: { locationId: id },
        orderBy: { product: { name: 'asc' } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              category: {
                select: { id: true, name: true, icon: true },
              },
            },
          },
        },
      }),
    ]);

    const salesToday = todaySalesOrders._sum.total ?? 0;
    const ordersToday = todaySalesOrders._count;

    // Formato que espera el frontend: cada item con product, stock (quantity, minQuantity, status)
    const stockItemsForFront = stockItems.map((level) => {
      const isCritical = level.quantity <= level.minQuantity;
      const isLow =
        level.maxQuantity != null &&
        level.quantity > level.minQuantity &&
        level.quantity <= level.maxQuantity * 0.3;
      const status = isCritical ? 'critical' : isLow ? 'low' : 'normal';
      return {
        id: level.id,
        product: level.product,
        stock: {
          quantity: level.quantity,
          minQuantity: level.minQuantity,
          maxQuantity: level.maxQuantity,
          status,
        },
      };
    });

    return {
      location,
      stockItems: stockItemsForFront,
      salesToday,
      ordersToday,
      ticketsToday: ordersToday,
      criticalStock: criticalStockItems,
      pendingShipments,
      kpis: {
        totalProducts,
        criticalStock: criticalStockItems,
        todaySales: salesToday,
        todaySalesCount: ordersToday,
        pendingShipments,
        todayProduction,
      },
      recentMovements,
      movements: recentMovements,
      activeAlerts,
      alerts: activeAlerts,
    };
  }
}
