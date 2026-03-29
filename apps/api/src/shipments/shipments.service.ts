import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleMapsService } from '../google-maps/google-maps.service';
import {
  CreateShipmentDto,
  CreateShipmentItemDto,
} from './dto/create-shipment.dto';
import {
  CreateMultiShipmentDto,
  CreateShipmentStopDto,
} from './dto/create-multi-shipment.dto';
import { ReorderShipmentStopsDto } from './dto/reorder-shipment-stops.dto';
import { ReceiveShipmentDto } from './dto/receive-shipment.dto';
import { UpdateShipmentItemDto } from './dto/update-shipment-item.dto';
import { Prisma } from '../../generated/prisma';
import { randomBytes } from 'crypto';

/** Local tipo retiro en proveedor (misma convención que migración / web). */
const SUPPLIER_PICKUP_ORIGIN_SLUG = 'retiro-mercaderia-proveedor';

type ProductSupplierLinkRow = {
  supplierId: string;
  isPreferred: boolean;
};

function locationRoutePoint(loc: {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  if (loc.latitude != null && loc.longitude != null) {
    return `${loc.latitude},${loc.longitude}`;
  }
  const a = loc.address?.trim();
  return a || null;
}

function mergeStopLineItemsByProductId(
  items: CreateShipmentItemDto[],
): CreateShipmentItemDto[] {
  const m = new Map<string, CreateShipmentItemDto>();
  for (const it of items) {
    const cur = m.get(it.productId);
    if (cur) {
      m.set(it.productId, {
        ...cur,
        sentQty: cur.sentQty + it.sentQty,
      });
    } else {
      m.set(it.productId, { ...it });
    }
  }
  return [...m.values()];
}

function mergeDbShipmentItemsByProductId(
  items: Array<{
    productId: string;
    sentQty: number;
    unitCost: number | null;
    lotNumber: string | null;
    notes: string | null;
  }>,
): Array<{
  productId: string;
  sentQty: number;
  unitCost: number | null;
  lotNumber: string | null;
  notes: string | null;
}> {
  const m = new Map<string, (typeof items)[0]>();
  for (const it of items) {
    const cur = m.get(it.productId);
    if (cur) {
      m.set(it.productId, {
        ...cur,
        sentQty: cur.sentQty + it.sentQty,
      });
    } else {
      m.set(it.productId, { ...it });
    }
  }
  return [...m.values()];
}

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
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      },
      pickupSupplier: {
        select: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
  origin: {
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      slug: true,
      latitude: true,
      longitude: true,
    },
  },
  pickupSupplier: {
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
    },
  },
  destination: {
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      latitude: true,
      longitude: true,
    },
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

  /**
   * Número único: secuencia del día + sufijo aleatorio (evita P2002 por carrera o
   * reintentos que repiten el mismo `count + 1` tras rollback).
   */
  private async allocateShipmentNumber(
    dateStr: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<{ shipmentNumber: string; qrCode: string }> {
    const todayCount = await this.prisma.shipment.count({
      where: { createdAt: { gte: todayStart, lt: todayEnd } },
    });
    const seq = String(todayCount + 1).padStart(3, '0');
    const entropy = randomBytes(3).toString('hex');
    const shipmentNumber = `SH-${dateStr}-${seq}-${entropy}`;
    const qrCode = `ELIO-SH-${shipmentNumber}-${Date.now()}`;
    return { shipmentNumber, qrCode };
  }

  /** Parada en el local de sistema de retiro (slug, id o nombre típico). */
  private stopIsRetiroPickupPlaceholder(
    stop: {
      locationId: string;
      location?: { slug?: string | null; name?: string | null } | null;
    },
    retiro: { id: string },
  ): boolean {
    if (stop.locationId === retiro.id) return true;
    if (stop.location?.slug === SUPPLIER_PICKUP_ORIGIN_SLUG) return true;
    const n = (stop.location?.name ?? '').toLowerCase();
    return (
      n.includes('retiro') &&
      (n.includes('proveedor') || n.includes('mercader'))
    );
  }

  private async buildProductSupplierLinkMap(
    productIds: string[],
  ): Promise<Map<string, ProductSupplierLinkRow[]>> {
    const map = new Map<string, ProductSupplierLinkRow[]>();
    if (productIds.length === 0) return map;
    const rows = await this.prisma.productSupplier.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, supplierId: true, isPreferred: true },
    });
    for (const r of rows) {
      if (!map.has(r.productId)) map.set(r.productId, []);
      map.get(r.productId)!.push({
        supplierId: r.supplierId,
        isPreferred: r.isPreferred,
      });
    }
    return map;
  }

  /**
   * Proveedor único para los productos de la parada: intersección por producto;
   * si hay varios, desempata por vínculos preferidos (isPreferred).
   */
  private pickSupplierIdForStopProducts(
    productIds: string[],
    linkMap: Map<string, ProductSupplierLinkRow[]>,
  ): string | null {
    if (productIds.length === 0) return null;
    const idSets = productIds.map((pid) => {
      const arr = linkMap.get(pid) ?? [];
      return new Set(arr.map((l) => l.supplierId));
    });
    if (idSets.some((s) => s.size === 0)) return null;
    let intersection = idSets[0]!;
    for (let i = 1; i < idSets.length; i++) {
      intersection = new Set(
        [...intersection].filter((x) => idSets[i]!.has(x)),
      );
    }
    const candidates = [...intersection];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0]!;

    let bestId = candidates[0]!;
    let bestScore = -1;
    for (const sid of candidates) {
      let score = 0;
      for (const pid of productIds) {
        const link = (linkMap.get(pid) ?? []).find((l) => l.supplierId === sid);
        if (link?.isPreferred) score += 2;
        else if (link) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestId = sid;
      }
    }
    return bestId;
  }

  /**
   * Si hay pickup_supplier_id pero la relación no vino (datos viejos o lectura parcial),
   * completa nombre/dirección para la UI y Maps.
   */
  private async attachMissingStopPickupSuppliers(
    shipment: ShipmentDetail,
  ): Promise<ShipmentDetail> {
    const need = shipment.stops.filter(
      (s) => s.pickupSupplierId && !s.pickupSupplier,
    );
    if (need.length === 0) return shipment;
    const ids = [...new Set(need.map((s) => s.pickupSupplierId!))];
    const rows = await this.prisma.supplier.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });
    const map = new Map(rows.map((r) => [r.id, r]));
    const stops = shipment.stops.map((s) => {
      if (!s.pickupSupplierId || s.pickupSupplier) return s;
      const ps = map.get(s.pickupSupplierId);
      if (!ps) return s;
      return { ...s, pickupSupplier: ps };
    });
    return { ...shipment, stops };
  }

  /**
   * Paradas en el local «retiro» sin datos de proveedor: infiere proveedor desde product_suppliers
   * (intersección por producto; si hay varios, desempata por isPreferred).
   * Persiste pickup_supplier_id en BD para que rutas / recepción queden alineadas.
   */
  private async attachInferredRetiroStopPickupSuppliers(
    shipment: ShipmentDetail,
  ): Promise<ShipmentDetail> {
    const retiro = await this.prisma.location.findFirst({
      where: { slug: SUPPLIER_PICKUP_ORIGIN_SLUG },
      select: { id: true },
    });
    if (!retiro) return shipment;

    const stopsNeeding = shipment.stops.filter((s) => {
      if (s.pickupSupplier) return false;
      return this.stopIsRetiroPickupPlaceholder(s, retiro);
    });
    if (stopsNeeding.length === 0) return shipment;

    const productIdsByStop = new Map<string, string[]>();
    const orphanProductIds = shipment.items
      .filter((it) => !it.shipmentStopId)
      .map((it) => it.productId);
    const onlyOneRetiroStop = stopsNeeding.length === 1;
    for (const stop of stopsNeeding) {
      let pids = shipment.items
        .filter((it) => it.shipmentStopId === stop.id)
        .map((it) => it.productId);
      if (
        pids.length === 0 &&
        orphanProductIds.length > 0 &&
        onlyOneRetiroStop
      ) {
        pids = [...orphanProductIds];
      }
      if (pids.length > 0) productIdsByStop.set(stop.id, pids);
    }
    if (productIdsByStop.size === 0) return shipment;

    const allPids = [...new Set([...productIdsByStop.values()].flat())];
    const linkMap = await this.buildProductSupplierLinkMap(allPids);

    const stopIdToSupplierId = new Map<string, string>();
    for (const stop of stopsNeeding) {
      const pids = productIdsByStop.get(stop.id);
      if (!pids?.length) continue;
      const sid = this.pickSupplierIdForStopProducts(pids, linkMap);
      if (sid) stopIdToSupplierId.set(stop.id, sid);
    }
    if (stopIdToSupplierId.size === 0) return shipment;

    const supplierIds = [...new Set(stopIdToSupplierId.values())];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });
    const supMap = new Map(suppliers.map((s) => [s.id, s]));

    const persistRows: { id: string; supplierId: string }[] = [];
    for (const s of shipment.stops) {
      const sid = stopIdToSupplierId.get(s.id);
      if (!sid) continue;
      if (s.pickupSupplierId !== sid) {
        persistRows.push({ id: s.id, supplierId: sid });
      }
    }
    if (persistRows.length > 0) {
      await this.prisma.$transaction(
        persistRows.map((u) =>
          this.prisma.shipmentStop.update({
            where: { id: u.id },
            data: { pickupSupplierId: u.supplierId },
          }),
        ),
      );
    }

    const stops = shipment.stops.map((s) => {
      const sid = stopIdToSupplierId.get(s.id);
      if (!sid) return s;
      const sup = supMap.get(sid);
      if (!sup) return s;
      return { ...s, pickupSupplierId: sid, pickupSupplier: sup };
    });
    return { ...shipment, stops };
  }

  private async enrichShipmentStopSuppliers(
    shipment: ShipmentDetail,
  ): Promise<ShipmentDetail> {
    const step1 = await this.attachMissingStopPickupSuppliers(shipment);
    return this.attachInferredRetiroStopPickupSuppliers(step1);
  }

  /**
   * Misma lógica que enrichShipmentStopSuppliers pero en batch para el listado (findAll),
   * sin N consultas por envío.
   */
  private async enrichShipmentsListForPickupSuppliers<
    T extends {
      id: string;
      isMultiStop: boolean;
      stops: Array<{
        id: string;
        locationId: string;
        pickupSupplierId: string | null;
        pickupSupplier: {
          id: string;
          name: string;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
        } | null;
        location: {
          id: string;
          name: string;
          slug: string | null;
          type: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
        } | null;
      }>;
      items: Array<{
        productId: string;
        shipmentStopId: string | null;
      }>;
    },
  >(shipments: T[]): Promise<T[]> {
    if (shipments.length === 0) return shipments;

    const idSet = new Set<string>();
    for (const sh of shipments) {
      for (const s of sh.stops) {
        if (s.pickupSupplierId && !s.pickupSupplier) {
          idSet.add(s.pickupSupplierId);
        }
      }
    }
    let supById = new Map<
      string,
      {
        id: string;
        name: string;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
      }
    >();
    if (idSet.size > 0) {
      const rows = await this.prisma.supplier.findMany({
        where: { id: { in: [...idSet] } },
        select: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      });
      supById = new Map(rows.map((r) => [r.id, r]));
    }

    let result = shipments.map((sh) => ({
      ...sh,
      stops: sh.stops.map((s) => {
        if (s.pickupSupplierId && !s.pickupSupplier) {
          const ps = supById.get(s.pickupSupplierId);
          return ps ? { ...s, pickupSupplier: ps } : s;
        }
        return s;
      }),
    })) as T[];

    const retiro = await this.prisma.location.findFirst({
      where: { slug: SUPPLIER_PICKUP_ORIGIN_SLUG },
      select: { id: true },
    });
    if (!retiro) return result;

    type Cand = { shIdx: number; stopId: string };
    const candidates: Cand[] = [];
    result.forEach((sh, shIdx) => {
      for (const s of sh.stops) {
        if (s.pickupSupplier) continue;
        if (!this.stopIsRetiroPickupPlaceholder(s, retiro)) continue;
        candidates.push({ shIdx, stopId: s.id });
      }
    });
    if (candidates.length === 0) return result;

    const stopIdToPids = new Map<string, string[]>();
    for (const c of candidates) {
      const sh = result[c.shIdx]!;
      let pids = sh.items
        .filter((it) => it.shipmentStopId === c.stopId)
        .map((it) => it.productId);
      const retiroCountOnSh = sh.stops.filter(
        (st) =>
          !st.pickupSupplier && this.stopIsRetiroPickupPlaceholder(st, retiro),
      ).length;
      const orphans = sh.items
        .filter((it) => !it.shipmentStopId)
        .map((it) => it.productId);
      if (pids.length === 0 && orphans.length > 0 && retiroCountOnSh === 1) {
        pids = [...orphans];
      }
      if (pids.length > 0) stopIdToPids.set(c.stopId, pids);
    }
    const allPids = [...new Set([...stopIdToPids.values()].flat())];
    if (allPids.length === 0) return result;

    const linkMap = await this.buildProductSupplierLinkMap(allPids);

    const stopIdToSupplierId = new Map<string, string>();
    for (const [stopId, pids] of stopIdToPids) {
      const sid = this.pickSupplierIdForStopProducts(pids, linkMap);
      if (sid) stopIdToSupplierId.set(stopId, sid);
    }
    if (stopIdToSupplierId.size === 0) return result;

    const inferSupIds = [...new Set(stopIdToSupplierId.values())];
    const inferSuppliers = await this.prisma.supplier.findMany({
      where: { id: { in: inferSupIds } },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });
    const inferMap = new Map(inferSuppliers.map((s) => [s.id, s]));

    const persistRows: { id: string; supplierId: string }[] = [];
    for (const sh of result) {
      for (const s of sh.stops) {
        const sid = stopIdToSupplierId.get(s.id);
        if (!sid) continue;
        if (s.pickupSupplierId !== sid) {
          persistRows.push({ id: s.id, supplierId: sid });
        }
      }
    }
    if (persistRows.length > 0) {
      await this.prisma.$transaction(
        persistRows.map((u) =>
          this.prisma.shipmentStop.update({
            where: { id: u.id },
            data: { pickupSupplierId: u.supplierId },
          }),
        ),
      );
    }

    result = result.map((sh) => ({
      ...sh,
      stops: sh.stops.map((s) => {
        const sid = stopIdToSupplierId.get(s.id);
        if (!sid || s.pickupSupplier) return s;
        const sup = inferMap.get(sid);
        return sup ? { ...s, pickupSupplierId: sid, pickupSupplier: sup } : s;
      }),
    })) as T[];

    return result;
  }

  private async isSupplierPickupOrigin(originId: string): Promise<boolean> {
    const loc = await this.prisma.location.findUnique({
      where: { id: originId },
      select: { slug: true },
    });
    return loc?.slug === SUPPLIER_PICKUP_ORIGIN_SLUG;
  }

  /** Punto de origen para Google Directions (texto o lat,lng). */
  private async resolveOriginRoutePoint(
    originId: string,
    pickupSupplierId?: string | null,
  ): Promise<string | null> {
    const loc = await this.prisma.location.findUnique({
      where: { id: originId },
      select: { slug: true, address: true, latitude: true, longitude: true },
    });
    if (!loc) return null;
    if (loc.slug === SUPPLIER_PICKUP_ORIGIN_SLUG && pickupSupplierId?.trim()) {
      const sup = await this.prisma.supplier.findFirst({
        where: { id: pickupSupplierId.trim(), isActive: true },
        select: { address: true, latitude: true, longitude: true },
      });
      if (!sup) return null;
      return locationRoutePoint(sup);
    }
    return locationRoutePoint(loc);
  }

  private async assertPickupSupplierRules(
    originId: string,
    pickupSupplierId?: string | null,
  ): Promise<void> {
    const pickup = await this.isSupplierPickupOrigin(originId);
    if (pickup) {
      if (!pickupSupplierId?.trim()) {
        throw new BadRequestException(
          'Para retiro en proveedor debés elegir un proveedor con dirección o coordenadas cargadas.',
        );
      }
      const sup = await this.prisma.supplier.findFirst({
        where: { id: pickupSupplierId.trim(), isActive: true },
        select: { address: true, latitude: true, longitude: true },
      });
      if (!sup) {
        throw new NotFoundException(
          'Proveedor de retiro no encontrado o inactivo.',
        );
      }
      if (!locationRoutePoint(sup)) {
        throw new BadRequestException(
          'El proveedor elegido no tiene dirección ni coordenadas para calcular la ruta. Cargalas en Proveedores.',
        );
      }
      return;
    }
    if (pickupSupplierId?.trim()) {
      throw new BadRequestException(
        'Solo podés indicar proveedor de retiro cuando el origen es «Retiro de mercadería o proveedor».',
      );
    }
  }

  private async assertMergePickupSupplier(
    originId: string,
    existingPickupId: string | null,
    incomingPickupId?: string | null,
  ): Promise<void> {
    const pickup = await this.isSupplierPickupOrigin(originId);
    if (!pickup) {
      if (incomingPickupId?.trim()) {
        throw new BadRequestException(
          'Solo podés indicar proveedor de retiro cuando el origen es «Retiro de mercadería o proveedor».',
        );
      }
      return;
    }
    const effective =
      existingPickupId ??
      (incomingPickupId?.trim() ? incomingPickupId.trim() : null);
    if (!effective) {
      throw new BadRequestException(
        'Para retiro en proveedor indicá el proveedor de retiro en este pedido (o creá primero el envío con proveedor asignado).',
      );
    }
    if (
      existingPickupId &&
      incomingPickupId?.trim() &&
      incomingPickupId.trim() !== existingPickupId
    ) {
      throw new BadRequestException(
        'Este borrador ya tiene otro proveedor de retiro; no se puede mezclar en el mismo envío.',
      );
    }
    if (!existingPickupId && incomingPickupId?.trim()) {
      await this.assertPickupSupplierRules(originId, incomingPickupId);
    }
  }

  /** Punto para Maps / Directions según parada (proveedor o local). */
  private stopRoutePointFromIncluded(stop: {
    pickupSupplierId?: string | null;
    pickupSupplier?: {
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    location?: {
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
  }): string | null {
    if (stop.pickupSupplierId && stop.pickupSupplier) {
      return locationRoutePoint(stop.pickupSupplier);
    }
    return stop.location ? locationRoutePoint(stop.location) : null;
  }

  private async getRetiroMercaderiaLocation() {
    const loc = await this.prisma.location.findFirst({
      where: { slug: SUPPLIER_PICKUP_ORIGIN_SLUG },
    });
    if (!loc) {
      throw new BadRequestException(
        'Falta el local de sistema «Retiro de mercadería o proveedor».',
      );
    }
    return loc;
  }

  private async assertActiveSupplierRoutePoint(supplierId: string) {
    const sup = await this.prisma.supplier.findFirst({
      where: { id: supplierId, isActive: true },
      select: { address: true, latitude: true, longitude: true },
    });
    if (!sup) {
      throw new NotFoundException('Proveedor de parada no encontrado o inactivo.');
    }
    if (!locationRoutePoint(sup)) {
      throw new BadRequestException(
        'El proveedor debe tener dirección o coordenadas para la ruta.',
      );
    }
  }

  private async resolvePointForStopInput(input: {
    locationId: string;
    pickupSupplierId?: string | null;
  }): Promise<string | null> {
    if (input.pickupSupplierId) {
      const sup = await this.prisma.supplier.findFirst({
        where: { id: input.pickupSupplierId, isActive: true },
        select: { address: true, latitude: true, longitude: true },
      });
      if (sup) return locationRoutePoint(sup);
      return null;
    }
    const loc = await this.prisma.location.findUnique({
      where: { id: input.locationId },
      select: { address: true, latitude: true, longitude: true },
    });
    return loc ? locationRoutePoint(loc) : null;
  }

  /**
   * Ida a proveedor y vuelta al mismo local de origen (depósito u otro): no hay salida de stock al
   * despachar; la mercadería entra al completar la última parada.
   */
  private isSupplierPickupRoundTripDetail(shipment: ShipmentDetail): boolean {
    if (!shipment.isMultiStop || !shipment.stops?.length) return false;
    const ordered = [...shipment.stops].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first?.pickupSupplierId) return false;
    if (last?.locationId !== shipment.originId) return false;
    return true;
  }

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
          origin: { select: { id: true, name: true, type: true, address: true } },
          pickupSupplier: {
            select: {
              id: true,
              name: true,
              address: true,
              latitude: true,
              longitude: true,
            },
          },
          destination: {
            select: { id: true, name: true, type: true, address: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          stops: {
            orderBy: { sortOrder: 'asc' },
            include: {
              location: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  type: true,
                  address: true,
                  latitude: true,
                  longitude: true,
                },
              },
              pickupSupplier: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.shipment.count({ where }),
    ]);

    const multiIds = data
      .filter((sh) => sh.isMultiStop && sh.stops.length > 0)
      .map((sh) => sh.id);

    const itemsByShipmentId = new Map<
      string,
      { productId: string; shipmentStopId: string | null }[]
    >();
    if (multiIds.length > 0) {
      const itemRows = await this.prisma.shipmentItem.findMany({
        where: { shipmentId: { in: multiIds } },
        select: {
          shipmentId: true,
          shipmentStopId: true,
          productId: true,
        },
      });
      for (const row of itemRows) {
        if (!itemsByShipmentId.has(row.shipmentId)) {
          itemsByShipmentId.set(row.shipmentId, []);
        }
        itemsByShipmentId.get(row.shipmentId)!.push({
          productId: row.productId,
          shipmentStopId: row.shipmentStopId,
        });
      }
    }

    const withItems = data.map((sh) => ({
      ...sh,
      items: itemsByShipmentId.get(sh.id) ?? [],
    }));

    const enriched =
      await this.enrichShipmentsListForPickupSuppliers(withItems);

    const dataForClient = enriched.map(
      ({ items: _listInferItems, ...row }) => row,
    );

    return {
      data: dataForClient,
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

    return this.enrichShipmentStopSuppliers(shipment);
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
    return this.enrichShipmentStopSuppliers(shipment);
  }

  async getEstimateDuration(
    originId?: string,
    destinationId?: string,
    pickupSupplierId?: string,
    destinationSupplierId?: string,
  ): Promise<{ durationMin: number | null; reason?: 'no_api_key' | 'no_address' }> {
    if (!originId || !destinationId) {
      return { durationMin: null };
    }
    if (!this.googleMaps.isConfigured()) {
      return { durationMin: null, reason: 'no_api_key' };
    }
    let destPoint: string | null = null;
    if (destinationSupplierId?.trim()) {
      const sup = await this.prisma.supplier.findFirst({
        where: { id: destinationSupplierId.trim(), isActive: true },
        select: { address: true, latitude: true, longitude: true },
      });
      destPoint = sup ? locationRoutePoint(sup) : null;
    } else {
      const destination = await this.prisma.location.findUnique({
        where: { id: destinationId },
        select: { address: true, latitude: true, longitude: true },
      });
      destPoint = destination ? locationRoutePoint(destination) : null;
    }
    const originPoint = await this.resolveOriginRoutePoint(
      originId,
      pickupSupplierId,
    );
    if (!originPoint || !destPoint) {
      return { durationMin: null, reason: 'no_address' };
    }
    const durationMin = await this.googleMaps.getRouteDurationInMinutes(
      originPoint,
      destPoint,
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
      await this.assertMergePickupSupplier(
        data.originId,
        mergeInto.pickupSupplierId,
        data.pickupSupplierId,
      );
    } else {
      await this.assertPickupSupplierRules(data.originId, data.pickupSupplierId);
    }

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
            ...(!mergeInto.pickupSupplierId && data.pickupSupplierId?.trim()
              ? { pickupSupplierId: data.pickupSupplierId.trim() }
              : {}),
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
    const originPoint = await this.resolveOriginRoutePoint(
      data.originId,
      data.pickupSupplierId,
    );
    const destPoint = locationRoutePoint(destination);
    if (originPoint && destPoint) {
      const details = await this.googleMaps.getRouteDetails(
        originPoint,
        destPoint,
      );
      if (details) {
        if (estimatedDurationMin == null) estimatedDurationMin = details.durationMin;
        if (details.polyline) routePolyline = details.polyline;
      }
    }

    const { shipmentNumber, qrCode } = await this.allocateShipmentNumber(
      dateStr,
      todayStart,
      todayEnd,
    );

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          shipmentNumber,
          originId: data.originId,
          pickupSupplierId: data.pickupSupplierId?.trim() || undefined,
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

    const retiro = await this.getRetiroMercaderiaLocation();

    type NormStop = {
      locationId: string;
      pickupSupplierId?: string;
      items: CreateShipmentStopDto['items'];
    };

    const stopsNorm: NormStop[] = data.stops.map((s, i) => {
      const pick = s.pickupSupplierId?.trim() || undefined;
      const loc = (s.locationId ?? '').trim();
      if (!pick && !loc) {
        throw new BadRequestException(
          `Parada ${i + 1}: indicá un local o un proveedor de retiro (faltan locationId y pickupSupplierId).`,
        );
      }
      return {
        locationId: loc,
        pickupSupplierId: pick,
        items: s.items,
      };
    });

    for (const s of stopsNorm) {
      if (s.pickupSupplierId) {
        s.locationId = retiro.id;
        await this.assertActiveSupplierRoutePoint(s.pickupSupplierId);
      }
    }

    for (let i = 0; i < stopsNorm.length; i++) {
      const s = stopsNorm[i]!;
      if (!s.locationId?.trim()) {
        throw new BadRequestException(
          `Parada ${i + 1}: local inválido. Si es retiro en proveedor, tiene que enviarse pickupSupplierId en el body de esa parada.`,
        );
      }
      if (s.locationId === retiro.id && !s.pickupSupplierId?.trim()) {
        throw new BadRequestException(
          `Parada ${i + 1}: no podés usar solo el local «Retiro de mercadería o proveedor» sin elegir proveedor. En el formulario usá «Proveedor (retiro en domicilio)» y seleccioná el proveedor (o enviá pickupSupplierId en la API).`,
        );
      }
    }

    const stopKeys = stopsNorm.map(
      (s) => `${s.locationId}:${s.pickupSupplierId ?? ''}`,
    );
    if (new Set(stopKeys).size !== stopKeys.length) {
      throw new BadRequestException(
        'Hay dos paradas iguales (mismo local y mismo proveedor).',
      );
    }

    for (let i = 0; i < stopsNorm.length - 1; i++) {
      const s = stopsNorm[i]!;
      if (s.locationId === data.originId && !s.pickupSupplierId) {
        throw new BadRequestException(
          'Solo la última parada puede ser el mismo local que el origen (p. ej. vuelta al depósito).',
        );
      }
    }

    const locIdsUniq = [...new Set(stopsNorm.map((s) => s.locationId))];
    const locations = await this.prisma.location.findMany({
      where: { id: { in: locIdsUniq } },
    });
    if (locations.length !== locIdsUniq.length) {
      const found = new Set(locations.map((l) => l.id));
      const missing = locIdsUniq.filter((id) => !found.has(id));
      throw new NotFoundException(
        missing.length
          ? `Locales de parada no encontrados: ${missing.join(', ')}. Si una parada es proveedor, el cliente debe enviar pickupSupplierId en esa parada (el servidor asigna el local de retiro).`
          : 'Uno o más locales de parada no existen',
      );
    }

    const lastIx = stopsNorm.length - 1;
    if (
      stopsNorm[0]!.pickupSupplierId &&
      stopsNorm[lastIx]!.locationId === data.originId
    ) {
      stopsNorm[lastIx]!.items = stopsNorm[0]!.items.map((it) => ({ ...it }));
    }

    const hasSupplierStop = stopsNorm.some((s) => s.pickupSupplierId);
    const lastNorm = stopsNorm[stopsNorm.length - 1]!;
    const lastIsReturnToOrigin =
      lastNorm.locationId === data.originId && !lastNorm.pickupSupplierId;
    if (hasSupplierStop && !lastIsReturnToOrigin) {
      const supplierItems = stopsNorm.flatMap((s) =>
        s.pickupSupplierId ? s.items : [],
      );
      if (supplierItems.length === 0) {
        throw new BadRequestException(
          'Hay una parada en proveedor sin ítems. Cargá los productos a retirar en esa parada.',
        );
      }
      const merged = mergeStopLineItemsByProductId(supplierItems);
      stopsNorm.push({
        locationId: data.originId,
        items: merged.map((it) => ({ ...it })),
      });
    }

    const locIds = stopsNorm.map((s) => s.locationId);
    const locIdsForOverlap = [
      ...new Set(locIds.filter((id) => id !== data.originId)),
    ];

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const draftOverlapsStops =
      locIdsForOverlap.length === 0
        ? null
        : await this.prisma.shipment.findFirst({
            where: {
              originId: data.originId,
              status: 'draft',
              createdAt: { gte: todayStart, lt: todayEnd },
              stops: { some: { locationId: { in: locIdsForOverlap } } },
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
      await this.assertMergePickupSupplier(
        data.originId,
        mergeInto.pickupSupplierId,
        data.pickupSupplierId,
      );
    } else {
      await this.assertPickupSupplierRules(data.originId, data.pickupSupplierId);
    }

    if (mergeInto) {
      let totalNewItems = stopsNorm.reduce((n, s) => n + s.items.length, 0);
      return this.prisma.$transaction(async (tx) => {
        let maxOrder = (
          await tx.shipmentStop.findMany({
            where: { shipmentId: mergeInto.id },
            orderBy: { sortOrder: 'asc' },
          })
        ).reduce((m, s) => Math.max(m, s.sortOrder), -1);

        for (const st of stopsNorm) {
          maxOrder += 1;
          const ns = await tx.shipmentStop.create({
            data: {
              shipmentId: mergeInto.id,
              locationId: st.locationId,
              pickupSupplierId: st.pickupSupplierId,
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

        const fullStopsAfterMerge = await tx.shipmentStop.findMany({
          where: { shipmentId: mergeInto.id },
          orderBy: { sortOrder: 'asc' },
          include: { items: true },
        });
        const hasSupplierInRoute = fullStopsAfterMerge.some(
          (s) => s.pickupSupplierId,
        );
        const lastAfterMerge =
          fullStopsAfterMerge[fullStopsAfterMerge.length - 1]!;
        const lastIsReturnToOriginMerge =
          lastAfterMerge.locationId === mergeInto.originId &&
          !lastAfterMerge.pickupSupplierId;
        if (hasSupplierInRoute && !lastIsReturnToOriginMerge) {
          const supplierDbItems = fullStopsAfterMerge
            .filter((s) => s.pickupSupplierId)
            .flatMap((s) => s.items);
          if (supplierDbItems.length === 0) {
            throw new BadRequestException(
              'Hay una parada en proveedor sin ítems en este envío; no se pudo armar la vuelta al depósito.',
            );
          }
          const merged = mergeDbShipmentItemsByProductId(
            supplierDbItems.map((it) => ({
              productId: it.productId,
              sentQty: it.sentQty,
              unitCost: it.unitCost,
              lotNumber: it.lotNumber,
              notes: it.notes,
            })),
          );
          maxOrder += 1;
          const returnStop = await tx.shipmentStop.create({
            data: {
              shipmentId: mergeInto.id,
              locationId: mergeInto.originId,
              sortOrder: maxOrder,
            },
          });
          for (const it of merged) {
            await tx.shipmentItem.create({
              data: {
                shipmentId: mergeInto.id,
                shipmentStopId: returnStop.id,
                productId: it.productId,
                sentQty: it.sentQty,
                unitCost: it.unitCost ?? undefined,
                lotNumber: it.lotNumber ?? undefined,
                notes: it.notes ?? undefined,
              },
            });
          }
          totalNewItems += merged.length;
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
            ...(!mergeInto.pickupSupplierId && data.pickupSupplierId?.trim()
              ? { pickupSupplierId: data.pickupSupplierId.trim() }
              : {}),
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

    const lastDest = stopsNorm[stopsNorm.length - 1]!.locationId;
    let routePolyline: string | null = null;
    let estimatedDurationMin: number | null = null;
    const stopPoints = await Promise.all(
      stopsNorm.map((s) => this.resolvePointForStopInput(s)),
    );
    const lastAddr = stopPoints[stopPoints.length - 1] ?? '';
    const middleAddrs = stopPoints.slice(0, -1).map((p) => p ?? '');
    const originPointMulti = await this.resolveOriginRoutePoint(
      data.originId,
      data.pickupSupplierId,
    );
    if (
      originPointMulti &&
      lastAddr &&
      middleAddrs.length === stopsNorm.length - 1 &&
      middleAddrs.every(Boolean)
    ) {
      const route = await this.googleMaps.getRouteWithWaypoints(
        originPointMulti,
        middleAddrs.filter(Boolean),
        lastAddr,
        false,
      );
      if (route) {
        routePolyline = route.polyline || null;
        estimatedDurationMin = route.durationMinTotal;
      }
    }

    const totalItems = stopsNorm.reduce((n, s) => n + s.items.length, 0);

    const { shipmentNumber, qrCode } = await this.allocateShipmentNumber(
      dateStr,
      todayStart,
      todayEnd,
    );

    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          shipmentNumber,
          originId: data.originId,
          pickupSupplierId: data.pickupSupplierId?.trim() || undefined,
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

      for (let i = 0; i < stopsNorm.length; i++) {
        const st = stopsNorm[i]!;
        const stop = await tx.shipmentStop.create({
          data: {
            shipmentId: shipment.id,
            locationId: st.locationId,
            pickupSupplierId: st.pickupSupplierId,
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

    const originAddress =
      (await this.resolveOriginRoutePoint(
        shipment.originId,
        shipment.pickupSupplierId,
      )) ?? undefined;
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
        .map((s) => this.stopRoutePointFromIncluded(s) ?? '')
        .filter(Boolean);
      const destAddr = this.stopRoutePointFromIncluded(last);
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
      const destAddress = shipment.destination
        ? locationRoutePoint(shipment.destination)
        : null;
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

    const skipOriginStockOut = this.isSupplierPickupRoundTripDetail(shipment);

    await this.prisma.$transaction(async (tx) => {
      // Create stock movements (shipment_out) at origin for each item
      if (!skipOriginStockOut) {
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
    /** Solo el retiro «virtual» (slug retiro / nombre típico) no lleva stock; la vuelta al depósito sí, aunque el ítem venga de proveedor. */
    const retiroLoc = await this.getRetiroMercaderiaLocation();
    const atSupplierPickup =
      Boolean(stop.pickupSupplierId) &&
      this.stopIsRetiroPickupPlaceholder(stop, { id: retiroLoc.id });
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

        if (!atSupplierPickup) {
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

    const originPointReorder = await this.resolveOriginRoutePoint(
      shipment.originId,
      shipment.pickupSupplierId,
    );
    const middleAddrs = ordered
      .slice(0, -1)
      .map((s) => this.stopRoutePointFromIncluded(s) ?? '');
    const lastAddr =
      this.stopRoutePointFromIncluded(ordered[ordered.length - 1]!) ?? '';
    let routePolyline: string | undefined;
    let estimatedDurationMin: number | undefined;
    let legs: { durationMin: number; distanceMeters: number; polyline: string | null }[] | null =
      null;
    if (
      originPointReorder &&
      lastAddr &&
      middleAddrs.every(Boolean) &&
      middleAddrs.length === ordered.length - 1
    ) {
      const r = await this.googleMaps.getRouteWithWaypoints(
        originPointReorder,
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
        origin: {
          select: {
            address: true,
            id: true,
            slug: true,
            latitude: true,
            longitude: true,
          },
        },
        stops: {
          orderBy: { sortOrder: 'asc' },
          include: {
            location: {
              select: {
                address: true,
                id: true,
                latitude: true,
                longitude: true,
              },
            },
            pickupSupplier: {
              select: {
                address: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });
    if (!sh || sh.stops.length === 0) return;

    const ordered = sh.stops;
    const last = ordered[ordered.length - 1]!;

    if (ordered.length === 1) {
      const o = await this.resolveOriginRoutePoint(
        sh.originId,
        sh.pickupSupplierId,
      );
      const d = this.stopRoutePointFromIncluded(last);
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

    const originPointRefresh = await this.resolveOriginRoutePoint(
      sh.originId,
      sh.pickupSupplierId,
    );
    const middleAddrs = ordered
      .slice(0, -1)
      .map((s) => this.stopRoutePointFromIncluded(s) ?? '');
    const lastAddr = this.stopRoutePointFromIncluded(last) ?? '';
    if (
      originPointRefresh &&
      lastAddr &&
      middleAddrs.every(Boolean) &&
      middleAddrs.length === ordered.length - 1
    ) {
      const r = await this.googleMaps.getRouteWithWaypoints(
        originPointRefresh,
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
