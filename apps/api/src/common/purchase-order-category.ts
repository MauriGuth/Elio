/**
 * Pedidos de compra / reposición: categorías de **producto** o **insumo** comprables.
 * Incluye `tipo-producto`, `tipo-insumos`, slugs legacy (`insumos`, `producto`) y familias
 * cuyo slug indique insumos/productos (p. ej. `familia-insumos`). Excluye `agrupar-*` y
 * familias que no parezcan catálogo de compra.
 */
export function isCategorySlugAllowedForPurchaseOrders(
  categorySlug: string | null | undefined,
): boolean {
  if (!categorySlug || typeof categorySlug !== 'string') {
    return false;
  }
  const s = categorySlug.toLowerCase().trim();

  if (s.startsWith('agrupar-')) {
    return false;
  }

  if (s.startsWith('familia-')) {
    return (
      s.includes('insumo') ||
      s.includes('producto') ||
      s.includes('deposito') ||
      s.includes('compra') ||
      s.includes('fruto') ||
      s.includes('seco') ||
      s.includes('alimento') ||
      s.includes('mercader')
    );
  }

  /** Cualquier slug que identifique insumos (p. ej. mercaderia-insumos), excepto agrupaciones. */
  if (s.includes('insumo')) {
    return true;
  }

  if (s === 'tipo-producto' || s.startsWith('tipo-producto')) {
    return true;
  }
  if (
    s === 'tipo-insumos' ||
    s === 'tipo-insumo' ||
    s.startsWith('tipo-insumo')
  ) {
    return true;
  }

  if (
    s === 'insumos' ||
    s === 'insumo' ||
    s === 'producto' ||
    s === 'productos'
  ) {
    return true;
  }

  return false;
}
