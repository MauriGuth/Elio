import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { getPrepMinutesByProductIdsForLocation } from '../recipes/recipes-pos.helper';
import { OpenRegisterDto } from './dto/open-register.dto';
import { CloseRegisterDto } from './dto/close-register.dto';

/** Normaliza método de pago (UI puede enviar "efectivo"/"tarjeta"/"transferencia" o "cash"/"card"/"transfer"). */
function normalizePaymentMethod(method: string): string {
  const m = (method || 'cash').toLowerCase();
  if (m === 'efectivo') return 'cash';
  if (m === 'tarjeta') return 'card';
  if (m === 'transferencia') return 'transfer';
  return m;
}

/** Convierte paymentBreakdown (array o objeto con índices) a array de { method, amount } para sumar por medio de pago. */
function paymentBreakdownToItems(raw: unknown): { method: string; amount: number }[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p: any) => ({
      method: String(p?.method ?? 'cash').trim() || 'cash',
      amount: Number(p?.amount) || 0,
    }));
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, any>;
    return Object.values(obj).map((p: any) => ({
      method: String(p?.method ?? 'cash').trim() || 'cash',
      amount: Number(p?.amount) || 0,
    }));
  }
  return [];
}

@Injectable()
export class CashRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(locationId: string) {
    return this.prisma.cashRegister.findMany({
      where: { locationId },
      include: {
        location: { select: { id: true, name: true, type: true } },
        openedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        closedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, type: true } },
        openedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        closedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        cashMovements: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!register) {
      throw new NotFoundException(`Cash register with ID "${id}" not found`);
    }

