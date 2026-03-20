import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  CreateProductModifierGroupDto,
  UpdateProductModifierGroupDto,
  CreateProductModifierOptionDto,
  UpdateProductModifierOptionDto,
  SetModifierStockLinesDto,
} from './dto/product-modifiers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/product-images',
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `product-${unique}${extname(file.originalname) || '.jpg'}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Solo imágenes (jpg, png, gif, webp)'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen');
    return { url: `/uploads/product-images/${file.filename}` };
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('familia') familia?: string,
    @Query('isActive') isActive?: string,
    @Query('isSellable') isSellable?: string,
    @Query('isIngredient') isIngredient?: string,
    @Query('isProduced') isProduced?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.findAll({
      search,
      categoryId,
      familia,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      isSellable: isSellable !== undefined ? isSellable === 'true' : undefined,
      isIngredient: isIngredient !== undefined ? isIngredient === 'true' : undefined,
      isProduced: isProduced !== undefined ? isProduced === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/stock')
  getStockByLocation(@Param('id') id: string) {
    return this.productsService.getStockByLocation(id);
  }

  @Get(':id/modifiers')
  getProductModifiers(@Param('id') id: string) {
    return this.productsService.getProductModifiers(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post(':id/modifier-groups')
  createModifierGroup(
    @Param('id') productId: string,
    @Body() dto: CreateProductModifierGroupDto,
  ) {
    return this.productsService.createModifierGroup(productId, dto);
  }

  @Patch('modifier-groups/:groupId')
  updateModifierGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateProductModifierGroupDto,
  ) {
    return this.productsService.updateModifierGroup(groupId, dto);
  }

  @Delete('modifier-groups/:groupId')
  deleteModifierGroup(@Param('groupId') groupId: string) {
    return this.productsService.deleteModifierGroup(groupId);
  }

  @Post('modifier-groups/:groupId/options')
  createModifierOption(
    @Param('groupId') groupId: string,
    @Body() dto: CreateProductModifierOptionDto,
  ) {
    return this.productsService.createModifierOption(groupId, dto);
  }

  @Patch('modifier-options/:optionId')
  updateModifierOption(
    @Param('optionId') optionId: string,
    @Body() dto: UpdateProductModifierOptionDto,
  ) {
    return this.productsService.updateModifierOption(optionId, dto);
  }

  @Delete('modifier-options/:optionId')
  deleteModifierOption(@Param('optionId') optionId: string) {
    return this.productsService.deleteModifierOption(optionId);
  }

  @Put('modifier-options/:optionId/stock-lines')
  setModifierStockLines(
    @Param('optionId') optionId: string,
    @Body() dto: SetModifierStockLinesDto,
  ) {
    return this.productsService.setModifierStockLines(optionId, dto.lines);
  }

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }
}
