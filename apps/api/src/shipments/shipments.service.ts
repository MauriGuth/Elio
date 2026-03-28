import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleMapsService } from '../google-maps/google-maps.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { CreateMultiShipmentDto } from './dto/create-multi-shipment.dto';
import { ReorderShipmentStopsDto } from './dto/reorder-shipment-stops.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { UpdateShipmentItemDto } from './dto/update-shipment-item.dto';
import { Prisma } from '../../generated/prisma';

const SHIPMENT_DETAIL_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          avgCost: true,
        },
      },
      shipmentStop: {
        select: {
          id: true,
          sortOrder: true,
          locationId: true,
          arrivedAt: true,
          receptionControlCompletedAt: true,
        },
      },
    },
  },
  stops: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      location: {
        select: { id: true, name: true, type: true, address: true },
      },
    },
  },
  origin: { select: { id: true, name: true, type: true, address: true } },
  destination: {
    select: { id: true, name: true, type: true, address: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  dispatchedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  receivedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  approvedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.ShipmentInclude;

export type ShipmentDetail = Prisma.ShipmentGetPayload<{
  include: typeof SHIPMENT_DETAIL_INCLUDE;
}>;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleMaps: GoogleMapsService,
  ) {}

  async findAll(filters: {
    originId?: string;
    destinationId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      originId,
      destinationId,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (originId) where.originId = originId;
    if (destinationId) where.destinationId = destinationId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          origin: { select: { id: true, name: true, type: true } },
          destination: { select: { id: true, name: true, type: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          stops: {
            orderBy: { sortOrder: 'asc' },
            include: {
              location: { select: { id: true, name: true, type: true } },
            },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.shipment.count({ where }),
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

  async findById(id: string): Promise<ShipmentDetail> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: SHIPMENT_DETAIL_INCLUDE,
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment with ID "${id}" not found`);
    }

    return shipment;
  }

  async updateItem(
    shipmentId: string,
    itemId: string,
    data: UpdateShipmentItemDto,
  ) {
    const shipment = await this.findById(shipmentId);
    if (shipment.status !== 'draft' && shipment.status !== 'prepared') {
      throw new BadRequestException(
        `Solo se puede editar la cantidad enviada en envíos en borrador o preparados. Estado actual: ${shipment.status}`,
      );
    }
    const item = shipment.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(
        `Item "${itemId}" no pertenece al envío "${shipmentId}"`,
      );
    }
    return this.prisma.shipmentItem.update({
      where: { id: itemId },
      data: { sentQty: data.sentQty },
      include: {
        product: {
          select: { id: true, name: true, sku: true, unit: true },
        },
      },
    });
  }

  /** Por id (cuid), número de envío o qrCode (para vista pública por QR). */
  async findByShipmentNumber(codeOrNumberOrId: string) {
    const param = (codeOrNumberOrId || '').trim();
    if (!param) {
      throw new NotFoundException('Número o código de envío no válido');
    }
    const include = SHIPMENT_DETAIL_INCLUDE;
    // 1) Por número de envío (ej. SH-20260213-013)
    let shipment = await this.prisma.shipment.findUnique({
      where: { shipmentNumber: param },
      include,
    });
    if (!shipment && param.startsWith('ELIO-SH-')) {
      shipment = await this.prisma.shipment.findFirst({
        where: { qrCode: param },
        include,
      });
    }
    // 2) Por id (cuid): el QR puede llevar el id
    if (!shipment) {
      shipment = await this.prisma.shipment.findUnique({
        where: { id: param },
        include,
      });
    }
    if (!shipment) {
      throw new NotFoundException(
        `Envío con número o código "${param}" no encontrado`,
      );
    }
    return shipment;
  }

  async getEstimateDuration(
    originId?: string,
    destinationId?: string,
  ): Promise<{ durationMin: number | null; reason?: 'no_api_key' | 'no_address' }> {
    if (!originId || !destinationId) {
      return { durationMin: null };
    }
    if (!this.googleMaps.isConfigured()) {
      return { durationMin: null, reason: 'no_api_key' };
    }
    const [origin, destination] = await Promise.all([
      this.prisma.location.findUnique({
        where: { id: originId },
        select: { address: true },
      }),
      this.prisma.location.findUnique({
        where: { id: destinationId },
        select: { address: true },
      }),
    ]);
    if (!origin?.address?.trim() || !destination?.address?.trim()) {
      return { durationMin: null, reason: 'no_address' };
    }
    const durationMin =
      await this.googleMaps.getRouteDurationInMinutes(
        origin.address,
        destination.address,
      );
    return { durationMin };
  }

  async create(data: CreateShipmentDto, userId: string) {
    // Validate origin and destination
    const [origin, destination] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: data.originId } }),
      this.prisma.location.findUnique({ where: { id: data.destinationId } }),
    ]);

    if (!origin) {
      throw new NotFoundException(
        `Origin location with ID "${data.originId}" not found`,
      );
    }
    if (!destination) {
      throw new NotFoundException(
        `Destination location with ID "${data.destinationId}" not found`,
      );
    }
    if (data.originId === data.destinationId) {
      throw new BadRequestException(
        'Origin and destination must be different locations',
      );
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const draftAlreadyHasDestination = await this.prisma.shipment.findFirst({
      where: {
        originId: data.originId,
        status: 'draft',
        createdAt: { gte: todayStart, lt: todayEnd },
        stops: { some: { locationId: data.destinationId } },
      },
      select: { shipmentNumber: true },
      orderBy: { createdAt: 'asc' },
    });
    if (draftAlreadyHasDestination) {
      throw new BadRequestException(
        `Ya tenés un pedido en borrador para este local hoy (envío ${draftAlreadyHasDestination.shipmentNumber}). Revisalo en Logística y Envíos para no duplicar el pedido.`,
      );
    }

    /** Un solo envío multi-parada por día y origen: agregar solo locales que aún no estén en el borrador. */
    const mergeInto = await this.prisma.shipment.findFirst({
      where: {
        originId: data.originId,
        status: 'draft',
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      include: {
        stops: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (mergeInto) {
      return this.prisma.$transaction(async (tx) => {
        const stops = await tx.shipmentStop.findMany({
          where: { shipmentId: mergeInto.id },
          orderBy: { sortOrder: 'asc' },
        });
        const maxOrder = stops.reduce((m, s) => Math.max(m, s.sortOrder), -1);
        const ns = await tx.shipmentStop.create({
          data: {
            shipmentId: mergeInto.id,
            locationId: data.destinationId,
            sortOrder: maxOrder + 1,
          },
        });
        for (const item of data.items) {
          await tx.shipmentItem.create({
            data: {
              shipmentId: mergeInto.id,
              shipmentStopId: ns.id,
              productId: item.productId,
              sentQty: item.sentQty,
              unitCost: item.unitCost,
              lotNumber: item.lotNumber,
              notes: item.notes,
            },
          });
        }
        const orderedStops = await tx.shipmentStop.findMany({
          where: { shipmentId: mergeInto.id },
          orderBy: { sortOrder: 'asc' },
        });
        const lastStop = orderedStops[orderedStops.length - 1]!;
        const row = await tx.shipment.findUnique({
          where: { id: mergeInto.id },
          select: { notes: true },
        });
        const noteExtra = data.notes?.trim();
        await tx.shipment.update({
          where: { id: mergeInto.id },
          data: {
            destinationId: lastStop.locationId,
            isMultiStop: orderedStops.length >= 2,
            totalItems: { increment: data.items.length },
            ...(noteExtra
              ? {
                  notes: row?.notes
                    ? `${row.notes}\n${noteExtra}`
                    : noteExtra,
                }
              : {}),
          },
        });
        await this.refreshDraftShipmentRouteTx(tx, mergeInto.id);
        const out = await tx.shipment.findUnique({
          where: { id: mergeInto.id },
          include: SHIPMENT_DETAIL_INCLUDE,
        });
        if (!out) throw new Error('Envío no encontrado tras fusionar pedido');
        return out;
      });
    }

    const existingPending = await this.prisma.shipment.findFirst({
      where: {
        originId: data.originId,
        destinationId: data.destinationId,
        status: { in: ['draft', 'prepared', 'dispatched', 'in_transit', 'reception_control'] },
      },
    });
    if (existingPending) {
      throw new BadRequestException(
        'Ya existe un envío pendiente (borrador, preparado o en tránsito) para este origen y destino. No se puede crear el mismo pedido dos veces.',
      );
    }

    let estimatedDurationMin = data.estimatedDurationMin ?? null;
    let routePolyline: string | null = null;
    if (
      origin.address?.trim() &&
      destination.address?.trim()
    ) {
      const details = await this.googleMaps.getRouteDetails(
        origin.address,
        destination.address,
      );
      if (details) {
        if (estimatedDurationMin == null) estimatedDurationMin = details.durationMin;
        if (details.polyline) routePolyline = details.polyline;
      }
    }

    // Generate shipment number: SH-YYYYMMDD-XXX
    const todayCount = await this.prisma.shipment.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    const shipmentNumber = `SH-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;

    // Generate QR code string
    const qrCode = `ELIO-SH-${shipmentNumber}-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          shipmentNumber,
          originId: data.originId,
          destinationId: data.destinationId,
          isMultiStop: false,
          status: 'draft',
          qrCode,
          estimatedArrival: data.estimatedArrival
            ? new Date(data.estimatedArrival)
            : null,
          estimatedDurationMin: estimatedDurationMin ?? undefined,
          routePolyline: routePolyline ?? undefined,
          totalItems: data.items.length,
          notes: data.notes,
          createdById: userId,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              sentQty: item.sentQty,
              unitCost: item.unitCost,
              lotNumber: item.lotNumber,
              notes: item.notes,
            })),
          },
        },
        include: { items: { select: { id: true } } },
      });
      const stop = await tx.shipmentStop.create({
        data: {
          shipmentId: created.id,
          locationId: data.destinationId,
          sortOrder: 0,
        },
      });
      await tx.shipmentItem.updateMany({
        where: { shipmentId: created.id },
        data: { shipmentStopId: stop.id },
      });
      const out = await tx.shipment.findUnique({
        where: { id: created.id },
        include: SHIPMENT_DETAIL_INCLUDE,
      });
      if (!out) throw new Error('Envío no encontrado tras crear parada');
      return out;
    });
  }

  async createMultiStop(data: CreateMultiShipmentDto, userId: string) {
    const origin = await this.prisma.location.findUnique({
      where: { id: data.originId },
    });
    if (!origin) {
      throw new NotFoundException(`Origen "${data.originId}" no encontrado`);
    }

    const locIds = data.stops.map((s) => s.locationId);
    const unique = new Set(locIds);
    if (unique.size !== locIds.length) {
      throw new BadRequestException(
        'Cada parada debe ser un local distinto en la ruta.',
      );
    }
    if (locIds.some((id) => id === data.originId)) {
      throw new BadRequestException('Las paradas no pueden ser el mismo depósito de origen.');
    }

    const locations = await this.prisma.location.findMany({
      where: { id: { in: locIds } },
    });
    if (locations.length !== locIds.length) {
      throw new NotFoundException('Uno o más locales de parada no existen');
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const draftOverlapsStops = await this.prisma.shipment.findFirst({
      where: {
        originId: data.originId,
        status: 'draft',
        createdAt: { gte: todayStart, lt: todayEnd },
        stops: { some: { locationId: { in: locIds } } },
      },
      select: { shipmentNumber: true },
      orderBy: { createdAt: 'asc' },
    });
    if (draftOverlapsStops) {
      throw new BadRequestException(
        `Uno o más locales de esta ruta ya están en un envío en borrador de hoy (envío ${draftOverlapsStops.shipmentNumber}). Revisalo en Logística y Envíos para no duplicar el pedido.`,
      );
    }

    const mergeInto = await this.prisma.shipment.findFirst({
      where: {
        originId: data.originId,
        status: 'draft',
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      include: {
        stops: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (mergeInto) {
      const totalNewItems = data.stops.reduce((n, s) => n + s.items.length, 0);
      return this.prisma.$transaction(async (tx) => {
        let maxOrder = (
          await tx.shipmentStop.findMany({
            where: { shipmentId: mergeInto.id },
            orderBy: { sortOrder: 'asc' },
          })
        ).reduce((m, s) => Math.max(m, s.sortOrder), -1);

        for (const st of data.stops) {
          maxOrder += 1;
          const ns = await tx.shipmentStop.create({
            data: {
              shipmentId: mergeInto.id,
              locationId: st.locationId,
              sortOrder: maxOrder,
            },
          });
          for (const item of st.items) {
            await tx.shipmentItem.create({
              data: {
                shipmentId: mergeInto.id,
                shipmentStopId: ns.id,
                productId: item.productId,
                sentQty: item.sentQty,
                unitCost: item.unitCost,
                lotNumber: item.lotNumber,
                notes: item.notes,
              },
            });
          }
        }

        const orderedStops = await tx.shipmentStop.findMany({
          where: { shipmentId: mergeInto.id },
          orderBy: { sortOrder: 'asc' },
        });
        const lastStop = orderedStops[orderedStops.length - 1]!;
        const row = await tx.shipment.findUnique({
          where: { id: mergeInto.id },
          select: { notes: true },
        });
        const noteExtra = data.notes?.trim();
        await tx.shipment.update({
          where: { id: mergeInto.id },
          data: {
            destinationId: lastStop.locationId,
            isMultiStop: orderedStops.length >= 2,
            totalItems: { increment: totalNewItems },
            ...(noteExtra
              ? {
                  notes: row?.notes
                    ? `${row.notes}\n${noteExtra}`
                    : noteExtra,
                }
              : {}),
          },
        });
        await this.refreshDraftShipmentRouteTx(tx, mergeInto.id);
        const out = await tx.shipment.findUnique({
          where: { id: mergeInto.id },
          include: SHIPMENT_DETAIL_INCLUDE,
        });
        if (!out) throw new Error('Envío no encontrado tras fusionar ruta multi-parada');
        return out;
      });
    }

    const lastDest = locIds[locIds.length - 1]!;
    let routePolyline: string | null = null;
    let estimatedDurationMin: number | null = null;
    const middleAddrs = locIds.slice(0, -1).map((id) => {
      const l = locations.find((x) => x.id === id);
      return l?.address?.trim() ?? '';
    });
    const lastLoc = locations.find((x) => x.id === lastDest);
    const lastAddr = lastLoc?.address?.trim() ?? '';
    if (origin.address?.trim() && lastAddr) {
      const route = await this.googleMaps.getRouteWithWaypoints(
        origin.address,
        middleAddrs.filter(Boolean),
        lastAddr,
        false,
      );
      if (route) {
        routePolyline = route.polyline || null;
        estimatedDurationMin = route.durationMinTotal;
      }
    }

    const todayCount = await this.prisma.shipment.count({
      where: { createdAt: { gte: todayStart, lt: todayEnd } },
    });
    const shipmentNumber = `SH-${dateStr}-${String(todayCount + 1).padStart(3, '0')}`;
    const qrCode = `ELIO-SH-${shipmentNumber}-${Date.now()}`;

    const totalItems = data.stops.reduce((n, s) => n + s.items.length, 0);

    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          shipmentNumber,
          originId: data.originId,
          destinationId: lastDest,
          isMultiStop: true,
          status: 'draft',
          qrCode,
          estimatedArrival: data.estimatedArrival
            ? new Date(data.estimatedArrival)
            : null,
          estimatedDurationMin: estimatedDurationMin ?? undefined,
          routePolyline: routePolyline ?? undefined,
          totalItems,
          notes: data.notes,
          createdById: userId,
        },
      });

      for (let i = 0; i < data.stops.length; i++) {
        const st = data.stops[i]!;
        const stop = await tx.shipmentStop.create({
          data: {
            shipmentId: shipment.id,
            locationId: st.locationId,
            sortOrder: i,
          },
        });
        for (const item of st.items) {
          await tx.shipmentItem.create({
            data: {
              shipmentId: shipment.id,
              shipmentStopId: stop.id,
              productId: item.productId,
              sentQty: item.sentQty,
              unitCost: item.unitCost,
              lotNumber: item.lotNumber,
              notes: item.notes,
            },
          });
        }
      }

      const out = await tx.shipment.findUnique({
        where: { id: shipment.id },
        include: SHIPMENT_DETAIL_INCLUDE,
      });
      if (!out) throw new Error('Envío multi-parada no encontrado');
      return out;
    });
  }

  async prepare(id: string) {
    const shipment = await this.findById(id);

    if (shipment.status !== 'draft') {
      throw new BadRequestException(
        `Cannot mark as prepared: shipment status is "${shipment.status}"`,
      );
    }

    return this.prisma.shipment.update({
      where: { id },
      data: { status: 'prepared' },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
        origin: { select: { id: true, name: true } },
        destination: { select: { id: true, name: true } },
      },
    });
  }

  async dispatch(id: string, userId: string) {
    const shipment = await this.findById(id);

    if (shipment.status !== 'draft' && shipment.status !== 'prepared') {
      throw new BadRequestException(
        `Cannot dispatch shipment with status "${shipment.status}"`,
      );
    }

    const originAddress = shipment.origin?.address?.trim();
    let estimatedArrival: Date | undefined;
    let estimatedDurationMin: number | undefined;
    let routePolyline: string | undefined;
    type LegRow = {
      durationMin: number;
      distanceMeters: number;
      polyline: string | null;
    };
    let legsForStops: LegRow[] | null = null;

    if (
      shipment.isMultiStop &&
      shipment.stops &&
      shipment.stops.length >= 2
    ) {
      const ordered = [...shipment.stops].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const last = ordered[ordered.length - 1]!;
      const middle = ordered.slice(0, -1);
      const middleAddr = middle
        .map((s) => s.location?.address?.trim())
        .filter(Boolean) as string[];
      const destAddr = last.location?.address?.trim();
      if (
        originAddress &&
        destAddr &&
        middleAddr.length === middle.length
      ) {
        const route = await this.googleMaps.getRouteWithWaypoints(
          originAddress,
          middleAddr,
          destAddr,
          true,
        );
        if (route) {
          estimatedDurationMin = route.durationMinTotal;
          estimatedArrival = new Date(
            Date.now() + route.durationMinTotal * 60 * 1000,
          );
          routePolyline = route.polyline || undefined;
          legsForStops = route.legs;
        }
      }
    } else {
      const destAddress = shipment.destination?.address?.trim();
      if (originAddress && destAddress) {
        const route = await this.googleMaps.getRouteDetailsWithTraffic(
          originAddress,
          destAddress,
        );
        if (route) {
          estimatedDurationMin = route.durationMin;
          estimatedArrival = new Date(
            Date.now() + route.durationMin * 60 * 1000,
          );
          routePolyline = route.polyline || undefined;
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Create stock movements (shipment_out) at origin for each item
      for (const item of shipment.items) {
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: shipment.originId,
            },
          },
        });

        const currentQty = stockLevel?.quantity ?? 0;

        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: shipment.originId,
            },
          },
          update: {
            quantity: currentQty - item.sentQty,
          },
          create: {
            productId: item.productId,
            locationId: shipment.originId,
            quantity: -item.sentQty,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: shipment.originId,
            type: 'shipment_out',
            quantity: -item.sentQty,
            unitCost: item.unitCost,
            referenceType: 'shipment',
            referenceId: shipment.id,
            userId,
          },
        });
      }

      const now = new Date();
      await tx.shipment.update({
        where: { id },
        data: {
          status: 'in_transit',
          dispatchedAt: now,
          dispatchedById: userId,
          ...(estimatedArrival && { estimatedArrival }),
          ...(estimatedDurationMin != null && {
            estimatedDurationMin,
          }),
          ...(routePolyline && { routePolyline }),
        },
      });

      if (legsForStops?.length && shipment.stops?.length) {
        const ordered = [...shipment.stops].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        for (let i = 0; i < ordered.length; i++) {
          const leg = legsForStops[i];
          if (!leg) continue;
          await tx.shipmentStop.update({
            where: { id: ordered[i]!.id },
            data: {
              legDurationMin: leg.durationMin,
              legDistanceMeters: leg.distanceMeters,
              legPolyline: leg.polyline ?? undefined,
            },
          });
        }
      }
    });

    return this.findById(id);
  }

  async startReceptionControl(id: string) {
    const shipment = await this.findById(id);
    if (shipment.status !== 'in_transit' && shipment.status !== 'dispatched') {
      throw new BadRequestException(
        `Solo se puede iniciar control de recepción cuando el envío está "Despachado" o "En tránsito". Estado actual: ${shipment.status}`,
      );
    }
    const now = new Date();
    return this.prisma.shipment.update({
      where: { id },
      data: {
        status: 'reception_control',
        receptionControlStartedAt: now,
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
        origin: { select: { id: true, name: true } },
        destination: { select: { id: true, name: true } },
      },
    });
  }

  async receive(id: string, data: ReceiveShipmentDto, userId: string) {
    const shipment = await this.findById(id);

    if (shipment.isMultiStop) {
      throw new BadRequestException(
        'Este envío tiene varias paradas: usá la recepción por local (firma y nombre en cada parada).',
      );
    }

    const allowedStatuses = ['dispatched', 'in_transit', 'reception_control'];
    if (!allowedStatuses.includes(shipment.status)) {
      throw new BadRequestException(
        `No se puede recibir el envío con estado "${shipment.status}"`,
      );
    }

    if (!data.receivedBySignature?.trim()) {
      throw new BadRequestException(
        'La firma es obligatoria para registrar la entrega.',
      );
    }
    if (!data.receivedByName?.trim()) {
      throw new BadRequestException(
        'El nombre de quien recibe es obligatorio.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Process each received item
      for (const receivedItem of data.items) {
        const shipmentItem = shipment.items.find(
          (si) => si.id === receivedItem.itemId,
        );

        if (!shipmentItem) {
          throw new BadRequestException(
            `Shipment item with ID "${receivedItem.itemId}" not found`,
          );
        }

        // Update shipment item with received data
        await tx.shipmentItem.update({
          where: { id: receivedItem.itemId },
          data: {
            receivedQty: receivedItem.receivedQty,
            diffReason: receivedItem.diffReason,
          },
        });

        // Create stock movement (shipment_in) at destination
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: shipmentItem.productId,
              locationId: shipment.destinationId,
            },
          },
        });

        const currentQty = stockLevel?.quantity ?? 0;

        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: shipmentItem.productId,
              locationId: shipment.destinationId,
            },
          },
          update: {
            quantity: currentQty + receivedItem.receivedQty,
          },
          create: {
            productId: shipmentItem.productId,
            locationId: shipment.destinationId,
            quantity: receivedItem.receivedQty,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: shipmentItem.productId,
            locationId: shipment.destinationId,
            type: 'shipment_in',
            quantity: receivedItem.receivedQty,
            unitCost: shipmentItem.unitCost,
            referenceType: 'shipment',
            referenceId: shipment.id,
            userId,
          },
        });
      }

      // Update shipment status; if was in reception_control, set completion time for control duration
      const now = new Date();
      const wasInReceptionControl = shipment.status === 'reception_control';
      return tx.shipment.update({
        where: { id },
        data: {
          status: 'received',
          receivedAt: now,
          actualArrivalAt: now,
          receivedById: userId,
          receivedByName: data.receivedByName ?? undefined,
          ...(wasInReceptionControl && { receptionControlCompletedAt: now }),
          receivedBySignature: data.receivedBySignature ?? undefined,
          receptionNotes: data.receptionNotes?.trim() || undefined,
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
          origin: { select: { id: true, name: true } },
          destination: { select: { id: true, name: true } },
        },
      });
    });
  }

  async markStopArrived(shipmentId: string, stopId: string) {
    const shipment = await this.findById(shipmentId);
    if (!shipment.isMultiStop) {
      throw new BadRequestException('Solo aplica a envíos con varias paradas.');
    }
    const allowed = ['dispatched', 'in_transit', 'reception_control'];
    if (!allowed.includes(shipment.status)) {
      throw new BadRequestException(
        `No se puede marcar llegada con estado "${shipment.status}"`,
      );
    }
    const stop = shipment.stops.find((s) => s.id === stopId);
    if (!stop) {
      throw new NotFoundException('Parada no encontrada');
    }
    const prev = shipment.stops.filter((s) => s.sortOrder < stop.sortOrder);
    if (prev.some((s) => !s.receptionControlCompletedAt)) {
      throw new BadRequestException(
        'Completá primero la recepción de las paradas anteriores en la ruta.',
      );
    }
    if (stop.arrivedAt) {
      throw new BadRequestException('Ya se registró la llegada a esta parada.');
    }
    await this.prisma.shipmentStop.update({
      where: { id: stopId },
      data: { arrivedAt: new Date() },
    });
    return this.findById(shipmentId);
  }

  async startStopReceptionControl(shipmentId: string, stopId: string) {
    const shipment = await this.findById(shipmentId);
    if (!shipment.isMultiStop) {
      throw new BadRequestException('Solo aplica a envíos con varias paradas.');
    }
    const canStart = ['dispatched', 'in_transit', 'reception_control'].includes(
      shipment.status,
    );
    if (!canStart) {
      throw new BadRequestException(
        `Estado "${shipment.status}" no permite iniciar control en parada.`,
      );
    }
    const stop = shipment.stops.find((s) => s.id === stopId);
    if (!stop) throw new NotFoundException('Parada no encontrada');
    if (!stop.arrivedAt) {
      throw new BadRequestException('Primero registrá la llegada a este local.');
    }
    if (stop.receptionControlCompletedAt) {
      throw new BadRequestException('Esta parada ya fue recepcionada.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.shipmentStop.update({
        where: { id: stopId },
        data: { receptionControlStartedAt: now },
      }),
      this.prisma.shipment.update({
        where: { id: shipmentId },
        data: { status: 'reception_control' },
      }),
    ]);
    return this.findById(shipmentId);
  }

  async receiveStop(
    shipmentId: string,
    stopId: string,
    data: ReceiveShipmentDto,
    userId: string,
  ) {
    const shipment = await this.findById(shipmentId);
    if (!shipment.isMultiStop) {
      throw new BadRequestException(
        'Usá la recepción general para envíos de un solo local.',
      );
    }
    const allowedStatuses = ['dispatched', 'in_transit', 'reception_control'];
    if (!allowedStatuses.includes(shipment.status)) {
      throw new BadRequestException(
        `No se puede recibir con estado "${shipment.status}"`,
      );
    }
    const stop = shipment.stops.find((s) => s.id === stopId);
    if (!stop) throw new NotFoundException('Parada no encontrada');
    if (stop.receptionControlCompletedAt) {
      throw new BadRequestException('Esta parada ya fue recepcionada.');
    }
    const prev = shipment.stops.filter((s) => s.sortOrder < stop.sortOrder);
    if (prev.some((s) => !s.receptionControlCompletedAt)) {
      throw new BadRequestException(
        'Completá primero la recepción de las paradas anteriores.',
      );
    }
    if (!data.receivedBySignature?.trim()) {
      throw new BadRequestException(
        'La firma es obligatoria para registrar la entrega.',
      );
    }
    if (!data.receivedByName?.trim()) {
      throw new BadRequestException(
        'El nombre de quien recibe es obligatorio.',
      );
    }

    const itemsAtStop = shipment.items.filter(
      (i) => i.shipmentStopId === stopId,
    );
    const allowedIds = new Set(itemsAtStop.map((i) => i.id));
    for (const ri of data.items) {
      if (!allowedIds.has(ri.itemId)) {
        throw new BadRequestException(
          `El ítem "${ri.itemId}" no pertenece a esta parada.`,
        );
      }
    }

    const destLocationId = stop.locationId;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const ri of data.items) {
        const shipmentItem = shipment.items.find((si) => si.id === ri.itemId)!;
        await tx.shipmentItem.update({
          where: { id: ri.itemId },
          data: {
            receivedQty: ri.receivedQty,
            diffReason: ri.diffReason,
          },
        });

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: shipmentItem.productId,
              locationId: destLocationId,
            },
          },
        });
        const currentQty = stockLevel?.quantity ?? 0;
        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: shipmentItem.productId,
              locationId: destLocationId,
            },
          },
          update: { quantity: currentQty + ri.receivedQty },
          create: {
            productId: shipmentItem.productId,
            locationId: destLocationId,
            quantity: ri.receivedQty,
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: shipmentItem.productId,
            locationId: destLocationId,
            type: 'shipment_in',
            quantity: ri.receivedQty,
            unitCost: shipmentItem.unitCost,
            referenceType: 'shipment',
            referenceId: shipment.id,
            userId,
          },
        });
      }

      await tx.shipmentStop.update({
        where: { id: stopId },
        data: {
          receptionControlCompletedAt: now,
          receivedByName: data.receivedByName.trim(),
          receivedBySignature: data.receivedBySignature.trim(),
          receptionNotes: data.receptionNotes?.trim() || undefined,
        },
      });

      const stopsLeft = await tx.shipmentStop.findMany({
        where: { shipmentId },
        orderBy: { sortOrder: 'asc' },
      });
      const allDone = stopsLeft.every((s) => s.receptionControlCompletedAt);
      if (allDone) {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            status: 'received',
            receivedAt: now,
            actualArrivalAt: now,
            receivedById: userId,
            receivedByName: data.receivedByName.trim(),
            receivedBySignature: data.receivedBySignature.trim(),
            receptionNotes: data.receptionNotes?.trim() || undefined,
            receptionControlCompletedAt: now,
          },
        });
      } else {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: { status: 'in_transit' },
        });
      }
    });

    return this.findById(shipmentId);
  }

  async reorderStops(shipmentId: string, dto: ReorderShipmentStopsDto) {
    const shipment = await this.findById(shipmentId);
    if (!shipment.isMultiStop) {
      throw new BadRequestException('Solo envíos multi-parada.');
    }
    if (shipment.status !== 'draft' && shipment.status !== 'prepared') {
      throw new BadRequestException(
        'Solo se puede reordenar en borrador o preparado.',
      );
    }
    const currentIds = shipment.stops.map((s) => s.id).sort();
    const sorted = [...dto.stopIds].sort();
    if (
      currentIds.length !== sorted.length ||
      !currentIds.every((id, i) => id === sorted[i])
    ) {
      throw new BadRequestException(
        'La lista de paradas debe incluir exactamente todas las paradas del envío.',
      );
    }
    const ordered = dto.stopIds
      .map((id) => shipment.stops.find((s) => s.id === id))
      .filter(Boolean) as typeof shipment.stops;
    const lastLoc = ordered[ordered.length - 1]!.locationId;

    const origin = await this.prisma.location.findUnique({
      where: { id: shipment.originId },
    });
    const locRows = await this.prisma.location.findMany({
      where: { id: { in: ordered.map((s) => s.locationId) } },
    });
    const middleAddrs = ordered
      .slice(0, -1)
      .map((s) => locRows.find((l) => l.id === s.locationId)?.address?.trim())
      .filter(Boolean) as string[];
    const lastAddr =
      locRows.find((l) => l.id === lastLoc)?.address?.trim() ?? '';
    let routePolyline: string | undefined;
    let estimatedDurationMin: number | undefined;
    let legs: { durationMin: number; distanceMeters: number; polyline: string | null }[] | null =
      null;
    if (origin?.address?.trim() && lastAddr && middleAddrs.length === ordered.length - 1) {
      const r = await this.googleMaps.getRouteWithWaypoints(
        origin.address.trim(),
        middleAddrs,
        lastAddr,
        false,
      );
      if (r) {
        routePolyline = r.polyline || undefined;
        estimatedDurationMin = r.durationMinTotal;
        legs = r.legs;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const n = dto.stopIds.length;
      /** Evitar violación de UNIQUE (shipment_id, sort_order): no pisar 0..n-1 en un solo paso. */
      const tmpBase = 1_000_000;
      for (let i = 0; i < n; i++) {
        await tx.shipmentStop.update({
          where: { id: dto.stopIds[i]! },
          data: { sortOrder: tmpBase + i },
        });
      }
      for (let i = 0; i < n; i++) {
        await tx.shipmentStop.update({
          where: { id: dto.stopIds[i]! },
          data: { sortOrder: i },
        });
      }
      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          destinationId: lastLoc,
          ...(routePolyline && { routePolyline }),
          ...(estimatedDurationMin != null && { estimatedDurationMin }),
        },
      });
      if (legs?.length) {
        for (let i = 0; i < ordered.length; i++) {
          const leg = legs[i];
          if (!leg) continue;
          await tx.shipmentStop.update({
            where: { id: ordered[i]!.id },
            data: {
              legDurationMin: leg.durationMin,
              legDistanceMeters: leg.distanceMeters,
              legPolyline: leg.polyline ?? undefined,
            },
          });
        }
      }
    });

    return this.findById(shipmentId);
  }

  async cancel(id: string) {
    const shipment = await this.findById(id);

    if (['received', 'cancelled'].includes(shipment.status)) {
      throw new BadRequestException(
        `Cannot cancel shipment with status "${shipment.status}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Si ya salió del depósito (dispatched o in_transit), revertir movimientos en origen
      if (shipment.status === 'dispatched' || shipment.status === 'in_transit') {
        for (const item of shipment.items) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: shipment.originId,
              },
            },
          });

          const currentQty = stockLevel?.quantity ?? 0;

          await tx.stockLevel.update({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: shipment.originId,
              },
            },
            data: {
              quantity: currentQty + item.sentQty,
            },
          });
        }
      }

      return tx.shipment.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
  }

  /**
   * Actualiza polyline, duración total y datos por tramo según paradas actuales (misma lógica que reordenar).
   */
  private async refreshDraftShipmentRouteTx(
    tx: Pick<PrismaService, 'shipment' | 'shipmentStop' | 'location'>,
    shipmentId: string,
  ): Promise<void> {
    const sh = await tx.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        origin: { select: { address: true, id: true } },
        stops: {
          orderBy: { sortOrder: 'asc' },
          include: { location: { select: { address: true, id: true } } },
        },
      },
    });
    if (!sh || sh.stops.length === 0) return;

    const ordered = sh.stops;
    const last = ordered[ordered.length - 1]!;

    if (ordered.length === 1) {
      const o = sh.origin?.address?.trim();
      const d = last.location?.address?.trim();
      if (o && d) {
        const details = await this.googleMaps.getRouteDetails(o, d);
        if (details) {
          await tx.shipment.update({
            where: { id: shipmentId },
            data: {
              destinationId: last.locationId,
              routePolyline: details.polyline || undefined,
              estimatedDurationMin: details.durationMin,
            },
          });
          await tx.shipmentStop.update({
            where: { id: last.id },
            data: {
              legDurationMin: details.durationMin,
              legPolyline: details.polyline || undefined,
            },
          });
        }
      }
      return;
    }

    const originRow = await tx.location.findUnique({
      where: { id: sh.originId },
      select: { address: true },
    });
    const locRows = await tx.location.findMany({
      where: { id: { in: ordered.map((s) => s.locationId) } },
    });
    const middleAddrs = ordered
      .slice(0, -1)
      .map((s) => locRows.find((l) => l.id === s.locationId)?.address?.trim())
      .filter(Boolean) as string[];
    const lastAddr =
      locRows.find((l) => l.id === last.locationId)?.address?.trim() ?? '';
    if (
      originRow?.address?.trim() &&
      lastAddr &&
      middleAddrs.length === ordered.length - 1
    ) {
      const r = await this.googleMaps.getRouteWithWaypoints(
        originRow.address.trim(),
        middleAddrs,
        lastAddr,
        false,
      );
      if (r) {
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            destinationId: last.locationId,
            routePolyline: r.polyline || undefined,
            estimatedDurationMin: r.durationMinTotal,
          },
        });
        if (r.legs?.length) {
          for (let i = 0; i < ordered.length; i++) {
            const leg = r.legs[i];
            if (!leg) continue;
            await tx.shipmentStop.update({
              where: { id: ordered[i]!.id },
              data: {
                legDurationMin: leg.durationMin,
                legDistanceMeters: leg.distanceMeters,
                legPolyline: leg.polyline ?? undefined,
              },
            });
          }
        }
      }
    } else {
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { destinationId: last.locationId },
      });
    }
  }
}
