import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    search?: string;
    isActive?: boolean;
    parentId?: string;
  }) {
    const where: Prisma.CategoryWhereInput = {};

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { slug: { contains: filters.search } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.parentId !== undefined) {
      where.parentId = filters.parentId === 'null' ? null : filters.parentId;
    }

    return this.prisma.category.findMany({
      where,
      include: {
        parent: true,
        children: true,
        _count: {
          select: { products: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    return category;
  }

  private static readonly RANDOM_ICONS = [
    'coffee', 'glass-water', 'croissant', 'utensils', 'wheat', 'milk', 'apple',
    'spray-can', 'package', 'box', 'tag', 'star', 'heart', 'shopping-cart',
    'layers', 'folder', 'archive', 'bookmark', 'award', 'zap',
  ];

  private static randomHexColor(): string {
    const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return `#${hex()}${hex()}${hex()}`;
  }

  async create(data: CreateCategoryDto) {
    const slug = this.generateSlug(data.name);

    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      if (!existing.isActive) {
        // Reactivar categoría eliminada (soft-deleted) con los nuevos datos
        const icon = data.icon ?? existing.icon ?? CategoriesService.RANDOM_ICONS[Math.floor(Math.random() * CategoriesService.RANDOM_ICONS.length)];
        const color = data.color ?? existing.color ?? CategoriesService.randomHexColor();
        return this.prisma.category.update({
          where: { id: existing.id },
          data: { ...data, slug, icon, color, isActive: true },
          include: {
            parent: true,
            children: true,
            _count: { select: { products: true } },
          },
        });
      }
      throw new ConflictException(`Category with slug "${slug}" already exists`);
    }

    if (data.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category with ID "${data.parentId}" not found`);
      }
    }

    const icon = data.icon ?? CategoriesService.RANDOM_ICONS[Math.floor(Math.random() * CategoriesService.RANDOM_ICONS.length)];
    const color = data.color ?? CategoriesService.randomHexColor();

    return this.prisma.category.create({
      data: {
        ...data,
        slug,
        icon,
        color,
      },
      include: {
        parent: true,
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async update(id: string, data: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    const updateData: Prisma.CategoryUpdateInput = { ...data };

    if (data.name && data.name !== category.name) {
      const slug = this.generateSlug(data.name);
      const existing = await this.prisma.category.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Category with slug "${slug}" already exists`);
      }
      updateData.slug = slug;
    }

    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw new ConflictException('A category cannot be its own parent');
      }
      if (data.parentId) {
        const parent = await this.prisma.category.findUnique({
          where: { id: data.parentId },
        });
        if (!parent) {
          throw new NotFoundException(`Parent category with ID "${data.parentId}" not found`);
        }
        updateData.parent = { connect: { id: data.parentId } };
      } else {
        updateData.parent = { disconnect: true };
      }
      delete (updateData as any).parentId;
    }

    return this.prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        parent: true,
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async delete(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found`);
    }

    const displayFromCategoryName = (name: string) =>
      name.replace(/^(Tipo|Familia|Agrupar|Subfamilia):\s*/i, '').trim();

    // Raíz familia-*: eliminar subfamilias hijas y limpiar familia + subfamilia en productos
    if (category.slug.startsWith('familia-')) {
      const children = await this.prisma.category.findMany({
        where: { parentId: id, isActive: true },
      });
      for (const ch of children) {
        const subVal = displayFromCategoryName(ch.name);
        if (subVal) {
          await this.prisma.product.updateMany({
            where: { subfamilia: subVal },
            data: { subfamilia: null },
          });
        }
        await this.prisma.category.update({
          where: { id: ch.id },
          data: { isActive: false },
        });
      }
      const familiaValue = displayFromCategoryName(category.name);
      if (familiaValue) {
        await this.prisma.product.updateMany({
          where: { familia: familiaValue },
          data: { familia: null, subfamilia: null },
        });
      }
    } else {
      const parent = category.parentId
        ? await this.prisma.category.findUnique({ where: { id: category.parentId } })
        : null;
      const isSubfamiliaRow =
        category.slug.startsWith('subfamilia-') ||
        (!!parent && parent.slug.startsWith('familia-'));
      if (isSubfamiliaRow) {
        const subValue = displayFromCategoryName(category.name);
        if (subValue) {
          await this.prisma.product.updateMany({
            where: { subfamilia: subValue },
            data: { subfamilia: null },
          });
        }
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}
