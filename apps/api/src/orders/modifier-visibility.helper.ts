import { Prisma } from '../../generated/prisma';

export type ModifierVisibilityRule = {
  whenPriorGroupSortOrder: number;
  whenSelectedOptionLabels: string[];
  /** Opcional: desambigúa si hay varios grupos con el mismo sortOrder. */
  whenPriorGroupId?: string;
  /** Opcional: múltiples grupos de referencia (OR). */
  whenPriorGroupIds?: string[];
};

/** Misma preparación con/sin tildes (ej. «Café con leche» vs «Cafe con leche») para reglas de visibilidad. */
export function normalizeModifierLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Grupos visibles según `visibilityRule`. El array devuelto respeta el orden de entrada de `groups`
 * (p. ej. orden de la receta); la resolución de «grupo previo» usa sortOrder del catálogo.
 */
export function computeVisibleModifierGroupIds(
  groups: Array<{
    id: string;
    sortOrder: number;
    visibilityRule: Prisma.JsonValue | null;
    options: { id: string; label: string }[];
  }>,
  selections: Record<string, string[]> | null | undefined,
): string[] {
  const sel = selections ?? {};
  const sortedForRule = [...groups].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const visible: string[] = [];
  for (const g of groups) {
    if (g.visibilityRule == null) {
      visible.push(g.id);
      continue;
    }
    const rule = g.visibilityRule as ModifierVisibilityRule;
    if (
      typeof rule.whenPriorGroupSortOrder !== 'number' ||
      !Array.isArray(rule.whenSelectedOptionLabels)
    ) {
      visible.push(g.id);
      continue;
    }
    const r = rule as ModifierVisibilityRule;
    const priorIds = Array.isArray(r.whenPriorGroupIds)
      ? r.whenPriorGroupIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      : [];
    const priors =
      priorIds.length > 0
        ? priorIds
            .map((id) => sortedForRule.find((x) => x.id === id))
            .filter((x): x is (typeof sortedForRule)[number] => Boolean(x))
        : [
            typeof r.whenPriorGroupId === 'string' && r.whenPriorGroupId
              ? sortedForRule.find((x) => x.id === r.whenPriorGroupId) ??
                sortedForRule.find(
                  (x) => x.sortOrder === rule.whenPriorGroupSortOrder,
                )
              : sortedForRule.find(
                  (x) => x.sortOrder === rule.whenPriorGroupSortOrder,
                ),
          ].filter((x): x is (typeof sortedForRule)[number] => Boolean(x));
    // Sin grupo previo resoluble en `groups` (ej. regla apunta a un sortOrder/id que no está en la receta),
    // no marcar como visible: si no, el API exige opciones que el POS nunca mostró.
    if (priors.length === 0) {
      continue;
    }
    let ok = false;
    for (const prior of priors) {
      const picked = sel[prior.id]?.[0];
      if (!picked) continue;
      const opt = prior.options.find((o) => o.id === picked);
      const label = opt?.label ?? '';
      const labelNorm = normalizeModifierLabel(label);
      if (
        rule.whenSelectedOptionLabels.some(
          (allowed) => normalizeModifierLabel(allowed) === labelNorm,
        )
      ) {
        ok = true;
        break;
      }
    }
    if (ok) {
      visible.push(g.id);
    }
  }
  return visible;
}

export function stripSelectionsForHiddenModifierGroups(
  groups: Parameters<typeof computeVisibleModifierGroupIds>[0],
  selections: Record<string, string[]>,
): Record<string, string[]> {
  const visible = new Set(computeVisibleModifierGroupIds(groups, selections));
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(selections)) {
    if (visible.has(k)) out[k] = v;
  }
  return out;
}
