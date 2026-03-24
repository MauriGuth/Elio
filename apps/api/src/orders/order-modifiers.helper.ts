import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { computeVisibleModifierGroupIds } from './modifier-visibility.helper';

export function normalizeModifierSelections(
  raw: unknown,
): Record<string, string[]> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('modifierSelections debe ser un objeto');
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [groupId, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if (v) out[groupId] = [v];
    } else if (Array.isArray(v)) {
      const ids = v.filter((x) => typeof x === 'string') as string[];
      if (ids.length) out[groupId] = ids;
    } else {
      throw new BadRequestException(`Valor inválido para grupo de modificadores`);
    }
  }
  return Object.keys(out).length ? out : null;
}

export type ValidateModifierSelectionsOptions = {
  /** Si la receta del producto define grupos en ingredientes, solo esos se validan (POS). */
  onlyValidateGroupIds?: string[];
};

export async function validateModifierSelections(
  db: Prisma.TransactionClient | PrismaServiceLike,
  productId: string,
  raw: unknown,
  options?: ValidateModifierSelectionsOptions,
): Promise<Record<string, string[]> | null> {
  const normalized =
    raw === null || raw === undefined ? null : normalizeModifierSelections(raw);

  const restrict = options?.onlyValidateGroupIds;
  /** Con IDs de receta: cargar esos grupos aunque legacy tengan otro product_id. Sin filtro: grupos del producto + globales (null). */
  const groupsAll = await db.productModifierGroup.findMany({
    where:
      restrict !== undefined && restrict.length > 0
        ? { id: { in: restrict } }
        : {
            OR: [{ productId }, { productId: null }],
          },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (groupsAll.length === 0) {
    if (normalized && Object.keys(normalized).length > 0) {
      throw new BadRequestException('Este producto no admite modificadores');
    }
    return null;
  }

  /** `[]` = la receta no exige ningún grupo (ej. variantes ocultas por exclusión de ingrediente) */
  const allowed =
    restrict !== undefined ? new Set(restrict) : null;

  /** Con receta: mismo orden que ingredientes (`restrict`); sin receta: sortOrder del catálogo. */
  const byGroupId = new Map(groupsAll.map((g) => [g.id, g]));
  const groups =
    restrict != null && restrict.length > 0
      ? restrict
          .map((id) => byGroupId.get(id))
          .filter((g): g is (typeof groupsAll)[number] => Boolean(g))
      : groupsAll;

  if (allowed && normalized) {
    for (const key of Object.keys(normalized)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(
          'Grupo de modificadores no aplicable según la receta del producto',
        );
      }
    }
  }

  const visibleIds = new Set(
    computeVisibleModifierGroupIds(
      groups.map((g) => ({
        id: g.id,
        sortOrder: g.sortOrder,
        visibilityRule: g.visibilityRule,
        options: g.options,
      })),
      normalized ?? {},
    ),
  );

  const selections: Record<string, string[]> = {};
  if (normalized) {
    for (const [k, v] of Object.entries(normalized)) {
      if (!allowed || allowed.has(k)) {
        if (visibleIds.has(k)) selections[k] = v;
      }
    }
  }

  const groupsActive = groups.filter((g) => visibleIds.has(g.id));

  for (const g of groupsActive) {
    const selected = selections[g.id] ?? [];
    const optionIdSet = new Set(g.options.map((o) => o.id));

    if (g.required && selected.length === 0) {
      throw new BadRequestException(`Debés elegir opciones en "${g.name}"`);
    }
    if (g.minSelect > 0 && selected.length < g.minSelect) {
      throw new BadRequestException(
        `En "${g.name}" elegí al menos ${g.minSelect} opción(es)`,
      );
    }
    if (g.maxSelect > 0 && selected.length > g.maxSelect) {
      throw new BadRequestException(
        `En "${g.name}" podés elegir como máximo ${g.maxSelect} opción(es)`,
      );
    }
    for (const oid of selected) {
      if (!optionIdSet.has(oid)) {
        throw new BadRequestException(`Opción inválida en "${g.name}"`);
      }
    }
  }

  const groupIds = new Set(groups.map((g) => g.id));
  for (const key of Object.keys(selections)) {
    if (!groupIds.has(key)) {
      throw new BadRequestException('Grupo de modificadores desconocido');
    }
  }

  return Object.keys(selections).length ? selections : null;
}

/** Subconjunto de PrismaClient usado aquí (también encaja TransactionClient). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaServiceLike = { productModifierGroup: { findMany: (a: any) => Promise<any[]> } };

