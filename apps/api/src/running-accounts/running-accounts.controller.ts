import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma';
import { RunningAccountsService } from './running-accounts.service';

@Controller('running-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.LOCATION_MANAGER, Role.CASHIER, Role.AUDITOR)
export class RunningAccountsController {
  constructor(private readonly service: RunningAccountsService) {}

  @Get('clients')
  getClients(@Query('locationId') locationId?: string) {
    return this.service.getClients(locationId);
  }

  @Get('orders')
  getOrdersByCustomer(
    @Query('locationId') locationId: string,
    @Query('customerId') customerId: string,
    @Query('month') month?: string,
  ) {
    return this.service.getOrdersByCustomer(locationId, customerId, month);
  }

  @Post('orders/mark-month-remito-sent')
  markMonthRemitoSent(
    @Query('locationId') locationId: string,
    @Query('customerId') customerId: string,
    @Query('month') month: string,
  ) {
    return this.service.markMonthRemitoSent(locationId, customerId, month);
  }

  @Post('orders/mark-month-invoiced')
  markMonthInvoiced(
    @Query('locationId') locationId: string,
    @Query('customerId') customerId: string,
    @Query('month') month: string,
  ) {
    return this.service.markMonthInvoiced(locationId, customerId, month);
  }

  @Post('orders/:orderId/remito-sent')
  markRemitoSent(@Param('orderId') orderId: string) {
    return this.service.markRemitoSent(orderId);
  }

  @Post('orders/:orderId/invoiced')
  markInvoiced(@Param('orderId') orderId: string) {
    return this.service.markInvoiced(orderId);
  }
}
