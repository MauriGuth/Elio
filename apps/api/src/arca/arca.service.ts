import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Servicio para integración con ARCA (sistema de gestión / ERP).
 * Configuración vía env: ARCA_API_URL, ARCA_API_KEY, ARCA_ENABLED.
 * Ver docs/INTEGRACION_ARCA.md para el plan de integración.
 */
@Injectable()
export class ArcaService {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('ARCA_API_URL', '').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('ARCA_API_KEY');
    this.enabled = this.config.get<string>('ARCA_ENABLED', 'false') === 'true';
  }

  isEnabled(): boolean {
    return this.enabled && !!this.baseUrl;
  }

  /**
   * Verifica conectividad con ARCA (health/ping).
   * Implementar según la API real de ARCA.
   */
  async health(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, message: 'ARCA integration is disabled or ARCA_API_URL is not set' };
    }
    try {
      const url = `${this.baseUrl}/health`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        return { ok: false, message: `ARCA returned ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, message: `ARCA request failed: ${message}` };
    }
  }

  /**
   * Obtiene productos desde ARCA (ejemplo; adaptar a la API real).
   * Ver docs/INTEGRACION_ARCA.md para mapeo a Elio Product.
   */
  async getProducts(): Promise<unknown[]> {
    if (!this.isEnabled()) return [];
    try {
      const url = `${this.baseUrl}/productos`;
      const res = await fetch(url, { method: 'GET', headers: this.getHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.data ?? [];
    } catch {
      return [];
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      // Si ARCA usa otro header, por ejemplo: headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }
}
