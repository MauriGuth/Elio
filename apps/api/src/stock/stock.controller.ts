import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  getStockLevels(
    @Query('locationId') locationId?: string,
    @Query('productId') productId?: string,
    @Query('status') status?: string,
  ) {
    return this.stockService.getStockLevels({
      locationId,
      productId,
      status,
    });
  }

  @Get('movements')
  getMovements(
    @Query('productId') productId?: string,
    @Query('locationId') locationId?: string,
    @Query('type') type?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockService.getMovements({
      productId,
      locationId,
      type,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('summary')
  getStockSummary(@Query('locationId') locationId?: string) {
    return this.stockService.getStockSummary(locationId);
  }

  @Get('logistics-summary')
  getLogisticsSummary(
    @Query('locationId') locationId?: string,
    @Query('purchaseOnly') purchaseOnly?: string,
  ) {
    return this.stockService.getLogisticsSummary(locationId, {
      purchaseOnly: purchaseOnly === 'true' || purchaseOnly === '1',
    });
  }

  @Post('adjust')
  adjustStock(
    @Body() adjustStockDto: AdjustStockDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.stockService.adjustStock(adjustStockDto, user.id);
  }

  @Post('movements')
  createMovement(
    @Body() createMovementDto: CreateMovementDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.stockService.createMovement(createMovementDto, user.id);
  }

  @Patch('levels/:id')
  updateLevel(
    @Param('id') id: string,
    @Body() updateLevelDto: UpdateLevelDto,
  ) {
    return this.stockService.updateLevel(id, updateLevelDto);
  }
}
