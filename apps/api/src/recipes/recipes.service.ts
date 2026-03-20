import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { getRecipePosContext } from './recipes-pos.helper';

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valida grupos de variantes en ingredientes: mismo producto de salida y sin duplicar grupo. */
  private async validateIngredientModifierGroups(
    outputProductId: string | null | undefined,
    ingredients: Array<{ modifierGroupId?: string | null }>,
  ) {
    const groupIds = ingredients
      .map((i) => i.modifierGroupId)
      .filter((id): id is string => !!id);
    if (groupIds.length === 0) return;
    if (!outputProductId) {
      throw new BadRequestException(
        'Definí un producto de salida para poder vincular grupos de variantes en los ingredientes.',
      );
    }
    const uniq = new Set(groupIds);
    if (uniq.size !== groupIds.length) {
      throw new BadRequestException(
        'No podés usar el mismo grupo de variantes en más de un ingrediente.',
      );
    }
    const groups = await this.prisma.productModifierGroup.findMany({
      where: { id: { in: groupIds }, productId: outputProductId },
      select: { id: true },
    });
    if (groups.length !== groupIds.length) {
      throw new BadRequestException(
        'Uno o más grupos de variantes no existen o no corresponden al producto de salida.',
      );
    }
  }

  async findAll(filters: {
    search?: string;
    category?: string;
    isActive?: boolean;
    locationIds?: string[];
    page?: number;
    limit?: number;
  }) {
    const { search, category, isActive, locationIds, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (locationIds?.length) {
      where.recipeLocations = {
        some: { locationId: { in: locationIds } },
      };
    }

    where.isActive = isActive ?? true;

    const [data, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { ingredients: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          product: {
            select: { id: true, name: true, sku: true },
          },
        },
      }),
      this.prisma.recipe.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                avgCost: true,
                imageUrl: true,
              },
            },
            modifierGroup: {
              select: { id: true, name: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        product: {
          select: { id: true, name: true, sku: true },
        },
        children: {
          select: { id: true, version: true, createdAt: true, isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        parent: {
          select: { id: true, version: true, name: true },
        },
        recipeLocations: {
          include: {
            location: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    return recipe;
  }

  /** Receta activa del producto: IDs de grupos de modificadores en ingredientes + filas para POS. */
  findPosContextByProductId(productId: string) {
    return getRecipePosContext(this.prisma, productId);
  }

  async create(data: CreateRecipeDto, userId: string) {
    const { ingredients, locationIds = [], prepTimeByLocation = {}, ...recipeData } = data;
    const uniqueLocationIds = [...new Set((locationIds || []).filter(Boolean))];

    await this.validateIngredientModifierGroups(
      recipeData.productId ?? undefined,
      ingredients ?? [],
    );

    if (uniqueLocationIds.length > 0) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueLocationIds } },
        select: { id: true },
      });
      if (locations.length !== uniqueLocationIds.length) {
        throw new NotFoundException('One or more selected locations were not found');
      }
    }

    const recipeLocationsCreate =
      uniqueLocationIds.length > 0
        ? uniqueLocationIds.map((locationId) => {
            const min = prepTimeByLocation[locationId];
            const prepTimeMin =
              min != null && typeof min === 'number' && min >= 0 ? min : null;
            return { locationId, prepTimeMin };
          })
        : undefined;

    return this.prisma.recipe.create({
      data: {
        ...recipeData,
        createdById: userId,
        ingredients: ingredients?.length
          ? {
              create: ingredients.map((ing) => ({
                productId: ing.productId,
                qtyPerYield: ing.qtyPerYield,
                unit: ing.unit,
                isOptional: ing.isOptional ?? false,
                notes: ing.notes,
                sortOrder: ing.sortOrder ?? 0,
                modifierGroupId: ing.modifierGroupId ?? null,
              })),
            }
          : undefined,
        recipeLocations: recipeLocationsCreate
          ? { create: recipeLocationsCreate }
          : undefined,
      },
      include: {
        ingredients: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
            modifierGroup: { select: { id: true, name: true } },
          },
        },
        recipeLocations: {
          include: {
            location: { select: { id: true, name: true, type: true } },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async update(id: string, data: UpdateRecipeDto) {
    const existing = await this.findById(id);
    const { ingredients, locationIds, prepTimeByLocation, ...recipeData } = data;

    const outputPid =
      recipeData.productId !== undefined
        ? recipeData.productId
        : existing.productId;
    if (Array.isArray(ingredients)) {
      await this.validateIngredientModifierGroups(
        outputPid ?? undefined,
        ingredients,
      );
    }

    const updateData: any = { ...recipeData };
    if (Array.isArray(ingredients)) {
      updateData.ingredients = {
        deleteMany: {},
        create: ingredients.map((ing, idx) => ({
          productId: ing.productId,
          qtyPerYield: ing.qtyPerYield,
          unit: ing.unit,
          isOptional: ing.isOptional ?? false,
          notes: ing.notes,
          sortOrder: ing.sortOrder ?? idx,
          modifierGroupId: ing.modifierGroupId ?? null,
        })),
      };
    }

    const uniqueLocationIds =
      locationIds !== undefined ? [...new Set((locationIds || []).filter(Boolean))] : undefined;

    if (uniqueLocationIds) {
      const locations = await this.prisma.location.findMany({
        where: { id: { in: uniqueLocationIds } },
        select: { id: true },
      });
      if (locations.length !== uniqueLocationIds.length) {
        throw new NotFoundException('One or more selected locations were not found');
      }
      updateData.recipeLocations = {
        deleteMany: {},
        create: uniqueLocationIds.map((locationId) => {
          const min = (prepTimeByLocation || {})[locationId];
          const prepTimeMin =
            min != null && typeof min === 'number' && min >= 0 ? min : null;
          return { locationId, prepTimeMin };
        }),
      };
    }

    return this.prisma.recipe.update({
      where: { id },
      data: updateData,
      include: {
        ingredients: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
            modifierGroup: { select: { id: true, name: true } },
          },
        },
        recipeLocations: {
          include: {
            location: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);

    return this.prisma.recipe.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async addIngredient(recipeId: string, data: CreateIngredientDto) {
    await this.findById(recipeId);

    return this.prisma.recipeIngredient.create({
      data: {
        recipeId,
        productId: data.productId,
        qtyPerYield: data.qtyPerYield,
        unit: data.unit,
        isOptional: data.isOptional ?? false,
        notes: data.notes,
        sortOrder: data.sortOrder ?? 0,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true, avgCost: true },
        },
      },
    });
  }

  async updateIngredient(ingredientId: string, data: UpdateIngredientDto) {
    const ingredient = await this.prisma.recipeIngredient.findUnique({
      where: { id: ingredientId },
    });

    if (!ingredient) {
      throw new NotFoundException(
        `Recipe ingredient with ID "${ingredientId}" not found`,
      );
    }

    return this.prisma.recipeIngredient.update({
      where: { id: ingredientId },
      data,
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true, avgCost: true },
        },
      },
    });
  }

  async removeIngredient(ingredientId: string) {
    const ingredient = await this.prisma.recipeIngredient.findUnique({
      where: { id: ingredientId },
    });

    if (!ingredient) {
      throw new NotFoundException(
        `Recipe ingredient with ID "${ingredientId}" not found`,
      );
    }

    return this.prisma.recipeIngredient.delete({
      where: { id: ingredientId },
    });
  }

  async calculateCost(recipeId: string, qty: number) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: {
          include: {
            product: {
              select: { id: true, name: true, avgCost: true, unit: true },
            },
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const ingredientCosts = recipe.ingredients.map((ing) => {
      const requiredQty = (ing.qtyPerYield * qty) / recipe.yieldQty;
      const cost = ing.product.avgCost * requiredQty;

      return {
        productId: ing.product.id,
        productName: ing.product.name,
        unit: ing.unit,
        qtyPerYield: ing.qtyPerYield,
        requiredQty: Math.round(requiredQty * 1000) / 1000,
        unitCost: ing.product.avgCost,
        totalCost: Math.round(cost * 100) / 100,
      };
    });

    const totalCost = ingredientCosts.reduce(
      (sum, item) => sum + item.totalCost,
      0,
    );
    const costPerUnit =
      qty > 0 ? Math.round((totalCost / qty) * 100) / 100 : 0;

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      yieldQty: recipe.yieldQty,
      yieldUnit: recipe.yieldUnit,
      requestedQty: qty,
      ingredients: ingredientCosts,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerUnit,
    };
  }

  async newVersion(id: string, userId: string) {
    const original = await this.prisma.recipe.findUnique({
      where: { id },
      include: { ingredients: true },
    });

    if (!original) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    // Parse current version and increment
    const currentVersion = parseFloat(original.version) || 1.0;
    const newVersionStr = (currentVersion + 1).toFixed(1);

    return this.prisma.recipe.create({
      data: {
        name: original.name,
        description: original.description,
        category: original.category,
        version: newVersionStr,
        yieldQty: original.yieldQty,
        yieldUnit: original.yieldUnit,
        productId: original.productId,
        prepTimeMin: original.prepTimeMin,
        instructions: original.instructions,
        imageUrl: original.imageUrl,
        isActive: true,
        parentId: original.parentId ?? original.id,
        createdById: userId,
        ingredients: {
          create: original.ingredients.map((ing) => ({
            productId: ing.productId,
            qtyPerYield: ing.qtyPerYield,
            unit: ing.unit,
            isOptional: ing.isOptional,
            notes: ing.notes,
            sortOrder: ing.sortOrder,
          })),
        },
      },
      include: {
        ingredients: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
