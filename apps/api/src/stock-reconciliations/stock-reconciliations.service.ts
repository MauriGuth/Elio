import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { SubmitReconciliationDto } from './dto/submit-reconciliation.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class StockReconciliationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Productos con stock en la ubicación para conteo (solo de este local; sin cantidad para no influir).
   * Excluye productos con `consumeRecipeOnSale` (elaborados al momento: el stock real se lleva por insumos).
   * Si shiftLabel === 'afternoon', devuelve solo los productos cuyas familias corresponden al día de la semana,
   * rotando en 7 días para cubrir todas las familias del local.
   */
  async getProductsForCount(locationId: string, shiftLabel?: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found`);
    }
    const levels = await this.prisma.stockLevel.findMany({
      where: {
        locationId,
        product: { consumeRecipeOnSale: false },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            familia: true,
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }],
    });
    let rows = levels.map((l) => ({
      productId: l.productId,
      product: { ...l.product, familia: l.product.familia ?? '' },
      unit: l.product.unit,
    }));

    if (shiftLabel === 'afternoon') {
      const familias = [...new Set(rows.map((r) => r.product.familia ?? ''))].sort();
      if (familias.length > 0) {
        const dayOfWeek = new Date().getDay();
        const familiasHoy = familias.filter((_, i) => i % 7 === dayOfWeek);
        if (familiasHoy.length > 0) {
          rows = rows.filter((r) => familiasHoy.includes(r.product.familia ?? ''));
        }
        // Si hoy no toca ninguna familia (ej. pocas familias y es día 5 o 6), se muestran todos para poder cerrar.
      }
    }

    return rows;
  }

  /** Crear borrador de micro balance (cierre de jornada) */
  async create(dto: CreateReconciliationDto, userId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID "${dto.locationId}" not found`);
    }
    return this.prisma.stockReconciliation.create({
      data: {
        locationId: dto.locationId,
        userId,
        shiftLabel: dto.shiftLabel ?? null,
        status: 'draft',
      },
      include: {
        location: { select: { id: true, name: true } },
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /** Enviar micro balance: actualizar stock a lo contado y generar informe (faltantes/sobrantes) */
  async submit(id: string, dto: SubmitReconciliationDto, userId: string) {
    const reconciliation = await this.prisma.stockReconciliation.findUnique({
      where: { id },
      include: { location: true, items: true },
    });
    if (!reconciliation) {
      throw new NotFoundException(`Reconciliation with ID "${id}" not found`);
    }
    if (reconciliation.status !== 'draft') {
      throw new BadRequestException('This reconciliation has already been submitted');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item with counted quantity is required');
    }

    const locationId = reconciliation.locationId;
    const productIds = dto.items.map((i) => i.productId);
    const recipeOnSaleProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds }, consumeRecipeOnSale: true },
      select: { id: true, name: true },
    });
    if (recipeOnSaleProducts.length > 0) {
      throw new BadRequestException(
        'No se puede contar en micro balance productos elaborados al momento (consumo por receta). Quitá: ' +
          recipeOnSaleProducts.map((p) => p.name || p.id).join(', '),
      );
    }
    const countedByProduct = new Map(dto.items.map((i) => [i.productId, i.countedQuantity]));

    const currentLevels = await this.prisma.stockLevel.findMany({
      where: {
        locationId,
        productId: { in: productIds },
      },
    });
    const expectedByProduct = new Map(
      currentLevels.map((l) => [l.productId, l.quantity]),
    );
    for (const pid of productIds) {
      if (!expectedByProduct.has(pid)) {
        expectedByProduct.set(pid, 0);
      }
    }

    const itemsToCreate: Array<{
      reconciliationId: string;
      productId: string;
      expectedQuantity: number;
      countedQuantity: number;
      difference: number;
    }> = [];
    for (const item of dto.items) {
      const expected = expectedByProduct.get(item.productId) ?? 0;
      const counted = item.countedQuantity;
      const difference = counted - expected;
      itemsToCreate.push({
        reconciliationId: id,
        productId: item.productId,
        expectedQuantity: expected,
        countedQuantity: counted,
        difference,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      for (const row of itemsToCreate) {
        const prev = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: row.productId,
              locationId,
            },
          },
        });
        const prevQty = prev?.quantity ?? 0;
        const diff = row.countedQuantity - prevQty;

        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: row.productId,
              locationId,
            },
          },
          update: {
            quantity: row.countedQuantity,
            lastCountedAt: new Date(),
          },
          create: {
            productId: row.productId,
            locationId,
            quantity: row.countedQuantity,
            lastCountedAt: new Date(),
          },
        });

        if (diff !== 0) {
          await tx.stockMovement.create({
            data: {
              productId: row.productId,
              locationId,
              type: 'CORRECTION',
              quantity: diff,
              notes: `Micro balance cierre de jornada. Esperado: ${row.expectedQuantity}, contado: ${row.countedQuantity}`,
              referenceType: 'stock_reconciliation',
              referenceId: id,
              userId,
            },
          });
        }
      }

      await tx.stockReconciliationItem.createMany({
        data: itemsToCreate,
      });

      const updated = await tx.stockReconciliation.update({
        where: { id },
        data: {
          status: 'submitted',
          submittedAt: new Date(),
        },
        include: {
          location: { select: { id: true, name: true } },
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
        },
      });

      return updated;
    });
  }

  /** Listar informes para auditor (filtros por ubicación y fechas) */
  async findAll(filters: {
    locationId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.StockReconciliationWhereInput = {
      status: 'submitted',
    };
    if (filters.locationId) {
      where.locationId = filters.locationId;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.submittedAt = {};
      if (filters.dateFrom) {
        where.submittedAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        d.setHours(23, 59, 59, 999);
        where.submittedAt.lte = d;
      }
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.stockReconciliation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
        },
      }),
      this.prisma.stockReconciliation.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Detalle de un informe (para auditor) */
  async findOne(id: string) {
    const rec = await this.prisma.stockReconciliation.findUnique({
      where: { id },
      include: {
        location: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
      },
    });
    if (!rec) {
      throw new NotFoundException(`Reconciliation with ID "${id}" not found`);
    }
    return rec;
  }

  /** Obtener un borrador por ubicación (para continuar en POS) o crear uno nuevo. Solo un micro balance por turno tarde por día. */
  async getOrCreateDraft(locationId: string, userId: string, shiftLabel?: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found`);
    }
    // Un solo micro balance por turno tarde por día: si ya se envió hoy, no permitir otro
    if (shiftLabel === 'afternoon') {
      const alreadyDone = await this.hasAfternoonSubmittedToday(locationId);
      if (alreadyDone) {
        throw new BadRequestException(
          'El micro balance del turno tarde ya fue realizado hoy para este local. Podés cerrar la caja.',
        );
      }
    }
    const existing = await this.prisma.stockReconciliation.findFirst({
      where: {
        locationId,
        userId,
        status: 'draft',
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      include: {
        location: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    });
    if (existing) {
      return existing;
    }
    return this.create({ locationId, shiftLabel }, userId);
  }

  /** Indica si ya se envió un micro balance (turno tarde) para este local hoy, o si no hay filas de stock contables (no aplica). */
  async hasAfternoonSubmittedToday(locationId: string): Promise<boolean> {
    const countableLevels = await this.prisma.stockLevel.count({
      where: {
        locationId,
        product: { consumeRecipeOnSale: false },
      },
    });
    if (countableLevels === 0) {
      return true; // Solo elaborados al momento / sin stock contable → no exige micro balance
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const count = await this.prisma.stockReconciliation.count({
      where: {
        locationId,
        status: 'submitted',
        shiftLabel: 'afternoon',
        submittedAt: { gte: startOfDay, lte: endOfDay },
      },
    });
    return count > 0;
  }
}