    return register;
  }

  async openRegister(data: OpenRegisterDto, userId: string) {
    // Check if there's already an open register at this location
    const existingOpen = await this.prisma.cashRegister.findFirst({
      where: {
        locationId: data.locationId,
        status: 'open',
      },
    });

    if (existingOpen) {
      throw new BadRequestException(
        'There is already an open cash register at this location',
      );
    }

    let openingAmount = data.openingAmount;
    let openingDenominations: Record<string, number> | null = null;
    if (
      data.denominations &&
      typeof data.denominations === 'object' &&
      Object.keys(data.denominations).length > 0
    ) {
      openingDenominations = data.denominations as Record<string, number>;
      openingAmount = 0;
      for (const [denomStr, qty] of Object.entries(openingDenominations)) {
        const denom = parseFloat(denomStr);
        const n = typeof qty === 'number' ? qty : parseInt(String(qty), 10) || 0;
        if (!Number.isNaN(denom) && n >= 0) openingAmount += denom * n;
      }
      openingAmount = Math.round(openingAmount * 100) / 100;
    }

    return this.prisma.cashRegister.create({
      data: {
        locationId: data.locationId,
        name: data.name ?? 'Caja Principal',
        status: 'open',
        shift: data.shift ?? undefined,
        openedAt: new Date(),
        openedById: userId,
        openingAmount,
        ...(openingDenominations
          ? { openingDenominations: openingDenominations as object }
          : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        openedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async closeRegister(id: string, data: CloseRegisterDto, userId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
    });

    if (!register) {
      throw new NotFoundException(`Cash register with ID "${id}" not found`);
    }

    if (register.status !== 'open') {
      throw new BadRequestException('Cash register is not open');
    }

    // Si viene conteo por denominación, calcular caja real (efectivo) como suma de valor × cantidad
    let closingAmount = data.closingAmount;
    let closingDenominations: Record<string, number> | null = null;
    if (data.denominations && typeof data.denominations === 'object' && Object.keys(data.denominations).length > 0) {
      closingDenominations = data.denominations as Record<string, number>;
      closingAmount = 0;
      for (const [denomStr, qty] of Object.entries(closingDenominations)) {
        const denom = parseFloat(denomStr);
        const n = typeof qty === 'number' ? qty : parseInt(String(qty), 10) || 0;
        if (!Number.isNaN(denom) && n >= 0) closingAmount += denom * n;
      }
      closingAmount = Math.round(closingAmount * 100) / 100;
    }

    // Ventas por medio de pago desde órdenes cerradas en este turno (excluir mesas errores de comandas y tacho de basura)
    const orders = await this.prisma.order.findMany({
      where: {
        locationId: register.locationId,
        status: 'closed',
        closedAt: {
          gte: register.openedAt!,
        },
        OR: [
          { tableId: null },
          { table: { tableType: { notIn: ['errors', 'trash'] } } },
        ],
      },
      select: {
        total: true,
        paymentMethod: true,
        paymentBreakdown: true,
        invoiceType: true,
      },
    });

    let salesCash = 0;
    let salesDebit = 0;
    let salesCredit = 0;
    let salesCard = 0;
    let salesQr = 0;
    let salesTransfer = 0;
    let totalSales = 0;
    let totalCuentaCorriente = 0;

    for (const order of orders) {
      const isCuentaCorriente =
        order.invoiceType === 'cuenta_corriente' || order.paymentMethod === 'cuenta_corriente';
      if (isCuentaCorriente) {
        totalCuentaCorriente += order.total;
        continue;
      }
      totalSales += order.total;
      const items = paymentBreakdownToItems(order.paymentBreakdown);
      if (items.length > 0) {
        for (const p of items) {
          const method = normalizePaymentMethod(p.method);
          const amount = p.amount;
          switch (method) {
            case 'cash': salesCash += amount; break;
            case 'debit': salesDebit += amount; break;
            case 'credit': salesCredit += amount; break;
            case 'card': salesCard += amount; break;
            case 'qr': salesQr += amount; break;
            case 'transfer': salesTransfer += amount; break;
            default: salesCash += amount;
          }
        }
      } else {
        const method = normalizePaymentMethod(order.paymentMethod || 'cash');
        switch (method) {
          case 'cash': salesCash += order.total; break;
          case 'debit': salesDebit += order.total; break;
          case 'credit': salesCredit += order.total; break;
          case 'card': salesCard += order.total; break;
          case 'qr': salesQr += order.total; break;
          case 'transfer': salesTransfer += order.total; break;
          default: salesCash += order.total;
        }
      }
    }

    // Gastos, retiros e ingresos extra del turno (movimientos ligados a esta caja)
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashRegisterId: id },
      select: { type: true, amount: true },
    });

    let totalCashExpenses = 0;
    let totalWithdrawals = 0;
    let totalExtraIncome = 0;
    for (const m of movements) {
      if (m.type === 'expense' || m.type === 'out') totalCashExpenses += m.amount;
      else if (m.type === 'withdrawal') totalWithdrawals += m.amount;
      else if (m.type === 'extra_income' || m.type === 'in') totalExtraIncome += m.amount;
    }

    // ─── Fórmulas obligatorias ───
    // Caja Esperada = Saldo Inicial + Tarjetas + Transferencias y QR + Efectivo - Gastos y Retiros + Ingresos Extra
    const opening = register.openingAmount ?? 0;
    const expectedAmount =
      Math.round((opening + salesCard + salesTransfer + salesQr + salesCash - totalCashExpenses - totalWithdrawals + totalExtraIncome) * 100) / 100;
    // Diferencia = Caja Real (conteo físico) - Caja Esperada
    const difference = Math.round((closingAmount - expectedAmount) * 100) / 100;

    const closingReconciliation =
      data.closingCardsTotal != null || data.closingTransferTotal != null || data.closingQrTotal != null
        ? {
            cards: data.closingCardsTotal ?? 0,
            transfer: data.closingTransferTotal ?? 0,
            qr: data.closingQrTotal ?? 0,
          }
        : undefined;

    const closedAt = new Date();
    const updated = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'closed',
        shift: data.shift ?? register.shift,
        closedAt,
        closedById: userId,
        closingAmount,
        expectedAmount,
        difference,
        closingDenominations: closingDenominations ?? undefined,
        closingReconciliation: closingReconciliation ?? undefined,
        salesCash: Math.round(salesCash * 100) / 100,
        salesDebit: Math.round(salesDebit * 100) / 100,
        salesCredit: Math.round(salesCredit * 100) / 100,
        salesCard: Math.round(salesCard * 100) / 100,
        salesQr: Math.round(salesQr * 100) / 100,
        salesTransfer: Math.round(salesTransfer * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        totalCashExpenses: Math.round(totalCashExpenses * 100) / 100,
        totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
        totalExtraIncome: Math.round(totalExtraIncome * 100) / 100,
        totalOrders: orders.length,
        totalCuentaCorriente: Math.round(totalCuentaCorriente * 100) / 100,
        salesNoTicket: data.salesNoTicket ?? 0,
        internalConsumption: data.internalConsumption ?? 0,
        notes: data.notes ?? undefined,
        closedBySignature: data.closedBySignature ?? undefined,
      },
      include: {
        location: { select: { id: true, name: true } },
        openedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        closedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Métricas del turno (errores, tacho, demoras, facturación) para el cajero y reportes
    try {
      const shiftMetrics = await this.getShiftMetrics(id);
      if (shiftMetrics) (updated as any).shiftMetrics = shiftMetrics;
    } catch {
      // no bloquear el cierre
    }

    // Informe comparativo con el mismo día de la semana anterior (IA)
    try {
      const prevSummary = await this.getPreviousWeekSameDaySummary(register.locationId, closedAt);
      const report = await this.generateClosureComparisonReport(
        {
          totalSales,
          totalOrders: orders.length,
          salesCash,
          salesDebit,
          salesCredit,
          salesCard,
          salesQr,
          salesTransfer,
          totalCashExpenses: totalCashExpenses + totalWithdrawals,
          totalExtraIncome,
        },
        prevSummary,
        closedAt,
      );
      if (report) {
        await this.prisma.cashRegister.update({
          where: { id },
          data: { comparisonReport: report },
        });
        (updated as any).comparisonReport = report;
      }
    } catch {
      // Si falla la IA o la consulta, el cierre ya quedó guardado; no bloquear
    }

    return updated;
  }

  /** Cierres del mismo día de la semana anterior (agregados) para comparar */
  private async getPreviousWeekSameDaySummary(locationId: string, closedAt: Date) {
    const prevDate = new Date(closedAt);
    prevDate.setDate(prevDate.getDate() - 7);
    const start = new Date(prevDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(prevDate);
    end.setHours(23, 59, 59, 999);

    const closures = await this.prisma.cashRegister.findMany({
      where: {
        locationId,
        status: 'closed',
        closedAt: { gte: start, lte: end },
      },
      select: {
        totalSales: true,
        totalOrders: true,
        salesCash: true,
        salesDebit: true,
        salesCredit: true,
        salesCard: true,
        salesQr: true,
        salesTransfer: true,
        totalCashExpenses: true,
        totalWithdrawals: true,
        totalExtraIncome: true,
      },
    });

    if (closures.length === 0) return null;

    return {
      totalSales: closures.reduce((s, c) => s + (c.totalSales ?? 0), 0),
      totalOrders: closures.reduce((s, c) => s + (c.totalOrders ?? 0), 0),
      salesCash: closures.reduce((s, c) => s + (c.salesCash ?? 0), 0),
      salesDebit: closures.reduce((s, c) => s + (c.salesDebit ?? 0), 0),
      salesCredit: closures.reduce((s, c) => s + (c.salesCredit ?? 0), 0),
      salesCard: closures.reduce((s, c) => s + (c.salesCard ?? 0), 0),
      salesQr: closures.reduce((s, c) => s + (c.salesQr ?? 0), 0),
      salesTransfer: closures.reduce((s, c) => s + (c.salesTransfer ?? 0), 0),
      totalCashExpenses: closures.reduce(
        (s, c) => s + (c.totalCashExpenses ?? 0) + (c.totalWithdrawals ?? 0),
        0,
      ),
      totalExtraIncome: closures.reduce((s, c) => s + (c.totalExtraIncome ?? 0), 0),
      date: start.toISOString().slice(0, 10),
    };
  }

  /** Genera informe comparativo en español con OpenAI */
  private async generateClosureComparisonReport(
    today: {
      totalSales: number;
      totalOrders: number;
      salesCash: number;
      salesDebit: number;
      salesCredit: number;
      salesCard: number;
      salesQr: number;
      salesTransfer: number;
      totalCashExpenses: number;
      totalExtraIncome: number;
    },
    prevWeek: {
      totalSales: number;
      totalOrders: number;
      salesCash: number;
      salesDebit: number;
      salesCredit: number;
      salesCard: number;
      salesQr: number;
      salesTransfer: number;
      totalCashExpenses: number;
      totalExtraIncome: number;
      date: string;
    } | null,
    closedAt: Date,
  ): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const openai = new OpenAI({ apiKey });
    const dayName = closedAt.toLocaleDateString('es-CL', { weekday: 'long' });
    const prevDayName = prevWeek
      ? new Date(prevWeek.date).toLocaleDateString('es-CL', { weekday: 'long' })
      : '';

    const format = (n: number) =>
      new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);

    const prompt = prevWeek
      ? `Eres un analista de cierre de caja. Genera un informe breve (2 a 4 párrafos cortos) en español comparando el cierre de hoy con el del mismo día de la semana anterior.

Datos de HOY (cierre actual):
- Ventas totales: ${format(today.totalSales)} | Cantidad de órdenes: ${today.totalOrders}
- Efectivo: ${format(today.salesCash)} | Tarjetas (débito+crédito+card): ${format(today.salesDebit + today.salesCredit + today.salesCard)} | Transferencias: ${format(today.salesTransfer)} | QR: ${format(today.salesQr)}
- Gastos/retiros: ${format(today.totalCashExpenses)} | Ingresos extra: ${format(today.totalExtraIncome)}

Datos del MISMO DÍA de la SEMANA ANTERIOR (${prevDayName} ${prevWeek.date}):
- Ventas totales: ${format(prevWeek.totalSales)} | Cantidad de órdenes: ${prevWeek.totalOrders}
- Efectivo: ${format(prevWeek.salesCash)} | Tarjetas: ${format(prevWeek.salesDebit + prevWeek.salesCredit + prevWeek.salesCard)} | Transferencias: ${format(prevWeek.salesTransfer)} | QR: ${format(prevWeek.salesQr)}
- Gastos/retiros: ${format(prevWeek.totalCashExpenses)} | Ingresos extra: ${format(prevWeek.totalExtraIncome)}

Indica variación en ventas y en cantidad de órdenes (porcentaje y monto). Menciona si hubo más o menos efectivo, tarjetas o transferencias. Sé conciso y directo. No incluyas títulos ni viñetas, solo párrafos de texto.`
      : `Eres un analista de cierre de caja. En una o dos frases en español, indica que no hay datos del mismo día de la semana anterior (${dayName}) para comparar. Este es el primer cierre de ese día de la semana con registro.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'Generas informes de cierre de caja en español, breves y profesionales.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    return content || null;
  }

  /**
   * Métricas del turno: mesas errores/tacho, demoras de comandas y facturación.
   * Solo para cierres (register con openedAt y closedAt).
   */
  async getShiftMetrics(registerId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: registerId },
      select: { id: true, locationId: true, openedAt: true, closedAt: true, status: true },
    });
    if (!register || !register.openedAt || !register.closedAt) {
      return null;
    }

    const from = register.openedAt;
    const to = register.closedAt;

    const orders = await this.prisma.order.findMany({
      where: {
        locationId: register.locationId,
        status: 'closed',
        closedAt: { gte: from, lte: to },
      },
      include: {
        table: { select: { id: true, name: true, tableType: true } },
        items: {
          select: {
            id: true,
            productId: true,
            skipComanda: true,
            createdAt: true,
            readyAt: true,
            quantity: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    const tableType = (o: { table?: { tableType: string } | null }) =>
      o.table?.tableType ?? 'normal';

    let errorsOrderCount = 0;
    let errorsItemCount = 0;
    let errorsTotal = 0;
    let trashOrderCount = 0;
    let trashItemCount = 0;
    let trashTotal = 0;
    let normalOrderCount = 0;
    let normalTotal = 0;
    const delayMinutesList: number[] = [];
    const delayDetails: {
      orderId: string;
      orderNumber: string;
      tableName: string | null;
      itemId: string;
      productId: string;
      productName: string;
      delayMinutes: number;
      expectedPrepMinutes: number | null;
      exceededExpected: boolean;
      createdAt: string;
      readyAt: string;
    }[] = [];

    for (const order of orders) {
      const type = tableType(order);
      const total = order.total ?? 0;
      const itemCount = order.items.length;

      if (type === 'errors') {
        errorsOrderCount += 1;
        errorsItemCount += itemCount;
        errorsTotal += total;
      } else if (type === 'trash') {
        trashOrderCount += 1;
        trashItemCount += itemCount;
        trashTotal += total;
      } else {
        normalOrderCount += 1;
        normalTotal += total;
      }

      for (const item of order.items) {
        if (item.skipComanda || !item.readyAt) continue;
        const ready = new Date(item.readyAt).getTime();
        const created = new Date(item.createdAt).getTime();
        const delayMin = Math.round((ready - created) / 60000);
        delayMinutesList.push(delayMin);
        delayDetails.push({
          orderId: order.id,
          orderNumber: String(order.orderNumber ?? ''),
          tableName: order.table?.name ?? null,
          itemId: item.id,
          productId: item.productId,
          productName: item.product?.name ?? 'Producto',
          delayMinutes: delayMin,
          expectedPrepMinutes: null,
          exceededExpected: false,
          createdAt: new Date(item.createdAt).toISOString(),
          readyAt: new Date(item.readyAt).toISOString(),
        });
      }
    }

    const prepByProduct = await getPrepMinutesByProductIdsForLocation(
      this.prisma,
      [...new Set(delayDetails.map((d) => d.productId))],
      register.locationId,
    );
    for (const d of delayDetails) {
      const exp = prepByProduct.get(d.productId) ?? null;
      d.expectedPrepMinutes = exp;
      d.exceededExpected = exp != null && exp > 0 && d.delayMinutes > exp;
    }

    const totalBilling = normalTotal + errorsTotal + trashTotal;
    const avgDelay =
      delayMinutesList.length > 0
        ? Math.round(
            (delayMinutesList.reduce((a, b) => a + b, 0) / delayMinutesList.length) * 10,
          ) / 10
        : null;
    const maxDelay =
      delayMinutesList.length > 0 ? Math.max(...delayMinutesList) : null;
    const countWithDelayOver15 = delayMinutesList.filter((d) => d > 15).length;
    const countExceededExpected = delayDetails.filter((d) => d.exceededExpected).length;

    return {
      shiftFrom: from.toISOString(),
      shiftTo: to.toISOString(),
      errorsTable: {
        orderCount: errorsOrderCount,
        itemCount: errorsItemCount,
        totalAmount: Math.round(errorsTotal * 100) / 100,
      },
      trashTable: {
        orderCount: trashOrderCount,
        itemCount: trashItemCount,
        totalAmount: Math.round(trashTotal * 100) / 100,
      },
      billing: {
        total: Math.round(totalBilling * 100) / 100,
        normal: Math.round(normalTotal * 100) / 100,
        errors: Math.round(errorsTotal * 100) / 100,
        trash: Math.round(trashTotal * 100) / 100,
        normalOrderCount,
      },
      comandaDelays: {
        avgMinutes: avgDelay,
        maxMinutes: maxDelay,
        itemCount: delayMinutesList.length,
        countOver15Minutes: countWithDelayOver15,
        countExceededExpected,
        details: delayDetails.sort((a, b) => b.delayMinutes - a.delayMinutes).slice(0, 100),
      },
    };
  }

  async getCurrentOpen(locationId: string) {
    const register = await this.prisma.cashRegister.findFirst({
      where: {
        locationId,
        status: 'open',
      },
      include: {
        location: { select: { id: true, name: true } },
        openedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!register || !register.openedAt) {
      return register;
    }

    // Totales en vivo: órdenes cerradas en este turno (excluir mesas errores de comandas y tacho de basura; excluir cuenta corriente del cierre de caja)
    const orders = await this.prisma.order.findMany({
      where: {
        locationId: register.locationId,
        status: 'closed',
        closedAt: { gte: register.openedAt },
        OR: [
          { tableId: null },
          { table: { tableType: { notIn: ['errors', 'trash'] } } },
        ],
      },
      select: { total: true, paymentMethod: true, paymentBreakdown: true, invoiceType: true },
    });

    let salesCash = 0;
    let salesDebit = 0;
    let salesCredit = 0;
    let salesCard = 0;
    let salesQr = 0;
    let salesTransfer = 0;
    let totalSales = 0;
    for (const order of orders) {
      const isCuentaCorriente = order.invoiceType === 'cuenta_corriente' || order.paymentMethod === 'cuenta_corriente';
      if (isCuentaCorriente) continue;
      totalSales += order.total;
      const items = paymentBreakdownToItems(order.paymentBreakdown);
      if (items.length > 0) {
        for (const p of items) {
          const method = normalizePaymentMethod(p.method);
          const amount = p.amount;
          switch (method) {
            case 'cash': salesCash += amount; break;
            case 'debit': salesDebit += amount; break;
            case 'credit': salesCredit += amount; break;
            case 'card': salesCard += amount; break;
            case 'qr': salesQr += amount; break;
            case 'transfer': salesTransfer += amount; break;
            default: salesCash += amount;
          }
        }
      } else {
        const method = normalizePaymentMethod(order.paymentMethod || 'cash');
        switch (method) {
          case 'cash': salesCash += order.total; break;
          case 'debit': salesDebit += order.total; break;
          case 'credit': salesCredit += order.total; break;
          case 'card': salesCard += order.total; break;
          case 'qr': salesQr += order.total; break;
          case 'transfer': salesTransfer += order.total; break;
          default: salesCash += order.total;
        }
      }
    }

    // Movimientos del turno (gastos, retiros, ingresos extra)
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashRegisterId: register.id },
      select: { type: true, amount: true },
    });
    let totalCashExpenses = 0;
    let totalWithdrawals = 0;
    let totalExtraIncome = 0;
    for (const m of movements) {
      if (m.type === 'expense' || m.type === 'out') totalCashExpenses += m.amount;
      else if (m.type === 'withdrawal') totalWithdrawals += m.amount;
      else if (m.type === 'extra_income' || m.type === 'in') totalExtraIncome += m.amount;
    }

    return {
      ...register,
      salesCash: Math.round(salesCash * 100) / 100,
      salesDebit: Math.round(salesDebit * 100) / 100,
      salesCredit: Math.round(salesCredit * 100) / 100,
      salesCard: Math.round(salesCard * 100) / 100,
      salesQr: Math.round(salesQr * 100) / 100,
      salesTransfer: Math.round(salesTransfer * 100) / 100,
      totalSales: Math.round(totalSales * 100) / 100,
      totalOrders: orders.length,
      totalCashExpenses: Math.round(totalCashExpenses * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      totalExtraIncome: Math.round(totalExtraIncome * 100) / 100,
    };
  }

  /** Reportes: diario, semanal, mensual */
  async getReport(
    locationId: string,
    type: 'daily' | 'weekly' | 'monthly',
    dateFrom: string,
    dateTo: string,
  ) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);

    const closures = await this.prisma.cashRegister.findMany({
      where: {
        locationId,
        status: 'closed',
        closedAt: { gte: from, lte: to },
      },
      include: {
        closedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { closedAt: 'asc' },
    });

    const totalSales = closures.reduce((s, c) => s + (c.totalSales ?? 0), 0);
    const totalExpected = closures.reduce((s, c) => s + (c.expectedAmount ?? 0), 0);
    const totalReal = closures.reduce((s, c) => s + (c.closingAmount ?? 0), 0);
    const totalDifference = closures.reduce((s, c) => s + (c.difference ?? 0), 0);
    const totalExpenses = closures.reduce((s, c) => s + (c.totalCashExpenses ?? 0) + (c.totalWithdrawals ?? 0), 0);
    const totalExtra = closures.reduce((s, c) => s + (c.totalExtraIncome ?? 0), 0);

    return {
      type,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      closures,
      summary: {
        totalClosures: closures.length,
        totalSales: Math.round(totalSales * 100) / 100,
        totalExpected: Math.round(totalExpected * 100) / 100,
        totalReal: Math.round(totalReal * 100) / 100,
        totalDifference: Math.round(totalDifference * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalExtraIncome: Math.round(totalExtra * 100) / 100,
        dailyResult: Math.round((totalSales - totalExpenses) * 100) / 100,
      },
    };
  }
}
