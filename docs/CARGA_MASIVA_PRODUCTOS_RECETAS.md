# Carga masiva de productos y recetas (10.000+ ítems)

## ¿PostgreSQL aguanta?

**Sí.** PostgreSQL está preparado para millones de filas. En Elio:

- **Productos**: ~10.000 filas es un volumen bajo para Postgres.
- **Recetas**: idem; 10.000 recetas es manejable.
- **RecipeIngredient**: si cada receta tiene ~10 ingredientes, serían ~100.000 filas; también es un volumen normal.

En `docs/TECH_REQUIREMENTS.md` ya se define el catálogo como **escalable hasta 10.000 productos**. Así que el diseño del sistema contempla este tamaño.

### Índices actuales (schema Prisma)

Los modelos ya tienen índices que ayudan a las consultas típicas:

| Tabla | Índices |
|-------|--------|
| **Product** | `categoryId`, `barcode`, `isActive`, `isSellable` |
| **Recipe** | `productId`, `parentId`, `createdById`, `isActive` |
| **RecipeIngredient** | `recipeId`, `productId` |

Con esto, listados filtrados, búsquedas por categoría y joins producto–receta se mantienen rápidos.

---

## Recomendaciones para la carga inicial

Para cargar 10.000+ productos y recetas sin saturar la API ni la base de datos:

### 1. Inserción en lotes (batch)

- **No** insertar de a un registro por request (10.000 requests = lento y frágil).
- **Sí** usar inserciones en batch de 100–500 registros por transacción.

Ejemplo conceptual con Prisma:

```ts
const BATCH_SIZE = 200;
for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
  const chunk = allProducts.slice(i, i + BATCH_SIZE);
  await prisma.$transaction(
    chunk.map((p) =>
      prisma.product.upsert({
        where: { sku: p.sku },
        create: p,
        update: p,
      })
    )
  );
}
```

### 2. Usar transacciones por lote

- Cada lote dentro de una transacción: si falla un lote, solo se revierte ese lote y podés reintentar.
- Así evitás timeouts de transacciones muy largas (decenas de miles de inserts en una sola transacción).

### 3. Orden sugerido si hay dependencias

1. **Categorías** (si se cargan desde el mismo origen).
2. **Productos** (dependen de categorías).
3. **Recetas** (pueden depender de productos).
4. **RecipeIngredient** (dependen de receta y producto).

Así no violás FKs y el orden de carga es claro.

### 4. Carga fuera del request HTTP (recomendado para 10k+)

- **Script o job** (Node/TS) que lee CSV/JSON y usa `PrismaService` o `prisma` directamente en lotes.
- Ejemplo: `apps/api/prisma/scripts/bulk-load-products.ts` que se ejecuta con `npx ts-node` o desde un comando `pnpm run seed:products`.
- Así no dependés de timeouts de la API (30–60 s) ni de memoria del proceso web.

### 5. Opcional: desactivar triggers/checks durante la carga

- Si en el futuro agregás triggers pesados o checks costosos, podés valorar desactivarlos durante la importación masiva y volver a activarlos después.
- Con el schema actual de Elio no es necesario.

---

## Uso diario con 10.000+ productos/recetas

- **Listados**: usar **paginación** siempre (ej. `page`, `per_page`); la API ya está pensada para eso.
- **Búsqueda**: filtrar por categoría, SKU, código de barras o nombre; los índices ayudan.
- **Stock y recetas**: las consultas por `productId` / `recipeId` están indexadas; no deberías notar lentitud.

Si más adelante el catálogo crece mucho (por ejemplo 100.000+ productos), se puede evaluar:

- Índices adicionales según filtros nuevos.
- Búsqueda full-text en nombre/descripción.
- Cache (Redis) para listados muy consultados.

Para 10.000 productos y recetas, con los índices actuales y carga en batch, PostgreSQL y Elio están en buen estado.
