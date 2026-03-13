import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateItemStatusDto } from './dto/update-item-status.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { CloseOrderDto } from './dto/close-order.dto';
import { UpdateOrderSplitDto } from './dto/update-order-split.dto';
import { ArcaFiscalService } from '../arca/arca.fiscal.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arcaFiscalService: ArcaFiscalService,
  ) {}

  async findAll(filters: {
    locationId?: string;
    status?: string;
    type?: string;
    waiterId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      status,
      type,
      waiterId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (waiterId) where.waiterId = waiterId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          table: { select: { id: true, name: true, zone: true } },
          waiter: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
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

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
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
                imageUrl: true,
                salePrice: true,
              },
            },
            preparedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        table: { select: { id: true, name: true, zone: true, capacity: true } },
        waiter: {
          select: { id: true, firstName: true, lastName: true },
        },
        cashier: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }

    // Map items to include productName, productImage, and totalPrice for frontend
    const mappedItems = order.items.map((item) => ({
      ...item,
      productName: item.product?.name || 'Producto',
      productImage: item.product?.imageUrl || null,
      totalPrice: item.unitPrice * item.quantity,
    }));

    return {
      ...order,
      items: mappedItems,
      subtotal: mappedItems.reduce((sum, i) => sum + i.totalPrice, 0),
    };
  }

  async create(data: CreateOrderDto, userId: string) {
    // Generate order number: ORD-YYYYMMDD-XXX
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const todayCount = await this.prisma.order.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    const orderNumber = `ORD-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;

    // Calculate subtotal from items
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const total = Math.round(subtotal * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          locationId: data.locationId,
          orderNumber,
          type: data.type,
          tableId: data.tableId,
          customerCount: data.customerCount ?? 1,
          subtotal: total,
          total,
          notes: data.notes,
          waiterId: userId,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              sector: item.sector,
              notes: item.notes,
            })),
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
          table: { select: { id: true, name: true, zone: true } },
          location: { select: { id: true, name: true } },
        },
      });

      // If tableId provided, update table status to 'occupied'
      if (data.tableId) {
        await tx.table.update({
          where: { id: data.tableId },
          data: {
            status: 'occupied',
            currentOrderId: order.id,
          },
        });
      }

      return order;
    });
  }

  async addItem(orderId: string, data: CreateOrderItemDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    if (order.status === 'closed' || order.status === 'cancelled') {
      throw new BadRequestException(
        `Cannot add items to order with status "${order.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.create({
        data: {
          orderId,
          productId: data.productId,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          sector: data.sector,
          notes: data.notes,
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true },
          },
        },
      });

      // Recalculate totals
      const allItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      const subtotal = allItems.reduce(
        (sum, i) => sum + i.unitPrice * i.quantity,
        0,
      );
      const newTotal = Math.round(
        (subtotal - order.discountAmount) * 100,
      ) / 100;

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: Math.round(subtotal * 100) / 100,
          total: newTotal,
        },
      });

      return item;
    });
  }

  async updateItemStatus(itemId: string, data: UpdateItemStatusDto) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Order item with ID "${itemId}" not found`);
    }

    const updateData: any = { status: data.status };

    // Set timestamps based on status transitions
    if (data.status === 'preparing' && !item.startedAt) {
      updateData.startedAt = new Date();
    }
    if (data.status === 'ready' && !item.readyAt) {
      updateData.readyAt = new Date();
    }
    if (data.status === 'served' && !item.servedAt) {
      updateData.servedAt = new Date();
    }

    if (data.preparedById) {
      updateData.preparedById = data.preparedById;
    }

    return this.prisma.orderItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true },
        },
        preparedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async updateOrderItem(itemId: string, data: UpdateOrderItemDto) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) {
      throw new NotFoundException(`Order item with ID "${itemId}" not found`);
    }
    if (item.order.status !== 'open') {
      throw new BadRequestException('Cannot update item of a closed or cancelled order');
    }
    const updateData: { quantity?: number; notes?: string } = {};
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.notes !== undefined) updateData.notes = data.notes;
    const updated = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
    });
    await this.recalculateOrderSubtotal(item.orderId);
    return updated;
  }

  async removeOrderItem(itemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });
    if (!item) {
      throw new NotFoundException(`Order item with ID "${itemId}" not found`);
    }
    if (item.order.status !== 'open') {
      throw new BadRequestException('Cannot remove item from a closed or cancelled order');
    }
    await this.prisma.orderItem.delete({ where: { id: itemId } });
    await this.recalculateOrderSubtotal(item.orderId);
    return { success: true };
  }

  private async recalculateOrderSubtotal(orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
    });
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) return;
    const total = Math.round((subtotal - order.discountAmount) * 100) / 100;
    await this.prisma.order.update({
      where: { id: orderId },
      data: { subtotal: Math.round(subtotal * 100) / 100, total },
    });
  }

  async updateOrderSplit(id: string, data: UpdateOrderSplitDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }
    if (order.status !== 'open') {
      throw new BadRequestException(
        'Solo se puede actualizar la división de un pedido abierto',
      );
    }
    const updateData: { customerCount?: number; splitMode?: boolean; itemPayer?: object } = {};
    if (data.customerCount !== undefined) updateData.customerCount = data.customerCount;
    if (data.splitMode !== undefined) updateData.splitMode = data.splitMode;
    if (data.itemPayer !== undefined) updateData.itemPayer = data.itemPayer as object;
    if (Object.keys(updateData).length === 0) {
      return this.findById(id);
    }
    await this.prisma.order.update({
      where: { id },
      data: updateData,
    });
    return this.findById(id);
  }

  async closeOrder(id: string, data: CloseOrderDto, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        table: { select: { tableType: true } },
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }

    if (order.status === 'closed') {
      throw new BadRequestException('Order is already closed');
    }
    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot close a cancelled order');
    }

    const discountAmount = data.discountAmount ?? order.discountAmount;
    const finalTotal =
      Math.round((order.subtotal - discountAmount) * 100) / 100;

    const isSpecialTable =
      order.table?.tableType === 'errors' || order.table?.tableType === 'trash';

    const effectiveCustomerId = data.customerId ?? order.customerId ?? undefined;

    if (data.invoiceType === 'factura_a' && !effectiveCustomerId && !isSpecialTable) {
      throw new BadRequestException(
        'Para Factura A debés seleccionar un cliente con CUIT.',
      );
    }

    if (effectiveCustomerId && !isSpecialTable) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: effectiveCustomerId },
      });
      if (!customer || !customer.isActive || customer.locationId !== order.locationId) {
        throw new BadRequestException(
          'El cliente seleccionado no existe o no pertenece al local de la venta.',
        );
      }
    }

    const invoiceType =
      !isSpecialTable && data.invoiceType
        ? this.arcaFiscalService.resolveInvoiceType(data.invoiceType)
        : undefined;

    const closedOrder = await this.prisma.$transaction(async (tx) => {
      // Crear movimientos de stock (venta) solo si NO es la mesa de errores de comandas
      if (!isSpecialTable) {
        for (const item of order.items) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: order.locationId,
              },
            },
          });

          if (stockLevel) {
            await tx.stockLevel.update({
              where: {
                productId_locationId: {
                  productId: item.productId,
                  locationId: order.locationId,
                },
              },
              data: {
                quantity: stockLevel.quantity - item.quantity,
              },
            });
          }

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              locationId: order.locationId,
              type: 'sale',
              quantity: -item.quantity,
              unitCost: item.unitPrice,
              referenceType: 'order',
              referenceId: order.id,
              userId,
            },
          });
        }
      }

      // Persistir desglose por medio de pago para que el cierre de caja sume por método (tarjetas, efectivo, QR, transferencia)
      const paymentBreakdown =
        Array.isArray(data.payments) && data.payments.length > 0
          ? data.payments.map((p: { diner: number; method: string; amount: number }) => ({
              diner: Number(p.diner),
              method: String(p.method || 'cash').trim() || 'cash',
              amount: Math.round(Number(p.amount) * 100) / 100,
            }))
          : null;
      const orderPaymentMethod = paymentBreakdown ? 'split' : data.paymentMethod;

      // Update order
      const closedOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'closed',
          paymentMethod: orderPaymentMethod,
          paymentBreakdown: paymentBreakdown ?? undefined,
          discountAmount,
          total: finalTotal,
          cashierId: userId,
          closedAt: new Date(),
          notes: data.notes ?? order.notes,
          invoiceType: invoiceType ?? 'consumidor',
          customerId: effectiveCustomerId,
          fiscalStatus: isSpecialTable
            ? 'skipped'
            : this.arcaFiscalService.isEnabled()
              ? 'pending'
              : 'disabled',
          fiscalLastError: null,
          fiscalAttemptedAt: null,
          fiscalIssuedAt: null,
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
          table: { select: { id: true, name: true } },
          waiter: {
            select: { id: true, firstName: true, lastName: true },
          },
          cashier: {
            select: { id: true, firstName: true, lastName: true },
          },
          customer: {
            select: {
              id: true,
              name: true,
              legalName: true,
              cuit: true,
              taxCondition: true,
              documentType: true,
              documentNumber: true,
            },
          },
        },
      });

      if (!isSpecialTable) {
        await tx.fiscalVoucher.upsert({
          where: { orderId: order.id },
          update: {
            status: this.arcaFiscalService.isEnabled() ? 'pending' : 'disabled',
            invoiceType: invoiceType ?? 'consumidor',
            errorCode: null,
            errorMessage: null,
          },
          create: {
            orderId: order.id,
            status: this.arcaFiscalService.isEnabled() ? 'pending' : 'disabled',
            invoiceType: invoiceType ?? 'consumidor',
          },
        });
      }

      // If table exists, set table status to 'available'
      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
          data: {
            status: 'available',
            currentOrderId: null,
          },
        });
      }

      return closedOrder;
    });

    if (!isSpecialTable && this.arcaFiscalService.isEnabled()) {
      void this.arcaFiscalService.emitForOrder(closedOrder.id).catch(() => undefined);
    }

    return closedOrder;
  }

  async cancelOrder(id: string) {
    const order = await this.findById(id);

    if (order.status === 'closed') {
      throw new BadRequestException('Cannot cancel a closed order');
    }
    if (order.status === 'cancelled') {
      throw new BadRequestException('Order is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      // If table exists, set table status to 'available'
      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
          data: {
            status: 'available',
            currentOrderId: null,
          },
        });
      }

      return cancelled;
    });
  }

  /** Cambio de mesa: solo Cajero/Admin. Mueve la orden a otra mesa (mesa actual → disponible, nueva → ocupada). */
  async changeOrderTable(orderId: string, newTableId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { table: { select: { id: true, name: true } } },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }
    if (order.status !== 'open') {
      throw new BadRequestException('Solo se puede cambiar la mesa de una orden abierta');
    }
    if (!order.tableId) {
      throw new BadRequestException('La orden no tiene mesa asignada');
    }
    if (order.tableId === newTableId) {
      throw new BadRequestException('La orden ya está en esa mesa');
    }

    const newTable = await this.prisma.table.findUnique({
      where: { id: newTableId },
    });
    if (!newTable) {
      throw new NotFoundException(`Mesa con ID "${newTableId}" no encontrada`);
    }
    if (newTable.locationId !== order.locationId) {
      throw new BadRequestException('La mesa de destino debe ser del mismo local');
    }
    const isSpecialTable = newTable.tableType === 'trash' || newTable.tableType === 'errors';
    if (!isSpecialTable && (newTable.status !== 'available' || newTable.currentOrderId)) {
      throw new BadRequestException('La mesa de destino debe estar desocupada');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { tableId: newTableId },
      });
      await tx.table.update({
        where: { id: order.tableId! },
        data: { status: 'available', currentOrderId: null },
      });
      await tx.table.update({
        where: { id: newTableId },
        data: { status: 'occupied', currentOrderId: orderId },
      });
      return this.findById(orderId);
    });
  }

  /**
   * Mueve ítems de una orden a otra mesa (mesa completa o por artículo).
   * Si la mesa destino tiene orden abierta, agrega ahí; si no, crea nueva orden.
   */
  async moveItemsToTable(
    orderId: string,
    itemIds: string[],
    newTableId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, table: true },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }
    if (order.status !== 'open') {
      throw new BadRequestException('Solo se pueden mover ítems de una orden abierta');
    }
    if (!order.tableId) {
      throw new BadRequestException('La orden no tiene mesa asignada');
    }
    if (order.tableId === newTableId) {
      throw new BadRequestException('La mesa de destino no puede ser la misma');
    }

    const orderItemIds = new Set(order.items.map((i) => i.id));
    const invalid = itemIds.filter((id) => !orderItemIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Algunos ítems no pertenecen a esta orden: ${invalid.join(', ')}`,
      );
    }

    const newTable = await this.prisma.table.findUnique({
      where: { id: newTableId },
      include: { orders: { where: { status: 'open' }, take: 1 } },
    });
    if (!newTable) {
      throw new NotFoundException(`Mesa con ID "${newTableId}" no encontrada`);
    }
    if (newTable.locationId !== order.locationId) {
      throw new BadRequestException('La mesa de destino debe ser del mismo local');
    }

    const isSpecialTable =
      newTable.tableType === 'trash' || newTable.tableType === 'errors';
    if (
      !isSpecialTable &&
      newTable.status !== 'available' &&
      !newTable.currentOrderId
    ) {
      throw new BadRequestException('La mesa de destino debe estar disponible');
    }

    const itemsToMove = order.items.filter((i) => itemIds.includes(i.id));
    if (itemsToMove.length === 0) {
      throw new BadRequestException('Seleccioná al menos un ítem');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findFirst({
        where: { tableId: newTableId, status: 'open' },
      });
      let targetOrderId: string | null = existingOrder?.id ?? null;

      if (!targetOrderId) {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const todayStart = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const todayEnd = new Date(todayStart.getTime() + 86400000);
        const todayCount = await tx.order.count({
          where: {
            createdAt: { gte: todayStart, lt: todayEnd },
          },
        });
        const orderNumber = `ORD-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;
        const newOrder = await tx.order.create({
          data: {
            locationId: order.locationId,
            orderNumber,
            type: order.type,
            tableId: newTableId,
            customerCount: 1,
            subtotal: 0,
            total: 0,
            waiterId: order.waiterId,
          },
        });
        targetOrderId = newOrder.id;
        await tx.table.update({
          where: { id: newTableId },
          data: { status: 'occupied', currentOrderId: newOrder.id },
        });
      }

      const now = new Date();
      for (const item of itemsToMove) {
        await tx.orderItem.create({
          data: {
            orderId: targetOrderId!,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            sector: item.sector,
            notes: item.notes,
            skipComanda: true, // No emitir comanda: ítems movidos de otra mesa
            status: 'served', // No aparecen en "En Cola": ya están servidos
            servedAt: now,
          },
        });
        await tx.orderItem.delete({ where: { id: item.id } });
      }

      const recalcOrder = async (id: string) => {
        const items = await tx.orderItem.findMany({ where: { orderId: id } });
        const subtotal = items.reduce(
          (s, i) => s + i.unitPrice * i.quantity,
          0,
        );
        const ord = await tx.order.findUnique({ where: { id } });
        const total = Math.round((subtotal - (ord?.discountAmount ?? 0)) * 100) / 100;
        await tx.order.update({
          where: { id },
          data: {
            subtotal: Math.round(subtotal * 100) / 100,
            total,
          },
        });
      };
      await recalcOrder(orderId);
      await recalcOrder(targetOrderId!);

      return this.findById(orderId);
    });
  }

  async getKitchenOrders(locationId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        locationId,
        status: { in: ['open'] },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },
            preparedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        table: { select: { id: true, name: true, zone: true } },
        waiter: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Flatten product name into each item and group by status
    return orders.map((order) => {
      const flatItems = order.items.map((i) => ({
        ...i,
        productName: i.product?.name || 'Producto',
        productImage: i.product?.imageUrl || null,
      }));

      const pending = flatItems.filter((i) => i.status === 'pending');
      const preparing = flatItems.filter(
        (i) => i.status === 'preparing' || i.status === 'in_progress',
      );
      const ready = flatItems.filter((i) => i.status === 'ready');

      return {
        ...order,
        items: flatItems,
        tableName: order.table?.name || null,
        itemsByStatus: { pending, preparing, ready },
      };
    });
  }

  async getReadyItems(locationId: string) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    const items = await this.prisma.orderItem.findMany({
      where: {
        status: 'ready',
        readyAt: { gte: fiveMinAgo },
        order: {
          locationId,
          status: 'open',
        },
      },
      select: {
        id: true,
        quantity: true,
        readyAt: true,
        product: { select: { id: true, name: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            table: { select: { id: true, name: true, zone: true } },
          },
        },
      },
      orderBy: { readyAt: 'desc' },
    });

    // Group by table
    const byTable = new Map<
      string,
      {
        tableId: string;
        tableName: string;
        orderNumber: string;
        itemIds: string[];
        items: { name: string; quantity: number }[];
        readyAt: Date | null;
      }
    >();

    for (const item of items) {
      const tableId = item.order.table?.id || item.order.id;
      const tableName =
        item.order.table?.name || `Pedido #${item.order.orderNumber}`;

      if (!byTable.has(tableId)) {
        byTable.set(tableId, {
          tableId,
          tableName,
          orderNumber: item.order.orderNumber,
          itemIds: [],
          items: [],
          readyAt: item.readyAt,
        });
      }
      const entry = byTable.get(tableId)!;
      entry.itemIds.push(item.id);
      entry.items.push({
        name: item.product?.name || 'Producto',
        quantity: item.quantity,
      });
    }

    return Array.from(byTable.values());
  }

  /** Ventas por día de la semana: esta semana vs semana anterior (para dashboard) */
  async getSalesByWeek(locationId?: string) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);
    const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
    const nextMonday = new Date(thisMonday.getTime() + 7 * 86400000);

    const where: any = {
      closedAt: { gte: lastMonday, lt: nextMonday },
    };
    if (locationId) where.locationId = locationId;

    const orders = await this.prisma.order.findMany({
      where,
      select: { closedAt: true, total: true },
    });

    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const current: number[] = [0, 0, 0, 0, 0, 0, 0];
    const previous: number[] = [0, 0, 0, 0, 0, 0, 0];

    for (const o of orders) {
      const closed = o.closedAt!;
      const weekday = (closed.getDay() + 6) % 7;
      const weekIndex = closed < thisMonday ? 0 : 1;
      const total = o.total ?? 0;
      if (weekIndex === 0) previous[weekday] += total;
      else current[weekday] += total;
    }

    return dayNames.map((day, i) => ({
      day,
      current: Math.round(current[i] * 100) / 100,
      previous: Math.round(previous[i] * 100) / 100,
    }));
  }

  /** Ventas por día (monto total) para gráfico de línea/área. dateFrom/dateTo en YYYY-MM-DD. */
  async getSalesByDay(params: {
    dateFrom: string;
    dateTo: string;
    locationId?: string;
  }) {
    const { dateFrom, dateTo, locationId } = params;
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const where: any = {
      status: 'closed',
      closedAt: { gte: from, lte: to },
    };
    if (locationId) where.locationId = locationId;

    const orders = await this.prisma.order.findMany({
      where,
      select: { closedAt: true, total: true },
    });

    const dayMap: Record<string, number> = {};
    const dayCountMap: Record<string, number> = {};
    for (const o of orders) {
      const d = o.closedAt!;
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = (dayMap[key] || 0) + (o.total ?? 0);
      dayCountMap[key] = (dayCountMap[key] || 0) + 1;
    }

    const out: { date: string; amount: number; count: number }[] = [];
    const curr = new Date(from);
    while (curr <= to) {
      const key = curr.toISOString().slice(0, 10);
      out.push({
        date: key,
        amount: Math.round((dayMap[key] || 0) * 100) / 100,
        count: dayCountMap[key] || 0,
      });
      curr.setDate(curr.getDate() + 1);
    }
    return out;
  }

  /** Ventas por día de la semana y hora (0-23) para heatmap. dayOfWeek 0=domingo, 1=lunes... */
  async getSalesByDayAndHour(params: {
    dateFrom: string;
    dateTo: string;
    locationId?: string;
  }) {
    const { dateFrom, dateTo, locationId } = params;
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const where: any = {
      status: 'closed',
      closedAt: { gte: from, lte: to },
    };
    if (locationId) where.locationId = locationId;

    const orders = await this.prisma.order.findMany({
      where,
      select: { closedAt: true, total: true },
    });

    const grid: Record<string, { total: number; count: number }> = {};
    for (const o of orders) {
      const d = o.closedAt!;
      const dayOfWeek = d.getDay();
      const hour = d.getHours();
      const key = `${dayOfWeek}_${hour}`;
      if (!grid[key]) grid[key] = { total: 0, count: 0 };
      grid[key].total += o.total ?? 0;
      grid[key].count += 1;
    }

    return Object.entries(grid).map(([k, v]) => {
      const [dayOfWeek, hour] = k.split('_').map(Number);
      const ticketAvg = v.count > 0 ? v.total / v.count : 0;
      return {
        dayOfWeek,
        hour,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
        ticketAvg: Math.round(ticketAvg * 100) / 100,
      };
    });
  }

  /** Top N productos por monto de venta (ordenes cerradas, ítems) */
  async getTopProductsBySales(params: {
    dateFrom: string;
    dateTo: string;
    locationId?: string;
    limit?: number;
  }) {
    const { dateFrom, dateTo, locationId, limit = 10 } = params;
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const whereOrder: any = {
      status: 'closed',
      closedAt: { gte: from, lte: to },
    };
    if (locationId) whereOrder.locationId = locationId;

    const items = await this.prisma.orderItem.findMany({
      where: { order: whereOrder },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byProduct: Record<
      string,
      { productId: string; name: string; categoryName: string; total: number; quantity: number }
    > = {};
    for (const i of items) {
      const pid = i.productId;
      const amount = i.unitPrice * i.quantity;
      if (!byProduct[pid]) {
        byProduct[pid] = {
          productId: pid,
          name: i.product?.name || 'N/A',
          categoryName: i.product?.category?.name || 'Sin categoría',
          total: 0,
          quantity: 0,
        };
      }
      byProduct[pid].total += amount;
      byProduct[pid].quantity += i.quantity;
    }

    return Object.values(byProduct)
      .map((p) => ({ ...p, total: Math.round(p.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  /** Top N categorías (familias) por monto de venta */
  async getTopCategoriesBySales(params: {
    dateFrom: string;
    dateTo: string;
    locationId?: string;
    limit?: number;
  }) {
    const { dateFrom, dateTo, locationId, limit = 10 } = params;
    const from = new Date(dateFrom + 'T00:00:00.000Z');
    const to = new Date(dateTo + 'T23:59:59.999Z');

    const whereOrder: any = {
      status: 'closed',
      closedAt: { gte: from, lte: to },
    };
    if (locationId) whereOrder.locationId = locationId;

    const items = await this.prisma.orderItem.findMany({
      where: { order: whereOrder },
      include: {
        product: {
          select: {
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byCategory: Record<string, { categoryId: string; name: string; total: number }> = {};
    for (const i of items) {
      const cid = i.product?.categoryId || 'sin-categoria';
      const name = i.product?.category?.name || 'Sin categoría';
      const amount = i.unitPrice * i.quantity;
      if (!byCategory[cid]) {
        byCategory[cid] = { categoryId: cid, name, total: 0 };
      }
      byCategory[cid].total += amount;
    }

    return Object.values(byCategory)
      .map((c) => ({ ...c, total: Math.round(c.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}
