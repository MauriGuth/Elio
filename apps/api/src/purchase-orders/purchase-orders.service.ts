import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { GenerateFromDemandDto } from './dto/generate-from-demand.dto';
import { ReceivePurchaseOrderDto } from './dto/update-purchase-order-status.dto';
import { UpdatePurchaseOrderItemDto } from './dto/update-purchase-order-item.dto';
import { AddPurchaseOrderItemDto } from './dto/add-purchase-order-item.dto';
import { isCategorySlugAllowedForPurchaseOrders } from '../common/purchase-order-category';

const PO_NUMBER_PREFIX = 'PO';
const PLACEHOLDER_SUPPLIER_NAME = 'Sin asignar (pendiente de proveedor)';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  /** Obtiene o crea el proveedor placeholder para productos sin proveedor en la demanda. */
  private async getOrCreatePlaceholderSupplier(): Promise<{ id: string; name: string }> {
    let supplier = await this.prisma.supplier.findFirst({
      where: { name: PLACEHOLDER_SUPPLIER_NAME },
      select: { id: true, name: true },
    });
    if (!supplier) {
      supplier = await this.prisma.supplier.create({
        data: { name: PLACEHOLDER_SUPPLIER_NAME, isActive: true },
        select: { id: true, name: true },
      });
    }
    return supplier;
  }

  /** Resumen de demanda para el depósito: faltantes por consumo/demanda, agrupado por proveedor y rubro, con indicador caro/barato. */
  async getDemandSummary(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, type: true },
    });
    if (!location) {
      throw new NotFoundException(`Location "${locationId}" not found`);
    }
    if (location.type !== 'WAREHOUSE') {
      throw new BadRequestException(
        'El resumen de demanda por compra aplica solo al depósito (ubicación tipo WAREHOUSE).',
      );
    }

    const demandRows = await this.stockService.getLogisticsSummary(locationId, {
      purchaseOnly: true,
    });
    let needReorder = (demandRows as any[]).filter(
      (r) =>
        (r.suggestedOrderQty > 0 || r.suggestedOrderQtyByDemand > 0) &&
        r.status !== 'normal',
    );
    if (needReorder.length === 0) {
      return { location, bySupplier: [], byCategory: [] };
    }

    const pidList = [...new Set(needReorder.map((r: any) => r.productId))];
    const productsForPo = await this.prisma.product.findMany({
      where: { id: { in: pidList } },
      select: { id: true, category: { select: { slug: true } } },
    });
    const allowedProductIds = new Set(
      productsForPo
        .filter((p) => isCategorySlugAllowedForPurchaseOrders(p.category?.slug))
        .map((p) => p.id),
    );
    needReorder = needReorder.filter((r: any) =>
      allowedProductIds.has(r.productId),
    );
    if (needReorder.length === 0) {
      return { location, bySupplier: [], byCategory: [] };
    }

    const productIds = [...new Set(needReorder.map((r: any) => r.productId))];
    const productSuppliers = await this.prisma.productSupplier.findMany({
      where: { productId: { in: productIds }, supplier: { isActive: true } },
      include: {
        supplier: { select: { id: true, name: true, rubro: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            lastCost: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    const lastPrices = await this.prisma.supplierPriceHistory.findMany({
      where: {
        productId: { in: productIds },
      },
      orderBy: { recordedAt: 'desc' },
      distinct: ['supplierId', 'productId'],
      select: {
        supplierId: true,
        productId: true,
        unitCost: true,
      },
    });
    const lastPriceMap = new Map<string, number>();
    for (const p of lastPrices) {
      lastPriceMap.set(`${p.supplierId}:${p.productId}`, p.unitCost);
    }

    const bySupplierMap = new Map<
      string,
      {
        supplier: { id: string; name: string; rubro: string | null };
        items: Array<{
          productId: string;
          productName: string;
          sku: string | null;
          unit: string;
          categoryName: string;
          quantity: number;
          unitCost: number;
          lastKnownCost: number | null;
          priceStatus: 'ok' | 'expensive' | 'cheap';
        }>;
      }
    >();

    for (const ps of productSuppliers) {
      const row = needReorder.find(
        (r: any) => r.productId === ps.productId,
      ) as any;
      if (!row) continue;
      const qty = Math.max(
        row.suggestedOrderQty ?? 0,
        row.suggestedOrderQtyByDemand ?? 0,
      );
      if (qty <= 0) continue;

      const listCost = ps.unitCost ?? row.product?.avgCost ?? 0;
      const lastKnown =
        lastPriceMap.get(`${ps.supplierId}:${ps.productId}`) ??
        (ps.product as any)?.lastCost ??
        null;
      let priceStatus: 'ok' | 'expensive' | 'cheap' = 'ok';
      if (lastKnown != null && listCost > 0) {
        const diff = (listCost - lastKnown) / lastKnown;
        if (diff > 0.05) priceStatus = 'expensive';
        else if (diff < -0.05) priceStatus = 'cheap';
      }

      const sid = ps.supplier.id;
      if (!bySupplierMap.has(sid)) {
        bySupplierMap.set(sid, {
          supplier: {
            id: ps.supplier.id,
            name: ps.supplier.name,
            rubro: ps.supplier.rubro ?? null,
          },
          items: [],
        });
      }
      bySupplierMap.get(sid)!.items.push({
        productId: ps.productId,
        productName: (ps.product as any).name,
        sku: (ps.product as any).sku ?? null,
        unit: (ps.product as any).unit ?? 'unidad',
        categoryName: (ps.product as any).category?.name ?? 'Sin rubro',
        quantity: Math.ceil(qty),
        unitCost: Math.round(listCost * 100) / 100,
        lastKnownCost: lastKnown != null ? Math.round(lastKnown * 100) / 100 : null,
        priceStatus,
      });
    }

    const bySupplier = Array.from(bySupplierMap.values());
    const byCategory = new Map<
      string,
      Array<{ supplierName: string; productName: string; quantity: number; unitCost: number; priceStatus: string }>
    >();
    for (const g of bySupplier) {
      for (const it of g.items) {
        const cat = it.categoryName;
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push({
          supplierName: g.supplier.name,
          productName: it.productName,
          quantity: it.quantity,
          unitCost: it.unitCost,
          priceStatus: it.priceStatus,
        });
      }
    }

    return {
      location,
      bySupplier,
      byCategory: Array.from(byCategory.entries()).map(([name, items]) => ({
        categoryName: name,
        items,
      })),
    };
  }

  /** Genera órdenes de compra (draft) a partir de la demanda del depósito: una por proveedor y una para productos sin proveedor. */
  async generateFromDemand(dto: GenerateFromDemandDto, userId: string) {
    const summary = await this.getDemandSummary(dto.locationId);
    const created: any[] = [];
    const productIdsInDemand = new Set<string>();

    for (const group of summary.bySupplier) {
      if (group.items.length === 0) continue;
      const filtered = dto.productIds
        ? group.items.filter((i) => dto.productIds!.includes(i.productId))
        : group.items;
      if (filtered.length === 0) continue;

      filtered.forEach((i) => productIdsInDemand.add(i.productId));

      const orderNumber = await this.generateOrderNumber();
      const items = filtered.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitCost: i.unitCost,
        lastKnownCost: i.lastKnownCost,
        priceStatus: i.priceStatus,
      }));
      const totalAmount = items.reduce(
        (s, i) => s + i.quantity * i.unitCost,
        0,
      );
      const po = await this.prisma.purchaseOrder.create({
        data: {
          locationId: dto.locationId,
          supplierId: group.supplier.id,
          orderNumber,
          status: 'draft',
          totalAmount: Math.round(totalAmount * 100) / 100,
          createdById: userId,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              lastKnownCost: i.lastKnownCost,
              priceStatus: i.priceStatus,
            })),
          },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, unit: true } },
            },
          },
        },
      });
      created.push(po);
    }

    // Incluir productos en crítico/medio que no tienen proveedor en la demanda (Brownie, Café Americano, etc.)
    const logisticsRows = await this.stockService.getLogisticsSummary(dto.locationId, {
      purchaseOnly: true,
    });
    let needReorderRest = (logisticsRows as any[]).filter(
      (r) =>
        (r.status === 'critical' || r.status === 'medium') &&
        (r.suggestedOrderQty > 0 || r.suggestedOrderQtyByDemand > 0) &&
        !productIdsInDemand.has(r.productId),
    );
    if (needReorderRest.length > 0) {
      const restIds = [...new Set(needReorderRest.map((r: any) => r.productId))];
      const restProducts = await this.prisma.product.findMany({
        where: { id: { in: restIds } },
        select: { id: true, category: { select: { slug: true } } },
      });
      const allowedRest = new Set(
        restProducts
          .filter((p) => isCategorySlugAllowedForPurchaseOrders(p.category?.slug))
          .map((p) => p.id),
      );
      needReorderRest = needReorderRest.filter((r: any) =>
        allowedRest.has(r.productId),
      );
    }
    if (dto.productIds?.length) {
      const allow = new Set(dto.productIds);
      needReorderRest = needReorderRest.filter((r: any) =>
        allow.has(r.productId),
      );
    }

    if (needReorderRest.length > 0) {
      const placeholderSupplier = await this.getOrCreatePlaceholderSupplier();
      const restItems = needReorderRest.map((r: any) => {
        const qty = Math.max(r.suggestedOrderQty ?? 0, r.suggestedOrderQtyByDemand ?? 0);
        const unitCost = (r.product as any)?.avgCost ?? 0;
        return {
          productId: r.productId,
          quantity: Math.ceil(qty),
          unitCost: Math.round(unitCost * 100) / 100,
          lastKnownCost: null as number | null,
          priceStatus: 'ok' as const,
        };
      });
      const totalAmount = restItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
      const orderNumber = await this.generateOrderNumber();
      const po = await this.prisma.purchaseOrder.create({
        data: {
          locationId: dto.locationId,
          supplierId: placeholderSupplier.id,
          orderNumber,
          status: 'draft',
          totalAmount: Math.round(totalAmount * 100) / 100,
          notes: 'Productos en crítico o medio sin proveedor asignado en la demanda.',
          createdById: userId,
          items: {
            create: restItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              lastKnownCost: i.lastKnownCost,
              priceStatus: i.priceStatus,
            })),
          },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, unit: true } },
            },
          },
        },
      });
      created.push(po);
    }

    return created;
  }

  private async generateOrderNumber(): Promise<string> {
    const prefix = `${PO_NUMBER_PREFIX}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`;
    const latest = await this.prisma.purchaseOrder.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const lastSeq = parseInt(
      latest?.orderNumber?.slice(prefix.length) || '0',
      10,
    );
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  }

  async findAll(filters: {
    locationId?: string;
    supplierId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      supplierId,
      status,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (locationId) where.locationId = locationId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, rubro: true } },
          location: { select: { id: true, name: true, type: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        location: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        goodsReceipt: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true, unit: true } },
              },
            },
          },
        },
        items: {
          orderBy: { product: { name: 'asc' } },
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true, categoryId: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!po) {
      throw new NotFoundException(`Purchase order with ID "${id}" not found`);
    }
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const orderNumber = await this.generateOrderNumber();
    const totalAmount = dto.items.reduce(
      (s, i) => s + i.quantity * i.unitCost,
      0,
    );
    return this.prisma.purchaseOrder.create({
      data: {
        locationId: dto.locationId,
        supplierId: dto.supplierId,
        orderNumber,
        status: 'draft',
        totalAmount: Math.round(totalAmount * 100) / 100,
        notes: dto.notes,
        createdById: userId,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            lastKnownCost: i.lastKnownCost,
            priceStatus: i.priceStatus,
            notes: i.notes,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
    });
  }

  async updateItem(purchaseOrderId: string, itemId: string, data: UpdatePurchaseOrderItemDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException(`Orden de compra "${purchaseOrderId}" no encontrada`);
    if (po.status !== 'draft') {
      throw new BadRequestException(
        `Solo se puede editar la cantidad en órdenes en borrador. Estado actual: ${po.status}`,
      );
    }
    const item = po.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`El ítem "${itemId}" no pertenece a esta orden.`);
    }
    await this.prisma.purchaseOrderItem.update({
      where: { id: itemId },
      data: { quantity: data.quantity },
    });
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId },
    });
    const totalAmount = items.reduce(
      (s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0),
      0,
    );
    await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { totalAmount: Math.round(totalAmount * 100) / 100 },
    });
    return this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
    });
  }

  async addItem(purchaseOrderId: string, dto: AddPurchaseOrderItemDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) {
      throw new NotFoundException(`Orden de compra "${purchaseOrderId}" no encontrada`);
    }
    if (po.status !== 'draft') {
      throw new BadRequestException(
        `Solo se pueden agregar productos en borrador. Estado actual: ${po.status}`,
      );
    }
    if (po.items.some((i) => i.productId === dto.productId)) {
      throw new BadRequestException(
        'Este producto ya está en la orden. Editá la cantidad en la fila existente.',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        productSuppliers: {
          where: { supplierId: po.supplierId },
          take: 1,
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Producto "${dto.productId}" no encontrado`);
    }

    let unitCost =
      dto.unitCost != null
        ? dto.unitCost
        : (product.productSuppliers[0]?.unitCost ?? product.avgCost ?? 0);
    unitCost = Math.round(unitCost * 100) / 100;

    const lastPrice = await this.prisma.supplierPriceHistory.findFirst({
      where: { supplierId: po.supplierId, productId: dto.productId },
      orderBy: { recordedAt: 'desc' },
      select: { unitCost: true },
    });
    const lastKnownRaw =
      lastPrice?.unitCost ??
      (product.lastCost > 0 ? product.lastCost : null);
    const lastKnownCost =
      lastKnownRaw != null ? Math.round(lastKnownRaw * 100) / 100 : null;

    let priceStatus: 'ok' | 'expensive' | 'cheap' = 'ok';
    if (lastKnownCost != null && unitCost > 0) {
      const diff = (unitCost - lastKnownCost) / lastKnownCost;
      if (diff > 0.05) priceStatus = 'expensive';
      else if (diff < -0.05) priceStatus = 'cheap';
    }

    await this.prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        productId: dto.productId,
        quantity: dto.quantity,
        unitCost,
        lastKnownCost,
        priceStatus,
      },
    });

    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId },
    });
    const totalAmount = items.reduce(
      (s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0),
      0,
    );
    await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { totalAmount: Math.round(totalAmount * 100) / 100 },
    });

    return this.findById(purchaseOrderId);
  }

  async removeItem(purchaseOrderId: string, itemId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) {
      throw new NotFoundException(`Orden de compra "${purchaseOrderId}" no encontrada`);
    }
    if (po.status !== 'draft') {
      throw new BadRequestException(
        `Solo se pueden quitar productos en borrador. Estado actual: ${po.status}`,
      );
    }
    if (po.items.length <= 1) {
      throw new BadRequestException(
        'La orden debe tener al menos un producto. No se puede eliminar el único ítem.',
      );
    }
    const item = po.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`El ítem "${itemId}" no pertenece a esta orden.`);
    }

    await this.prisma.purchaseOrderItem.delete({ where: { id: itemId } });

    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId },
    });
    const totalAmount = items.reduce(
      (s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0),
      0,
    );
    await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { totalAmount: Math.round(totalAmount * 100) / 100 },
    });

    return this.findById(purchaseOrderId);
  }

  async place(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true } } } },
        supplier: { select: { id: true, name: true } },
      },
    });
    if (!po) throw new NotFoundException(`Purchase order "${id}" not found`);
    if (po.status !== 'draft') {
      throw new BadRequestException(`Solo se puede enviar una orden en estado borrador. Actual: ${po.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'placed', placedAt: new Date() },
      });

      const receiptNumber = await this.generateGoodsReceiptNumber(tx);
      const totalAmount = po.items.reduce(
        (s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0),
        0,
      );
      await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          locationId: po.locationId,
          supplierId: po.supplierId,
          status: 'draft',
          totalAmount: Math.round(totalAmount * 100) / 100,
          userId,
          purchaseOrderId: po.id,
          items: {
            create: po.items.map((item) => ({
              productId: item.productId,
              orderedQty: item.quantity,
              receivedQty: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
      });

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
        },
      });
    });
  }

  async confirm(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order "${id}" not found`);
    if (po.status !== 'placed') {
      throw new BadRequestException(`Solo se puede confirmar una orden enviada. Actual: ${po.status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date() },
      include: { supplier: { select: { id: true, name: true } }, items: true },
    });
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: { select: { name: true } } },
    });
    if (!po) throw new NotFoundException(`Purchase order "${id}" not found`);
    if (po.status !== 'confirmed') {
      throw new BadRequestException(`Solo se puede recibir una orden confirmada. Actual: ${po.status}`);
    }

    if (dto.goodsReceiptId) {
      const receipt = await this.prisma.goodsReceipt.findUnique({
        where: { id: dto.goodsReceiptId },
      });
      if (!receipt) throw new NotFoundException(`Goods receipt "${dto.goodsReceiptId}" not found`);
      if (receipt.supplierId !== po.supplierId || receipt.locationId !== po.locationId) {
        throw new BadRequestException('El ingreso no corresponde al mismo proveedor y ubicación que la orden.');
      }
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'received', goodsReceiptId: dto.goodsReceiptId },
        include: {
          supplier: { select: { id: true, name: true } },
          goodsReceipt: { select: { id: true, receiptNumber: true } },
          items: true,
        },
      });
    }

    // Sin vincular ingreso: marcar como recibida igual (el ingreso se crea al aprobar/pagar)
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'received', goodsReceiptId: null },
      include: {
        supplier: { select: { id: true, name: true } },
        items: true,
      },
    });
  }

  async approve(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order "${id}" not found`);
    if (po.status !== 'received') {
      throw new BadRequestException(`Solo se puede aprobar/pagar una orden recibida. Actual: ${po.status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'approved_payment', approvedAt: new Date() },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
  }

  private async generateGoodsReceiptNumber(tx: Prisma.TransactionClient): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `GR-${dateStr}-`;
    const latest = await tx.goodsReceipt.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });
    const lastSeq = parseInt(latest?.receiptNumber?.split('-').pop() || '0', 10);
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  }
}
