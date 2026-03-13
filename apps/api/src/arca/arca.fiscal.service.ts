import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArcaFiscalStatusResponse,
  ArcaInvoiceType,
  ArcaWsfeRequestPayload,
} from './arca.types';
import { formatArcaDate, normalizeDigits, roundAmount } from './arca.utils';
import { ArcaWsfev1Service } from './arca.wsfev1.service';

@Injectable()
export class ArcaFiscalService {
  private readonly pointOfSale: number;
  private readonly defaultInvoiceType: ArcaInvoiceType;
  private readonly defaultIvaId: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly wsfev1Service: ArcaWsfev1Service,
  ) {
    this.pointOfSale = parseInt(this.config.get<string>('ARCA_PTO_VTA', '0'), 10) || 0;
    this.defaultInvoiceType = this.parseInvoiceType(
      this.config.get<string>('ARCA_DEFAULT_INVOICE_TYPE', 'factura_b'),
    );
    this.defaultIvaId = parseInt(this.config.get<string>('ARCA_DEFAULT_IVA_ID', '5'), 10) || 5;
  }

  isEnabled(): boolean {
    return this.wsfev1Service.isEnabled() && this.pointOfSale > 0;
  }

  resolveInvoiceType(value?: string | null): ArcaInvoiceType {
    return this.parseInvoiceType(value);
  }

  async markOrderPending(
    orderId: string,
    requestedInvoiceType?: string | null,
    enabled = this.isEnabled(),
  ) {
    const invoiceType = this.resolveInvoiceType(requestedInvoiceType);
    return this.prisma.fiscalVoucher.upsert({
      where: { orderId },
      update: {
        status: enabled ? 'pending' : 'disabled',
        invoiceType,
        errorCode: null,
        errorMessage: null,
      },
      create: {
        orderId,
        status: enabled ? 'pending' : 'disabled',
        invoiceType,
      },
    });
  }

  async emitForOrder(orderId: string, force = false): Promise<ArcaFiscalStatusResponse> {
    const order = await this.loadOrder(orderId);
    this.ensureOrderCanBeFiscalized(order, force);

    if (!this.isEnabled()) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          fiscalStatus: 'disabled',
          fiscalLastError: 'ARCA est? deshabilitado o falta configuraci?n fiscal.',
        },
      });
      await this.markOrderPending(orderId, order.invoiceType, false);
      return this.getOrderFiscalStatus(orderId);
    }

    const invoiceType = this.resolveInvoiceType(order.invoiceType);
    this.validateCustomerForInvoice(order.customer, invoiceType);

    const ptoVta = this.getPtoVtaForOrder(order);
    const cbteTipo = this.mapVoucherType(invoiceType);
    const voucher = await this.prisma.fiscalVoucher.upsert({
      where: { orderId },
      update: {
        status: 'processing',
        invoiceType,
        cbteTipo,
        ptoVta,
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
      create: {
        orderId,
        status: 'processing',
        invoiceType,
        cbteTipo,
        ptoVta,
        attemptCount: 1,
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        fiscalStatus: 'processing',
        fiscalLastError: null,
        fiscalAttemptedAt: new Date(),
      },
    });

    try {
      const lastAuthorized = await this.wsfev1Service.getLastAuthorizedReceipt(
        ptoVta,
        cbteTipo,
      );
      const nextReceiptNumber = lastAuthorized + 1;
      const request = this.buildRequestPayload(
        order,
        invoiceType,
        cbteTipo,
        ptoVta,
        nextReceiptNumber,
      );

      const response = await this.wsfev1Service.requestCAE(request);
      const errorMessage = this.joinArcaMessages(response.errors, response.observations);
      if (!response.cae || !/^A/.test(response.result)) {
        throw new BadRequestException(
          errorMessage || 'ARCA rechaz? la emisi?n del comprobante.',
        );
      }

      await this.prisma.fiscalVoucher.update({
        where: { orderId },
        data: {
          status: 'issued',
          invoiceType,
          cbteTipo,
          ptoVta,
          cbteDesde: nextReceiptNumber,
          cbteHasta: nextReceiptNumber,
          cae: response.cae,
          caeVto: response.caeVto
            ? new Date(
                `${response.caeVto.slice(0, 4)}-${response.caeVto.slice(4, 6)}-${response.caeVto.slice(6, 8)}T00:00:00.000Z`,
              )
            : null,
          requestPayload: JSON.stringify(request),
          responsePayload: response.rawResponseXml,
          errorCode: null,
          errorMessage: null,
          issuedAt: new Date(),
        },
      });

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          fiscalStatus: 'issued',
          fiscalLastError: null,
          fiscalIssuedAt: new Date(),
        },
      });

      return this.getOrderFiscalStatus(orderId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido al emitir comprobante ARCA';

      await this.prisma.fiscalVoucher.update({
        where: { orderId },
        data: {
          status: 'error',
          requestPayload: voucher.requestPayload ?? undefined,
          errorMessage: message,
        },
      });

      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          fiscalStatus: 'error',
          fiscalLastError: message,
        },
      });

      throw error;
    }
  }

  async retryOrder(orderId: string): Promise<ArcaFiscalStatusResponse> {
    return this.emitForOrder(orderId, true);
  }

  /**
   * Verifica en AFIP que el comprobante de una orden emitida figure correctamente (FECompConsultar).
   * Solo aplica a ?rdenes con comprobante emitido (tienen ptoVta, cbteTipo, cbteDesde).
   */
  async verifyOrderWithAfip(orderId: string): Promise<{
    verified: boolean;
    message: string;
    afip?: {
      resultado?: string;
      codAutorizacion?: string;
      caeVto?: string;
      impTotal?: number;
    };
    storedCae?: string;
    caeMatch?: boolean;
    errors: Array<{ code: string; message: string }>;
  }> {
    if (!this.isEnabled()) {
      return {
        verified: false,
        message: 'ARCA no est? habilitado.',
        errors: [],
      };
    }

    const voucher = await this.prisma.fiscalVoucher.findUnique({
      where: { orderId },
      select: { ptoVta: true, cbteTipo: true, cbteDesde: true, cae: true },
    });

    if (!voucher?.ptoVta || voucher.cbteTipo == null || voucher.cbteDesde == null) {
      return {
        verified: false,
        message: 'Esta orden no tiene comprobante emitido para verificar.',
        errors: [],
      };
    }

    const ptoVta = typeof voucher.ptoVta === 'number' ? voucher.ptoVta : parseInt(String(voucher.ptoVta), 10);
    const cbteTipo = typeof voucher.cbteTipo === 'number' ? voucher.cbteTipo : parseInt(String(voucher.cbteTipo), 10);
    const cbteNro = typeof voucher.cbteDesde === 'number' ? voucher.cbteDesde : parseInt(String(voucher.cbteDesde), 10);

    try {
      const consult = await this.wsfev1Service.consultReceiptParsed(ptoVta, cbteTipo, cbteNro);
      const storedCae = voucher.cae ?? undefined;
      const caeMatch = storedCae && consult.codAutorizacion ? consult.codAutorizacion === storedCae : undefined;

      return {
        verified: consult.verified,
        message: consult.verified
          ? (caeMatch === false ? 'Comprobante existe en AFIP pero el CAE no coincide con el guardado.' : 'Comprobante verificado en AFIP correctamente.')
          : consult.errors.length > 0
            ? consult.errors.map((e) => e.message).join(' ')
            : `AFIP devolvi? resultado: ${consult.resultado ?? 'sin datos'}`,
        afip: consult.codAutorizacion
          ? {
              resultado: consult.resultado,
              codAutorizacion: consult.codAutorizacion,
              caeVto: consult.caeVto,
              impTotal: consult.impTotal,
            }
          : undefined,
        storedCae,
        caeMatch,
        errors: consult.errors,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al consultar AFIP';
      return {
        verified: false,
        message,
        errors: [{ code: '', message }],
      };
    }
  }

  async getOrderFiscalStatus(orderId: string): Promise<ArcaFiscalStatusResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        fiscalStatus: true,
        fiscalLastError: true,
        fiscalVoucher: {
          select: {
            status: true,
            invoiceType: true,
            cae: true,
            caeVto: true,
            cbteTipo: true,
            ptoVta: true,
            cbteDesde: true,
            cbteHasta: true,
            attemptCount: true,
            errorCode: true,
            errorMessage: true,
            issuedAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      fiscalStatus: order.fiscalStatus,
      fiscalLastError: order.fiscalLastError,
      voucher: order.fiscalVoucher
        ? {
            ...order.fiscalVoucher,
            caeVto: order.fiscalVoucher.caeVto?.toISOString() ?? null,
            issuedAt: order.fiscalVoucher.issuedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
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
        customer: true,
        location: {
          select: { id: true, name: true, type: true, arcaPtoVta: true },
        },
        table: {
          select: { id: true, name: true, tableType: true },
        },
        fiscalVoucher: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    return order;
  }

  /** Punto de venta a usar para esta orden: el del local si est? definido, sino el global (ARCA_PTO_VTA). */
  private getPtoVtaForOrder(order: { location?: { arcaPtoVta?: number | null } | null }): number {
    const pv = order.location?.arcaPtoVta;
    if (pv != null && Number.isFinite(pv) && pv > 0) {
      return pv;
    }
    return this.pointOfSale;
  }

  private ensureOrderCanBeFiscalized(order: any, force: boolean) {
    if (order.status !== 'closed') {
      throw new BadRequestException('Solo se pueden fiscalizar ?rdenes cerradas.');
    }

    if (order.table?.tableType === 'errors' || order.table?.tableType === 'trash') {
      throw new BadRequestException(
        'Las mesas especiales de errores o basura no generan comprobante fiscal.',
      );
    }

    if (order.fiscalStatus === 'issued' && !force) {
      throw new BadRequestException('La orden ya tiene un comprobante fiscal emitido.');
    }
  }

  private validateCustomerForInvoice(customer: any, invoiceType: ArcaInvoiceType) {
    if (invoiceType !== 'factura_a') {
      return;
    }

    if (!customer) {
      throw new BadRequestException(
        'Factura A requiere seleccionar un cliente con datos fiscales.',
      );
    }

    if (!normalizeDigits(customer.cuit)) {
      throw new BadRequestException('Factura A requiere un cliente con CUIT.');
    }

    const normalizedTaxCondition = String(customer.taxCondition || '')
      .trim()
      .toLowerCase();
    if (
      normalizedTaxCondition &&
      !normalizedTaxCondition.includes('responsable') &&
      !normalizedTaxCondition.includes('inscripto')
    ) {
      throw new BadRequestException(
        'Factura A requiere un cliente con condici?n IVA Responsable Inscripto.',
      );
    }
  }

  private parseInvoiceType(value?: string | null): ArcaInvoiceType {
    if (value === 'factura_a' || value === 'factura_b' || value === 'factura_c') {
      return value;
    }
    return value === 'consumidor' ? this.defaultInvoiceType : this.defaultInvoiceType;
  }

  private mapVoucherType(invoiceType: ArcaInvoiceType): number {
    if (invoiceType === 'factura_a') return 1;
    if (invoiceType === 'factura_b') return 6;
    return 11;
  }

  private mapDocument(order: any, invoiceType: ArcaInvoiceType) {
    const customer = order.customer;

    if (invoiceType === 'factura_a') {
      return {
        docTipo: 80,
        docNro: parseInt(normalizeDigits(customer?.cuit), 10),
      };
    }

    if (customer?.documentType && customer?.documentNumber) {
      const normalizedDocumentType = String(customer.documentType).trim().toUpperCase();
      const docTipo = normalizedDocumentType === 'DNI' ? 96 : 80;
      return {
        docTipo,
        docNro: parseInt(normalizeDigits(customer.documentNumber), 10),
      };
    }

    if (customer?.cuit) {
      return {
        docTipo: 80,
        docNro: parseInt(normalizeDigits(customer.cuit), 10),
      };
    }

    return {
      docTipo: 99,
      docNro: 0,
    };
  }

  private buildRequestPayload(
    order: any,
    invoiceType: ArcaInvoiceType,
    cbteTipo: number,
    ptoVta: number,
    nextReceiptNumber: number,
  ): ArcaWsfeRequestPayload {
    const total = roundAmount(order.total ?? 0);
    const document = this.mapDocument(order, invoiceType);
    let condicionIvaReceptorId = this.mapRecipientVatCondition(order.customer, invoiceType);
    if (!condicionIvaReceptorId || Number.isNaN(condicionIvaReceptorId)) {
      condicionIvaReceptorId = 5;
    }
    const cbteFch = formatArcaDate(order.closedAt ? new Date(order.closedAt) : new Date());
    const isFacturaC = invoiceType === 'factura_c';
    const { impNeto, impIva } = this.calculateInvoiceAmounts(order, total, isFacturaC);

    return {
      cbteTipo,
      ptoVta,
      cbteDesde: nextReceiptNumber,
      cbteHasta: nextReceiptNumber,
      concepto: 1,
      docTipo: document.docTipo,
      docNro: document.docNro,
      condicionIvaReceptorId,
      cbteFch,
      impTotal: total,
      impTotConc: 0,
      impNeto,
      impOpEx: 0,
      impTrib: 0,
      impIVA: impIva,
      monId: 'PES',
      monCotiz: 1,
      ivaItems:
        impIva > 0
          ? [
              {
                id: this.defaultIvaId,
                baseImp: impNeto,
                importe: impIva,
              },
            ]
          : undefined,
    };
  }

  private calculateInvoiceAmounts(
    order: any,
    total: number,
    isFacturaC: boolean,
  ): { impNeto: number; impIva: number } {
    if (isFacturaC) {
      return {
        impNeto: total,
        impIva: 0,
      };
    }

    const explicitTaxAmount = roundAmount(order.taxAmount ?? 0);
    if (explicitTaxAmount > 0) {
      const impIva = explicitTaxAmount;
      return {
        impNeto: roundAmount(total - impIva),
        impIva,
      };
    }

    const ivaRate = this.mapIvaRate(this.defaultIvaId);
    if (ivaRate <= 0) {
      return {
        impNeto: total,
        impIva: 0,
      };
    }

    const impNeto = roundAmount(total / (1 + ivaRate));
    const impIva = roundAmount(total - impNeto);
    return { impNeto, impIva };
  }

  private mapIvaRate(ivaId: number): number {
    if (ivaId === 3) return 0;
    if (ivaId === 4) return 0.105;
    if (ivaId === 5) return 0.21;
    if (ivaId === 6) return 0.27;
    if (ivaId === 8) return 0.05;
    if (ivaId === 9) return 0.025;
    return 0.21;
  }

  /**
   * Mapea la condici?n frente al IVA del receptor (RG 5616 ÿÿÿ obligatorio desde 09/06/2025).
   * Los c?digos deben coincidir con FEParamGetCondicionIvaReceptor (GET /api/arca/wsfev1/params).
   */
  private mapRecipientVatCondition(customer: any, invoiceType: ArcaInvoiceType): number {
    if (invoiceType === 'factura_a') {
      return 1;
    }

    const normalizedTaxCondition = String(customer?.taxCondition || '')
      .trim()
      .toLowerCase();

    if (!normalizedTaxCondition) {
      return 5;
    }

    if (
      normalizedTaxCondition.includes('responsable') &&
      normalizedTaxCondition.includes('inscripto')
    ) {
      return 1;
    }

    if (normalizedTaxCondition.includes('monotributo')) {
      if (normalizedTaxCondition.includes('social')) {
        return 13;
      }
      if (normalizedTaxCondition.includes('independiente') || normalizedTaxCondition.includes('promovido')) {
        return 16;
      }
      return 6;
    }

    if (normalizedTaxCondition.includes('exento')) {
      return 4;
    }

    if (normalizedTaxCondition.includes('no categorizado')) {
      return 7;
    }

    if (normalizedTaxCondition.includes('proveedor del exterior')) {
      return 8;
    }

    if (normalizedTaxCondition.includes('cliente del exterior')) {
      return 9;
    }

    if (normalizedTaxCondition.includes('liberado')) {
      return 10;
    }

    if (normalizedTaxCondition.includes('no alcanzado')) {
      return 15;
    }

    if (normalizedTaxCondition.includes('consumidor final')) {
      return 5;
    }

    return 5;
  }

  private joinArcaMessages(
    errors: Array<{ code: string; message: string }>,
    observations: Array<{ code: string; message: string }>,
  ): string {
    const messages = [...errors, ...observations]
      .map((entry) => [entry.code, entry.message].filter(Boolean).join(': '))
      .filter(Boolean);
    return messages.join(' | ');
  }
}
