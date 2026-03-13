export type ArcaEnvironment = 'testing' | 'production';

export type ArcaInvoiceType =
  | 'consumidor'
  | 'factura_a'
  | 'factura_b'
  | 'factura_c';

export interface ArcaWsaaCredentials {
  token: string;
  sign: string;
  generationTime: Date;
  expirationTime: Date;
  service: string;
}

export interface ArcaHealthStatus {
  ok: boolean;
  environment: ArcaEnvironment;
  service: string;
  wsaaUrl: string;
  wsfev1Url: string;
  authCachedUntil?: string;
  message?: string;
}

export interface ArcaParamItem {
  id: string;
  description: string;
}

export interface ArcaWsfev1ParamSnapshot {
  pointOfSales: ArcaParamItem[];
  voucherTypes: ArcaParamItem[];
  documentTypes: ArcaParamItem[];
  /** Condiciones frente al IVA del receptor (RG 5616 – obligatorio desde 09/06/2025). Consultar FEParamGetCondicionIvaReceptor. */
  condicionIvaReceptor?: ArcaParamItem[];
}

export interface ArcaFiscalStatusResponse {
  orderId: string;
  orderNumber: string;
  fiscalStatus: string;
  fiscalLastError?: string | null;
  voucher?: {
    status: string;
    invoiceType: string;
    cae?: string | null;
    caeVto?: string | null;
    cbteTipo?: number | null;
    ptoVta?: number | null;
    cbteDesde?: number | null;
    cbteHasta?: number | null;
    attemptCount: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    issuedAt?: string | null;
  } | null;
}

export interface ArcaWsfeAuthPayload {
  token: string;
  sign: string;
  cuit: number;
}

export interface ArcaWsfeRequestPayload {
  cbteTipo: number;
  ptoVta: number;
  cbteDesde: number;
  cbteHasta: number;
  concepto: number;
  docTipo: number;
  docNro: number;
  condicionIvaReceptorId: number;
  cbteFch: string;
  impTotal: number;
  impTotConc: number;
  impNeto: number;
  impOpEx: number;
  impTrib: number;
  impIVA: number;
  monId: string;
  monCotiz: number;
  ivaItems?: Array<{ id: number; baseImp: number; importe: number }>;
}

export interface ArcaWsfeCaEData {
  cae: string;
  caeVto?: string;
  result: string;
  rawResponseXml: string;
  observations: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
}
