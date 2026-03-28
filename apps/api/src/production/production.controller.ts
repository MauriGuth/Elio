import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { CompleteProductionDto } from './dto/complete-production.dto';

@Controller('production')
@UseGuards(JwtAuthGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('stats')
  getDashboardStats(@Query('locationId') locationId?: string) {
    return this.productionService.getDashboardStats(locationId);
  }

  @Get('suggestions-from-stock')
  getSuggestionsFromStock(
    @Query('locationId') locationId?: string,
    @Query('stockBand') stockBand?: string,
  ) {
    const id = locationId?.trim();
    if (!id) {
      throw new BadRequestException('El parámetro locationId es obligatorio.');
    }
    const band =
      stockBand === 'critical' || stockBand === 'medium' ? stockBand : 'all';
    return this.productionService.getSuggestionsFromStock(id, band);
  }

  @Get('batches/code/:code')
  getBatchByCode(@Param('code') code: string) {
    return this.productionService.findBatchByCode(code);
  }

  @Get()
  findAll(
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('recipeId') recipeId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productionService.findAll({
      locationId,
      status,
      recipeId,
      dateFrom,
      dateTo,
      page,
      limit,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.productionService.findById(id);
  }

  @Post()
  create(
    @Body() dto: CreateProductionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productionService.create(dto, userId);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productionService.start(id, userId);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteProductionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productionService.complete(id, dto, userId);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.productionService.cancel(id);
  }
}
