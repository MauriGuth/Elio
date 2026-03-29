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
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
    @Query('isProduction') isProductionRaw?: string,
  ) {
    const isProduction =
      isProductionRaw === 'true'
        ? true
        : isProductionRaw === 'false'
          ? false
          : undefined;
    return this.locationsService.findAll({
      type,
      isActive,
      search,
      isProduction,
    });
  }

  /** Debe ir antes de @Get(':id') para no capturar «system» como id. */
  @Get('system/retiro-mercaderia-proveedor')
  getSystemRetiroMercaderiaProveedor() {
    return this.locationsService.getSystemRetiroMercaderiaProveedor();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.locationsService.findById(id);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id') id: string) {
    return this.locationsService.getDashboard(id);
  }

  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locationsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.locationsService.remove(id);
  }
}
