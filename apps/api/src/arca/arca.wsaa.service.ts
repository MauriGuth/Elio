import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { ArcaEnvironment, ArcaHealthStatus, ArcaWsaaCredentials } from './arca.types';
import { decodeXmlEntities, extractXmlTag, xmlEscape } from './arca.utils';

const DEFAULT_WSAA_URLS: Record<ArcaEnvironment, string> = {
  testing: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  production: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

@Injectable()
export class ArcaWsaaService {
  private readonly logger = new Logger(ArcaWsaaService.name);
  private readonly environment: ArcaEnvironment;
  private readonly service: string;
  private readonly cuit: string;
  private readonly certPath: string;
  private readonly keyPath: string;
  private readonly enabled: boolean;
  private readonly wsaaUrl: string;
  private readonly cacheFilePath: string;
  private cachedCredentials: ArcaWsaaCredentials | null = null;
  private pendingLoginPromise: Promise<ArcaWsaaCredentials> | null = null;

  constructor(private readonly config: ConfigService) {
    this.environment =
      this.config.get<string>('ARCA_ENV', 'testing') === 'production'
        ? 'production'
        : 'testing';
    this.service = this.config.get<string>('ARCA_SERVICE', 'wsfe');
    this.cuit = this.config.get<string>('ARCA_CUIT', '').trim();
    const certPathEnv = this.config.get<string>('ARCA_CERT_PATH', '').trim();
    const keyPathEnv = this.config.get<string>('ARCA_KEY_PATH', '').trim();
    const certBase64 = this.config.get<string>('ARCA_CERT_BASE64', '').trim().replace(/\s/g, '');
    const keyBase64 = this.config.get<string>('ARCA_KEY_BASE64', '').trim().replace(/\s/g, '');

    if (certPathEnv && keyPathEnv) {
      this.certPath = certPathEnv;
      this.keyPath = keyPathEnv;
    } else if (certBase64 && keyBase64) {
      const { certPath, keyPath } = this.writeTempCertAndKey(certBase64, keyBase64);
      this.certPath = certPath;
      this.keyPath = keyPath;
    } else {
      this.certPath = '';
      this.keyPath = '';
    }
    this.enabled = this.config.get<string>('ARCA_ENABLED', 'false') === 'true';
    this.wsaaUrl = this.config.get<string>(
      'ARCA_WSAA_URL',
      DEFAULT_WSAA_URLS[this.environment],
    );
    this.cacheFilePath = path.join(
      os.tmpdir(),
      `elio-arca-wsaa-${createHash('sha1')
        .update(`${this.environment}:${this.service}:${this.cuit}:${this.certPath}`)
        .digest('hex')}.json`,
    );
  }

  /**
   * Escribe certificado y clave desde base64 en archivos temporales (para Railway/env sin volumen).
   * Usado cuando ARCA_CERT_BASE64 y ARCA_KEY_BASE64 están definidos y no hay ARCA_CERT_PATH/ARCA_KEY_PATH.
   */
  private writeTempCertAndKey(certBase64: string, keyBase64: string): { certPath: string; keyPath: string } {
    const dir = path.join(os.tmpdir(), 'elio-arca-certs');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const certPath = path.join(dir, 'cert.pem');
    const keyPath = path.join(dir, 'key.pem');
    try {
      const certBuf = Buffer.from(certBase64, 'base64');
      const keyBuf = Buffer.from(keyBase64, 'base64');
      fs.writeFileSync(certPath, certBuf, { mode: 0o644 });
      fs.writeFileSync(keyPath, keyBuf, { mode: 0o600 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error escribiendo cert/key';
      this.logger.warn(`ARCA: no se pudieron escribir cert/key en temp: ${msg}`);
      return { certPath: '', keyPath: '' };
    }
    return { certPath, keyPath };
  }

  isEnabled(): boolean {
    return (
      this.enabled &&
      !!this.cuit &&
      !!this.certPath &&
      !!this.keyPath &&
      !!this.wsaaUrl &&
      !!this.service
    );
  }

  getEnvironment(): ArcaEnvironment {
    return this.environment;
  }

  getServiceName(): string {
    return this.service;
  }

  getWsaaUrl(): string {
    return this.wsaaUrl;
  }

  getCuit(): number {
    return parseInt(this.cuit.replace(/\D/g, ''), 10);
  }

  async getLoginTicket(): Promise<ArcaWsaaCredentials> {
    if (!this.isEnabled()) {
      throw new Error(
        'ARCA no está habilitado. Definí ARCA_ENABLED=true, ARCA_CUIT y (ARCA_CERT_PATH+ARCA_KEY_PATH o ARCA_CERT_BASE64+ARCA_KEY_BASE64).',
      );
    }

    if (
      this.cachedCredentials &&
      this.cachedCredentials.expirationTime.getTime() - Date.now() > 2 * 60 * 1000
    ) {
      return this.cachedCredentials;
    }

    const diskCachedCredentials = this.readCachedCredentialsFromDisk();
    if (
      diskCachedCredentials &&
      diskCachedCredentials.expirationTime.getTime() - Date.now() > 2 * 60 * 1000
    ) {
      this.cachedCredentials = diskCachedCredentials;
      return diskCachedCredentials;
    }

    if (this.pendingLoginPromise) {
      return this.pendingLoginPromise;
    }

    this.pendingLoginPromise = (async () => {
      const traXml = this.buildTraXml();
      const cmsBase64 = this.signTraXml(traXml);
      const credentials = await this.requestLoginTicket(cmsBase64).catch((error) => {
        const cachedAfterError = this.readCachedCredentialsFromDisk();
        if (
          cachedAfterError &&
          cachedAfterError.expirationTime.getTime() - Date.now() > 2 * 60 * 1000 &&
          error instanceof Error &&
          error.message.includes('alreadyAuthenticated')
        ) {
          this.logger.warn(
            'WSAA indicó alreadyAuthenticated; reutilizando TA persistido en disco.',
          );
          return cachedAfterError;
        }
        throw error;
      });
      this.cachedCredentials = credentials;
      this.writeCachedCredentialsToDisk(credentials);
      return credentials;
    })();

    try {
      return await this.pendingLoginPromise;
    } finally {
      this.pendingLoginPromise = null;
    }
  }

  async testLogin(): Promise<ArcaHealthStatus> {
    try {
      const login = await this.getLoginTicket();
      return {
        ok: true,
        environment: this.environment,
        service: this.service,
        wsaaUrl: this.wsaaUrl,
        wsfev1Url: '',
        authCachedUntil: login.expirationTime.toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        environment: this.environment,
        service: this.service,
        wsaaUrl: this.wsaaUrl,
        wsfev1Url: '',
        message: error instanceof Error ? error.message : 'Error desconocido al autenticar WSAA',
      };
    }
  }

  private buildTraXml(): string {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 60 * 1000).toISOString();
    const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const uniqueId = Math.floor(now.getTime() / 1000);

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${xmlEscape(this.service)}</service>
</loginTicketRequest>`;
  }

  private signTraXml(traXml: string): string {
    this.ensureReadableFile(this.certPath, 'certificado ARCA');
    this.ensureReadableFile(this.keyPath, 'clave privada ARCA');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arca-wsaa-'));
    const traPath = path.join(tmpDir, 'tra.xml');
    const cmsPath = path.join(tmpDir, 'tra.cms');

    try {
      fs.writeFileSync(traPath, traXml, 'utf8');
      execFileSync(
        'openssl',
        [
          'smime',
          '-sign',
          '-signer',
          this.certPath,
          '-inkey',
          this.keyPath,
          '-in',
          traPath,
          '-out',
          cmsPath,
          '-outform',
          'DER',
          '-nodetach',
          '-binary',
        ],
        { stdio: 'pipe' },
      );
      const cmsBuffer = fs.readFileSync(cmsPath);
      return cmsBuffer.toString('base64');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo firmar el TRA';
      this.logger.error(`Error firmando TRA con openssl: ${message}`);
      throw new Error(
        'No se pudo firmar la solicitud TRA para WSAA. Verificá openssl, ARCA_CERT_PATH y ARCA_KEY_PATH.',
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private async requestLoginTicket(cmsBase64: string): Promise<ArcaWsaaCredentials> {
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(this.wsaaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'loginCms',
      },
      body: envelope,
    });

    const rawXml = await response.text();
    if (!response.ok) {
      throw new Error(this.buildSoapFaultMessage(response.status, rawXml));
    }

    const loginCmsReturn = extractXmlTag(rawXml, 'loginCmsReturn');
    if (!loginCmsReturn) {
      throw new Error(
        `WSAA no devolvió loginCmsReturn. Respuesta: ${this.compactXml(rawXml).slice(0, 800)}`,
      );
    }

    const ticketXml = decodeXmlEntities(loginCmsReturn);
    const token = extractXmlTag(ticketXml, 'token');
    const sign = extractXmlTag(ticketXml, 'sign');
    const generationTime = extractXmlTag(ticketXml, 'generationTime');
    const expirationTime = extractXmlTag(ticketXml, 'expirationTime');

    if (!token || !sign || !generationTime || !expirationTime) {
      throw new Error(`TA inválido devuelto por WSAA: ${ticketXml.slice(0, 300)}`);
    }

    return {
      token,
      sign,
      generationTime: new Date(generationTime),
      expirationTime: new Date(expirationTime),
      service: this.service,
    };
  }

  private ensureReadableFile(filePath: string, label: string) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`No se encontró el ${label} en ${filePath || '(vacío)'}`);
    }
  }

  private readCachedCredentialsFromDisk(): ArcaWsaaCredentials | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null;
      }

      const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
      if (!raw.trim()) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        token?: string;
        sign?: string;
        generationTime?: string;
        expirationTime?: string;
        service?: string;
      };

      if (
        !parsed.token ||
        !parsed.sign ||
        !parsed.generationTime ||
        !parsed.expirationTime ||
        parsed.service !== this.service
      ) {
        return null;
      }

      return {
        token: parsed.token,
        sign: parsed.sign,
        generationTime: new Date(parsed.generationTime),
        expirationTime: new Date(parsed.expirationTime),
        service: parsed.service,
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el cache local de WSAA: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return null;
    }
  }

  private writeCachedCredentialsToDisk(credentials: ArcaWsaaCredentials): void {
    try {
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify({
          token: credentials.token,
          sign: credentials.sign,
          generationTime: credentials.generationTime.toISOString(),
          expirationTime: credentials.expirationTime.toISOString(),
          service: credentials.service,
        }),
        'utf8',
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo persistir el cache local de WSAA: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  private buildSoapFaultMessage(statusCode: number, rawXml: string): string {
    const decodedXml = decodeXmlEntities(rawXml);
    const faultCode =
      extractXmlTag(decodedXml, 'faultcode') ||
      extractXmlTag(decodedXml, 'soapenv:faultcode') ||
      extractXmlTag(decodedXml, 'soap:FaultCode');
    const faultString =
      extractXmlTag(decodedXml, 'faultstring') ||
      extractXmlTag(decodedXml, 'soapenv:faultstring') ||
      extractXmlTag(decodedXml, 'soap:FaultString');
    const detail =
      extractXmlTag(decodedXml, 'detail') ||
      extractXmlTag(decodedXml, 'soapenv:detail') ||
      extractXmlTag(decodedXml, 'soap:Detail');

    const parts = [
      `WSAA respondió ${statusCode}.`,
      faultCode ? `faultcode: ${faultCode}` : null,
      faultString ? `faultstring: ${faultString}` : null,
      detail ? `detail: ${this.compactXml(detail).slice(0, 800)}` : null,
    ].filter(Boolean);

    if (parts.length > 1) {
      return parts.join(' ');
    }

    return `WSAA respondió ${statusCode}: ${this.compactXml(decodedXml).slice(0, 800)}`;
  }

  private compactXml(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
