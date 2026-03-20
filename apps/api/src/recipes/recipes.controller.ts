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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

@Controller('recipes')
@UseGuards(JwtAuthGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: boolean,
    @Query('locationIds') locationIds?: string | string[],
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const locationIdsArr =
      locationIds == null
        ? undefined
        : Array.isArray(locationIds)
          ? locationIds.filter(Boolean)
          : String(locationIds).split(',').filter(Boolean);
    return this.recipesService.findAll({
      search,
      category,
      isActive,
      locationIds: locationIdsArr?.length ? locationIdsArr : undefined,
      page,
      limit,
    });
  }

  /** Contexto POS: grupos de variantes ligados a la receta e ingredientes para checklist. */
  @Get('pos-context/:productId')
  findPosContext(@Param('productId') productId: string) {
    return this.recipesService.findPosContextByProductId(productId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.recipesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateRecipeDto, @CurrentUser('id') userId: string) {
    return this.recipesService.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecipeDto) {
    return this.recipesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recipesService.remove(id);
  }

  @Post(':id/ingredients')
  addIngredient(
    @Param('id') recipeId: string,
    @Body() dto: CreateIngredientDto,
  ) {
    return this.recipesService.addIngredient(recipeId, dto);
  }

  @Patch('ingredients/:id')
  updateIngredient(
    @Param('id') ingredientId: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.recipesService.updateIngredient(ingredientId, dto);
  }

  @Delete('ingredients/:id')
  removeIngredient(@Param('id') ingredientId: string) {
    return this.recipesService.removeIngredient(ingredientId);
  }

  @Get(':id/cost')
  calculateCost(@Param('id') id: string, @Query('qty') qty: number) {
    return this.recipesService.calculateCost(id, qty || 1);
  }

  @Post(':id/new-version')
  newVersion(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.recipesService.newVersion(id, userId);
  }
}
