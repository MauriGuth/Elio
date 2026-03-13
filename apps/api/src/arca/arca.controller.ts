import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Post('wsaa/test-login')
  async testLogin() {
    return this.arcaService.testLogin();
  }

  @Get('wsfev1/params')
  async getWsfev1Params() {
    return this.arcaService.getWsfev1Params();
  }

  @Post('orders/:id/emit')
  async emitOrder(@Param('id') id: string) {
    return this.arcaService.emitOrder(id);
  }

  @Post('orders/:id/retry')
  async retryOrder(@Param('id') id: string) {
    return this.arcaService.retryOrder(id);
  }

  @Get('orders/:id/status')
  async getOrderStatus(@Param('id') id: string) {
    return this.arcaService.getOrderStatus(id);
  }

  @Get('orders/:id/verify')
  async verifyOrder(@Param('id') id: string) {
    return this.arcaService.verifyOrder(id);
  }
}
