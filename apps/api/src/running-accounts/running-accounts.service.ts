import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArcaFiscalService } from '../arca/arca.fiscal.service';

@Injectable()
export class RunningAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arcaFiscalService: ArcaFiscalService,
  ) {}

  /** Excluye locales cuyo nombre contiene "deposito" o "depósito" (case-insensitive). */
  private isDepositoLocation(name: string): boolean {
    const lower = (name ?? '').toLowerCase().normalize('NFD').replace(/\u0301/g, '');
    return lower.includes('deposito');
  }

  /** Lista clientes con cuenta corriente de todos los locales excepto depósito. */
  async getClients(_locationId?: string) {
    const locations = await this.prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    let locationIds = locations.filter((l) => !this.isDepositoLocation(l.name)).map((l) => l.id);
    if (locationIds.length === 0) locationIds = locations.map((l) => l.id);

    const customers = await this.prisma.customer.findMany({
      where: {
        locationId: { in: locationIds },
        isActive: true,
      },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    const result = await Promise.all(
      customers.map(async (c) => {
        const [pending, count] = await Promise.all([
          this.prisma.order.aggregate({
            where: {
              customerId: c.id,
              invoiceType: 'cuenta_corriente',
              cuentaCorrienteStatus: { in: ['pending', 'remito_sent'] },
              status: 'closed',
            },
            _sum: { total: true },
          }),
          this.prisma.order.count({
            where: {
              customerId: c.id,
              invoiceType: 'cuenta_corriente',
              status: 'closed',
            },
          }),
        ]);
        return {
          id: c.id,
          name: c.name,
          legalName: c.legalName,
          cuit: c.cuit,
          email: c.email,
          phone: c.phone,
          creditLimit: c.creditLimit,
          pendingTotal: pending._sum.total ?? 0,
          ordersCount: count,
          locationId: c.locationId,
          locationName: c.location?.name ?? null,
        };
      }),
    );

    const seenNames = new Set<string>();
    return result.filter((c) => {
      const key = (c.name ?? '').trim().toLowerCase();
      if (!key) return true;
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
  }

  /** Órdenes a cuenta corriente de un cliente, opcionalmente filtradas por mes */
  async getOrdersByCustomer(
    locationId: string,
    customerId: string,
    month?: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, locationId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const where: any = {
      locationId,
      customerId,
      invoiceType: 'cuenta_corriente',
      status: 'closed',
    };
    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (!y || !m) throw new BadRequestException('month debe ser YYYY-MM');
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      where.closedAt = { gte: start, lte: end };
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { closedAt: 'asc' },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        table: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    return orders;
  }

  /** Marcar remito enviado */
  async markRemitoSent(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.invoiceType !== 'cuenta_corriente') {
      throw new BadRequestException('La orden no es a cuenta corriente');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        cuentaCorrienteStatus: 'remito_sent',
        remitoSentAt: new Date(),
      },
    });
  }

  /** Marcar todos los remitos del mes como enviados (órdenes pending → remito_sent). */
  async markMonthRemitoSent(locationId: string, customerId: string, month: string) {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) throw new BadRequestException('month debe ser YYYY-MM');
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

    await this.prisma.order.updateMany({
      where: {
        locationId,
        customerId,
        invoiceType: 'cuenta_corriente',
        cuentaCorrienteStatus: 'pending',
        status: 'closed',
        closedAt: { gte: start, lte: end },
      },
      data: {
        cuentaCorrienteStatus: 'remito_sent',
        remitoSentAt: new Date(),
      },
    });
    return this.getOrdersByCustomer(locationId, customerId, month);
  }

  /** Facturar todo el mes: emite Factura A y marca como facturado cada orden pendiente o con remito enviado del mes. */
  async markMonthInvoiced(locationId: string, customerId: string, month: string) {
    const orders = await this.getOrdersByCustomer(locationId, customerId, month);
    const toInvoice = orders.filter(
      (o: { cuentaCorrienteStatus: string }) =>
        o.cuentaCorrienteStatus === 'pending' || o.cuentaCorrienteStatus === 'remito_sent',
    );
    for (const order of toInvoice) {
      await this.markInvoiced(order.id);
    }
    return this.getOrdersByCustomer(locationId, customerId, month);
  }

  /** Marcar como facturado/pagado: emite Factura A por ARCA (si aún no está emitida) y marca la orden como facturada. */
  async markInvoiced(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.invoiceType !== 'cuenta_corriente') {
      throw new BadRequestException('La orden no es a cuenta corriente');
    }

    if (order.fiscalStatus !== 'issued') {
      await this.arcaFiscalService.emitForOrder(orderId, true);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        cuentaCorrienteStatus: 'invoiced',
        invoicedAt: new Date(),
      },
    });
  }
}
