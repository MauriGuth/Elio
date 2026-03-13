import { Injectable } from '@nestjs/common';
import { ArcaFiscalService } from './arca.fiscal.service';
import { ArcaWsaaService } from './arca.wsaa.service';
import { ArcaWsfev1Service } from './arca.wsfev1.service';

@Injectable()
export class ArcaService {
  constructor(
    private readonly wsaaService: ArcaWsaaService,
    private readonly wsfev1Service: ArcaWsfev1Service,
    private readonly fiscalService: ArcaFiscalService,
  ) {}

  async health() {
    const loginStatus = await this.wsaaService.testLogin();
    return {
      ...loginStatus,
      wsfev1Url: this.wsfev1Service.getWsfev1Url(),
      pointOfSaleConfigured: this.fiscalService.isEnabled(),
    };
  }

  async testLogin() {
    return this.wsaaService.testLogin();
  }

  async getWsfev1Params() {
    return this.wsfev1Service.getParameterSnapshot();
  }

  async emitOrder(orderId: string) {
    return this.fiscalService.emitForOrder(orderId, true);
  }

  async retryOrder(orderId: string) {
    return this.fiscalService.retryOrder(orderId);
  }

  async getOrderStatus(orderId: string) {
    return this.fiscalService.getOrderFiscalStatus(orderId);
  }

  /** Verifica en AFIP que el comprobante de la orden figure correctamente (FECompConsultar). */
  async verifyOrder(orderId: string) {
    return this.fiscalService.verifyOrderWithAfip(orderId);
  }

  isEnabled() {
    return this.fiscalService.isEnabled();
  }
}
