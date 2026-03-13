import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArcaParamItem,
  ArcaWsaaCredentials,
  ArcaWsfeAuthPayload,
  ArcaWsfeCaEData,
  ArcaWsfeRequestPayload,
} from './arca.types';
import {
  decodeXmlEntities,
  extractXmlBlocks,
  extractXmlTag,
  formatArcaDate,
  roundAmount,
  xmlEscape,
} from './arca.utils';
import { ArcaWsaaService } from './arca.wsaa.service';

const DEFAULT_WSFEV1_URLS = {
  testing: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  production: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

@Injectable()
export class ArcaWsfev1Service {
  private readonly wsfev1Url: string;

  constructor(
    private readonly config: ConfigService,
    private readonly wsaaService: ArcaWsaaService,
  ) {
    this.wsfev1Url = this.config.get<string>(
      'ARCA_WSFEV1_URL',
      DEFAULT_WSFEV1_URLS[this.wsaaService.getEnvironment()],
    );
  }

  getWsfev1Url(): string {
    return this.wsfev1Url;
  }

  isEnabled(): boolean {
    return this.wsaaService.isEnabled() && !!this.wsfev1Url;
  }

  async getLastAuthorizedReceipt(ptoVta: number, cbteTipo: number): Promise<number> {
    const credentials = await this.wsaaService.getLoginTicket();
    const xml = await this.callOperation(
      'FECompUltimoAutorizado',
      `
      <Auth>${this.buildAuthXml(credentials)}</Auth>
      <PtoVta>${ptoVta}</PtoVta>
      <CbteTipo>${cbteTipo}</CbteTipo>
      `,
    );

    return parseInt(extractXmlTag(xml, 'CbteNro') || '0', 10) || 0;
  }

  async getParameterSnapshot(): Promise<{
    pointOfSales: ArcaParamItem[];
    voucherTypes: ArcaParamItem[];
    documentTypes: ArcaParamItem[];
    condicionIvaReceptor: ArcaParamItem[];
  }> {
    const credentials = await this.wsaaService.getLoginTicket();
    const [pointOfSalesXml, voucherTypesXml, documentTypesXml, condicionIvaXml] = await Promise.all([
      this.callOperationWithExistingAuth(credentials, 'FEParamGetPtosVenta', ''),
      this.callOperationWithExistingAuth(credentials, 'FEParamGetTiposCbte', ''),
      this.callOperationWithExistingAuth(credentials, 'FEParamGetTiposDoc', ''),
      this.callOperationWithExistingAuth(credentials, 'FEParamGetCondicionIvaReceptor', '').catch(() => ''),
    ]);

    const condicionIvaReceptor =
      condicionIvaXml && condicionIvaXml.length > 0
        ? this.parseParamItems(condicionIvaXml, 'CondicionIvaReceptor', 'Id', 'Desc')
        : [];

    return {
      pointOfSales: this.parseParamItems(pointOfSalesXml, 'PtoVenta', 'Nro', 'EmisionTipo'),
      voucherTypes: this.parseParamItems(voucherTypesXml, 'CbteTipo', 'Id', 'Desc'),
      documentTypes: this.parseParamItems(documentTypesXml, 'DocTipo', 'Id', 'Desc'),
      condicionIvaReceptor,
    };
  }

  async requestCAE(payload: ArcaWsfeRequestPayload): Promise<ArcaWsfeCaEData> {
    const credentials = await this.wsaaService.getLoginTicket();
    const ivaXml =
      payload.ivaItems && payload.ivaItems.length > 0
        ? `<Iva>${payload.ivaItems
            .map(
              (item) => `
            <AlicIva>
              <Id>${item.id}</Id>
              <BaseImp>${roundAmount(item.baseImp).toFixed(2)}</BaseImp>
              <Importe>${roundAmount(item.importe).toFixed(2)}</Importe>
            </AlicIva>`,
            )
            .join('')}
          </Iva>`
        : '';

    const xml = await this.callOperation(
      'FECAESolicitar',
      `
      <Auth>${this.buildAuthXml(credentials)}</Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${payload.ptoVta}</PtoVta>
          <CbteTipo>${payload.cbteTipo}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>${payload.concepto}</Concepto>
            <DocTipo>${payload.docTipo}</DocTipo>
            <DocNro>${payload.docNro}</DocNro>
            <CondicionIVAReceptorId>${payload.condicionIvaReceptorId}</CondicionIVAReceptorId>
            <CbteDesde>${payload.cbteDesde}</CbteDesde>
            <CbteHasta>${payload.cbteHasta}</CbteHasta>
            <CbteFch>${xmlEscape(payload.cbteFch)}</CbteFch>
            <ImpTotal>${payload.impTotal.toFixed(2)}</ImpTotal>
            <ImpTotConc>${payload.impTotConc.toFixed(2)}</ImpTotConc>
            <ImpNeto>${payload.impNeto.toFixed(2)}</ImpNeto>
            <ImpOpEx>${payload.impOpEx.toFixed(2)}</ImpOpEx>
            <ImpTrib>${payload.impTrib.toFixed(2)}</ImpTrib>
            <ImpIVA>${payload.impIVA.toFixed(2)}</ImpIVA>
            <MonId>${xmlEscape(payload.monId)}</MonId>
            <MonCotiz>${payload.monCotiz.toFixed(2)}</MonCotiz>
            ${ivaXml}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
      `,
    );

    const cae = extractXmlTag(xml, 'CAE') || '';
    const caeVto = extractXmlTag(xml, 'CAEFchVto');
    const result = extractXmlTag(xml, 'Resultado') || '';
    const errors = this.parseErrors(xml, 'Err');
    const observations = this.parseErrors(xml, 'Obs');

    return {
      cae,
      caeVto,
      result,
      rawResponseXml: xml,
      errors,
      observations,
    };
  }

  async consultReceipt(
    ptoVta: number,
    cbteTipo: number,
    cbteNro: number,
  ): Promise<string> {
    return this.callOperationWithAuth(
      'FECompConsultar',
      `
      <FeCompConsReq>
        <CbteTipo>${cbteTipo}</CbteTipo>
        <CbteNro>${cbteNro}</CbteNro>
        <PtoVta>${ptoVta}</PtoVta>
      </FeCompConsReq>
      `,
    );
  }

  /**
   * Consulta un comprobante en AFIP (FECompConsultar) y devuelve el resultado parseado.
   * Sirve para verificar que una factura emitida figure correctamente en AFIP.
   */
  async consultReceiptParsed(
    ptoVta: number,
    cbteTipo: number,
    cbteNro: number,
  ): Promise<{
    verified: boolean;
    resultado?: string;
    codAutorizacion?: string;
    caeVto?: string;
    ptoVta?: number;
    cbteTipo?: number;
    cbteNro?: number;
    impTotal?: number;
    errors: Array<{ code: string; message: string }>;
  }> {
    const xml = await this.consultReceipt(ptoVta, cbteTipo, cbteNro);
    const errors = this.parseErrors(xml, 'Err');
    const resultGet = extractXmlBlocks(xml, 'ResultGet')[0] || '';
    const resultado = extractXmlTag(resultGet || xml, 'Resultado') || '';
    const codAutorizacion = extractXmlTag(resultGet || xml, 'CodAutorizacion') || undefined;
    const fchVto = extractXmlTag(resultGet || xml, 'FchVto') || undefined;
    const ptoVtaRes = extractXmlTag(resultGet || xml, 'PtoVta');
    const cbteTipoRes = extractXmlTag(resultGet || xml, 'CbteTipo');
    const cbteNroRes = extractXmlTag(resultGet || xml, 'CbteNro');
    const impTotalStr = extractXmlTag(resultGet || xml, 'ImpTotal');
    const verified = resultado === 'A' && !!codAutorizacion && errors.length === 0;
    return {
      verified,
      resultado: resultado || undefined,
      codAutorizacion,
      caeVto: fchVto,
      ptoVta: ptoVtaRes != null ? parseInt(ptoVtaRes, 10) : undefined,
      cbteTipo: cbteTipoRes != null ? parseInt(cbteTipoRes, 10) : undefined,
      cbteNro: cbteNroRes != null ? parseInt(cbteNroRes, 10) : undefined,
      impTotal: impTotalStr != null ? parseFloat(impTotalStr) : undefined,
      errors,
    };
  }

  private async callOperationWithAuth(operation: string, innerBody: string): Promise<string> {
    const credentials = await this.wsaaService.getLoginTicket();
    return this.callOperationWithExistingAuth(credentials, operation, innerBody);
  }

  private async callOperationWithExistingAuth(
    credentials: ArcaWsaaCredentials,
    operation: string,
    innerBody: string,
  ): Promise<string> {
    return this.callOperation(
      operation,
      `
      <Auth>${this.buildAuthXml(credentials)}</Auth>
      ${innerBody}
      `,
    );
  }

  private async callOperation(operation: string, body: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('ARCA wsfev1 no está habilitado.');
    }

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <${operation} xmlns="http://ar.gov.afip.dif.FEV1/">
      ${body}
    </${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(this.wsfev1Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"http://ar.gov.afip.dif.FEV1/${operation}"`,
      },
      body: envelope,
    });

    const rawXml = await response.text();
    if (!response.ok) {
      throw new Error(`wsfev1 respondió ${response.status}: ${rawXml.slice(0, 500)}`);
    }

    return decodeXmlEntities(rawXml);
  }

  private buildAuthXml(credentials: ArcaWsaaCredentials | ArcaWsfeAuthPayload): string {
    return `
      <Token>${xmlEscape(credentials.token)}</Token>
      <Sign>${xmlEscape(credentials.sign)}</Sign>
      <Cuit>${this.wsaaService.getCuit()}</Cuit>
    `;
  }

  private parseParamItems(
    xml: string,
    blockTag: string,
    idTag: string,
    descriptionTag: string,
  ): ArcaParamItem[] {
    return extractXmlBlocks(xml, blockTag).map((block) => ({
      id: extractXmlTag(block, idTag) || '',
      description: extractXmlTag(block, descriptionTag) || '',
    }));
  }

  private parseErrors(xml: string, blockTag: string): Array<{ code: string; message: string }> {
    return extractXmlBlocks(xml, blockTag).map((block) => ({
      code: extractXmlTag(block, 'Code') || '',
      message: extractXmlTag(block, 'Msg') || '',
    }));
  }
}
