import { Controller, Get } from '@nestjs/common';
import { ArcaService } from './arca.service';

/**
 * Endpoint público para verificar si ARCA está habilitado (sin login).
 * Útil para comprobar variables en Railway: GET /api/arca/public/health
 */
@Controller('arca')
export class ArcaPublicController {
  constructor(private readonly arcaService: ArcaService) {}

  @Get('public/health')
  getPublicHealth() {
    return this.arcaService.getPublicHealth();
  }
}
