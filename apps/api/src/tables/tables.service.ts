import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

const SPECIAL_ZONE = 'Especial';
const TRASH_TABLE_NAME = 'Tacho de basura';
const ERRORS_TABLE_NAME = 'Errores de comandas';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Asegura que existan las dos mesas fijas (Tacho de basura, Errores de comandas) en el local */
  private async ensureSpecialTables(locationId: string): Promise<void> {
    const existing = await this.prisma.table.findMany({
      where: { locationId, isActive: true },
      select: { tableType: true },
    });
    const hasTrash = existing.some((t) => t.tableType === 'trash');
    const hasErrors = existing.some((t) => t.tableType === 'errors');

    if (!hasTrash) {
      await this.prisma.table.create({
        data: {
          locationId,
          name: TRASH_TABLE_NAME,
          zone: SPECIAL_ZONE,
          capacity: 1,
          shape: 'square',
          scale: 1,
          tableType: 'trash',
          sortOrder: 999,
          positionX: 40,
          positionY: 480,
        },
      });
    }
    if (!hasErrors) {
      await this.prisma.table.create({
        data: {
          locationId,
          name: ERRORS_TABLE_NAME,
          zone: SPECIAL_ZONE,
          capacity: 1,
          shape: 'square',
          scale: 1,
          tableType: 'errors',
          sortOrder: 1000,
          positionX: 200,
          positionY: 480,
        },
      });
    }
  }

  async findAll(locationId: string) {
    await this.ensureSpecialTables(locationId);

    const tables = await this.prisma.table.findMany({
      where: { locationId, isActive: true },
      include: {
        orders: {
          where: { status: 'open' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            customerCount: true,
            openedAt: true,
            _count: { select: { items: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Flatten: attach currentOrderId and occupiedMinutes for the frontend
    return tables.map((table) => {
      const openOrder = table.orders[0] ?? null;
      const occupiedMinutes = openOrder
        ? Math.floor(
            (Date.now() - new Date(openOrder.openedAt).getTime()) / 60_000,
          )
        : 0;
      return {
        ...table,
        currentOrderId: openOrder?.id ?? null,
        occupiedMinutes,
        orders: undefined, // remove raw orders array
      };
    });
  }

  async findById(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, type: true } },
        orders: {
          where: { status: 'open' },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true, sku: true },
                },
              },
            },
            waiter: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with ID "${id}" not found`);
    }

    const openOrder = table.orders[0] ?? null;
    const occupiedMinutes = openOrder
      ? Math.floor(
          (Date.now() - new Date(openOrder.openedAt).getTime()) / 60_000,
        )
      : 0;

    // Misma forma que findAll: el POS usa currentOrderId para cargar el pedido.
    return {
      ...table,
      currentOrder: openOrder,
      currentOrderId: openOrder?.id ?? null,
      occupiedMinutes,
      orders: undefined,
    };
  }

  async create(data: CreateTableDto) {
    if (data.zone === SPECIAL_ZONE) {
      throw new BadRequestException(
        'No se pueden crear mesas en la zona Especial.',
      );
    }
    return this.prisma.table.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        zone: data.zone,
        capacity: data.capacity ?? 4,
        shape: data.shape ?? 'square',
        scale: data.scale ?? 1.0,
        positionX: data.positionX,
        positionY: data.positionY,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, data: UpdateTableDto) {
    const table = await this.prisma.table.findUnique({ where: { id } });

    if (!table) {
      throw new NotFoundException(`Table with ID "${id}" not found`);
    }

    // Zona Especial: mesas de sistema (trash/errors) solo permiten cambiar zona, posición o escala
    if (table.zone === SPECIAL_ZONE) {
      if (table.tableType === 'trash' || table.tableType === 'errors') {
        const keys = Object.keys(data).filter((k) => data[k] !== undefined);
        const allowedKeys = ['zone', 'positionX', 'positionY', 'scale'];
        const onlyAllowed = keys.every((k) => allowedKeys.includes(k));
        if (!onlyAllowed) {
          throw new BadRequestException(
            'No se puede modificar esta mesa (solo posición, tamaño o zona).',
          );
        }
        if (keys.length === 1 && keys[0] === 'zone') {
          return this.prisma.table.update({
            where: { id },
            data: { zone: data.zone },
          });
        }
        const updateData: Record<string, unknown> = {};
        if (data.positionX !== undefined) updateData.positionX = data.positionX;
        if (data.positionY !== undefined) updateData.positionY = data.positionY;
        if (data.scale !== undefined) updateData.scale = data.scale;
        if (Object.keys(updateData).length > 0) {
          return this.prisma.table.update({
            where: { id },
            data: updateData,
          });
        }
        throw new BadRequestException(
          'No se puede modificar esta mesa (solo se permite cambiar posición, tamaño o zona).',
        );
      }
      throw new BadRequestException(
        'No se pueden editar las mesas de la zona Especial.',
      );
    }

    return this.prisma.table.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: string, status: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });

    if (!table) {
      throw new NotFoundException(`Table with ID "${id}" not found`);
    }

    const updateData: any = { status };

    // Clear currentOrderId when setting to available
    if (status === 'available') {
      updateData.currentOrderId = null;
    }

    return this.prisma.table.update({
      where: { id },
      data: updateData,
    });
  }

  async getMap(locationId: string) {
    return this.prisma.table.findMany({
      where: { locationId, isActive: true },
      select: {
        id: true,
        name: true,
        zone: true,
        capacity: true,
        status: true,
        tableType: true,
        positionX: true,
        positionY: true,
        sortOrder: true,
        currentOrderId: true,
      },
      orderBy: [{ zone: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async delete(id: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });

    if (!table) {
      throw new NotFoundException(`Table with ID "${id}" not found`);
    }

    if (
      table.tableType === 'trash' ||
      table.tableType === 'errors' ||
      table.zone === SPECIAL_ZONE
    ) {
      throw new BadRequestException(
        'No se puede eliminar esta mesa (zona Especial / mesa fija del sistema).',
      );
    }

    // Soft delete by setting isActive to false
    return this.prisma.table.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
