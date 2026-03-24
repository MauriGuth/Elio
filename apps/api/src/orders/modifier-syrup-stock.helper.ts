import type { Prisma } from '../../generated/prisma';

const EPS = 1e-6;

type ProductMini = { id: string; sku: string | null; name: string | null };

function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/**
 * Insumo genérico tipo «Sabor del syrup» en la preparación / receta (no un sabor real).
 * Los sabores reales suelen llamarse SYRUP VAINILLA, etc.
 */
export function isGenericSyrupPlaceholderProduct(p: ProductMini | null | undefined): boolean {
  if (!p) return true;
  const sku = (p.sku ?? '').toUpperCase();
  if (sku.includes('SABOR-SYRUP') || sku.includes('SABOR_SYRUP')) return true;
  if (sku.includes('SABOR_DEL_SYRUP')) return true;
  const n = normName(p.name);
  if (!n.includes('syrup')) return false;
  /** Sabor real: no quitar del mapa */
  if (
    /vainilla|vanilla|avellana|hazelnut|caramel|frut|chocolate|menta|maple|coco|cookies/i.test(
      p.name ?? '',
    )
  ) {
    return false;
  }
  if (/\bsabor\s+del\s+syrup\b/.test(n)) return true;
  if (n === 'syrup' || /^syrup\s*\(/.test(n)) return true;
  return false;
}

/** Grupo POS donde el cliente elige vainilla / avellana / caramel, etc. */
function isSyrupFlavorModifierGroupName(name: string | null | undefined): boolean {
  const n = normName(name);
  if (!n.includes('syrup') && !n.includes('sirope')) return false;
  if (n.includes('sabor')) return true;
  if (/\bsyrup\s+(doble|tazon|tazón|simple)/i.test(name ?? '')) return true;
  return false;
}

/**
 * La preparación (LATTE SABORIZADO …) suele traer una línea al genérico «Sabor del syrup».
 * Si el cliente eligió vainilla/avellana/etc. con insumo real enlazado:
 * - con Cant. > 0: se descuenta el real (líneas de modificador) y se elimina el genérico del mapa;
 * - con Cant. vacía/0: se reasigna al insumo real el mismo consumo que iba al genérico.
 */
export async function applySyrupFlavorSubstitution(
  tx: Prisma.TransactionClient,
  norm: Record<string, string[]> | null,
  consumption: Map<string, number>,
): Promise<void> {
  if (!norm || Object.keys(norm).length === 0) return;

  const optionIds = [...new Set(Object.values(norm).flat())];
  if (optionIds.length === 0) return;

  const options = await tx.productModifierOption.findMany({
    where: { id: { in: optionIds } },
    select: {
      id: true,
      group: { select: { id: true, name: true } },
    },
  });

  const syrupFlavorOption = options.find((o) =>
    isSyrupFlavorModifierGroupName(o.group?.name ?? null),
  );
  if (!syrupFlavorOption) return;

  const lines = await tx.productModifierStockLine.findMany({
    where: { optionId: syrupFlavorOption.id },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });

  /** Insumo real (SYRUP VAINILLA, …), aunque «Cant.» esté vacía en el panel (= 0 en DB). */
  const realLines = lines.filter(
    (l) =>
      l.product &&
      l.productId &&
      !isGenericSyrupPlaceholderProduct(l.product as ProductMini),
  );
  if (realLines.length === 0) return;

  const hasPositiveQty = realLines.some((l) => Number(l.quantity) > EPS);

  const consumptionIds = [...consumption.keys()].filter(
    (id) => Math.abs(consumption.get(id) ?? 0) >= EPS,
  );
  if (consumptionIds.length === 0) return;

  const productsById = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: consumptionIds } },
        select: { id: true, name: true, sku: true },
      })
    ).map((p) => [p.id, p]),
  );

  let totalGeneric = 0;
  const genericPids: string[] = [];
  for (const pid of consumptionIds) {
    const net = consumption.get(pid) ?? 0;
    const p = productsById.get(pid);
    if (p && isGenericSyrupPlaceholderProduct(p as ProductMini)) {
      totalGeneric += net;
      genericPids.push(pid);
    }
  }
  if (genericPids.length === 0) return;

  if (hasPositiveQty) {
    for (const pid of genericPids) consumption.delete(pid);
    return;
  }

  /** Panel con producto elegido pero Cant. vacía: mover todo el consumo del genérico al insumo real. */
  const targetPid = realLines[0]!.productId;
  for (const pid of genericPids) consumption.delete(pid);
  consumption.set(
    targetPid,
    (consumption.get(targetPid) ?? 0) + totalGeneric,
  );
}
