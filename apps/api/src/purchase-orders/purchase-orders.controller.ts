import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../../generated/prisma';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { GenerateFromDemandDto } from './dto/generate-from-demand.dto';
import { ReceivePurchaseOrderDto } from './dto/update-purchase-order-status.dto';
import { UpdatePurchaseOrderItemDto } from './dto/update-purchase-order-item.dto';
import { AddPurchaseOrderItemDto } from './dto/add-purchase-order-item.dto';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.LOGISTICS)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get('demand-summary')
  getDemandSummary(@Query('locationId') locationId: string) {
    return this.purchaseOrdersService.getDemandSummary(locationId);
  }

  @Post('generate-from-demand')
  generateFromDemand(
    @Body() dto: GenerateFromDemandDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.purchaseOrdersService.generateFromDemand(dto, userId);
  }

  @Get()
  findAll(
    @Query('locationId') locationId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchaseOrdersService.findAll({
      locationId,
      supplierId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.purchaseOrdersService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.purchaseOrdersService.create(dto, userId);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: AddPurchaseOrderItemDto) {
    return this.purchaseOrdersService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePurchaseOrderItemDto,
  ) {
    return this.purchaseOrdersService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.purchaseOrdersService.removeItem(id, itemId);
  }

  @Patch(':id/place')
  place(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.purchaseOrdersService.place(id, userId);
  }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.purchaseOrdersService.confirm(id);
  }

  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(id, dto);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.purchaseOrdersService.approve(id);
  }
}
