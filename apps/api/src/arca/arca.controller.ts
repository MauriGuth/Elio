import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma';
import { ArcaService } from './arca.service';

/**
 * Endpoints para probar y operar la integración con ARCA.
 * Ver docs/INTEGRACION_ARCA.md.
 */
@Controller('arca')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ArcaController {
  constructor(private readonly arcaService: ArcaService) {}

  @Get('health')
  async health() {
    return this.arcaService.health();
  }
}
