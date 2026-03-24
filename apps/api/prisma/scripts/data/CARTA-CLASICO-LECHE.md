# Café clásico: cantidades de leche y «Tipo de leche»

## Insumo «TIPO DE LECHE»

En preparación clásica el insumo de leche líquida es **`CARTA-INS-TIPO-LECHE`** (`TIPO DE LECHE (cart)`), clave **`TIPO_LECHE`** en datos. Así no se confunde con otros productos cuyo nombre contiene “leche” (p. ej. arroz con leche). Al cobrar, el POS sigue sustituyendo por leche entera / descremada / almendras según el cliente.

## Dónde van los ml (Tazón vs Pocillo vs …)

Las **cantidades distintas** (café con leche tazón ≠ lágrima tazón ≠ jarrito, etc.) están en **`carta-clasicos-formats.ts`**, en cada **variante de preparación** (`stock.TIPO_LECHE` y `stock.LECHE_ESPUMA`).

Cada **formato** (POCILLO, JARRITO, DOBLE, TAZÓN) es un **producto POS distinto**, con su propia receta y su propia grilla de preparación. Por eso en el panel ves un grupo **«Tipo de leche — CLASICO TAZON»**, otro **«… POCILLO»**, etc.: es **una fila de grupo por producto**, no porque haya que cargar ml distintos en cada uno.

## Qué hace el grupo «Tipo de leche»

Ese grupo solo define **qué insumo** se descuenta (entera / descremada / almendras). Los **ml** salen siempre de la opción de **Preparación** elegida; al cerrar la venta el API **reemplaza** leche genérica por el insumo correcto **con la misma cantidad total** que ya llevaba la preparación.

No hace falta (ni es posible en el modelo actual) poner ml en las opciones de «Tipo de leche».

## Dónde cargar los ml en el panel (Stock → Modificadores)

1. Abrí el producto, ej. **CLASICO JARRITO**.
2. Entrá a **Modificadores de carta** (o el mismo listado global de grupos vinculado a la receta).
3. Abrí el grupo **Preparación — Jarrito** (no «Tipo de leche»).
4. Tocá el ícono de libro (**Insumos por venta**) en **«Café con leche»**, **«Lágrima»**, **«Cortado»**, etc. — ahí van los ml de leche **para esa preparación en ese formato**.
5. Repetí en **CLASICO TAZÓN**, **CLASICO DOBLE**, etc.: cada uno es otro producto con otra grilla.

## Recarga

Tras cambiar definiciones: `cd apps/api && npm run prisma:reload-clasico-combo`

El script resuelve la clave **LECHE** solo a insumo **base** (SKU `CARTA-INS-LECHE` o nombre sin almendra/descremada/espuma). Si antes las líneas quedaron con otro producto (ej. ALM-MANI), **volver a correr el reload** reescribe las líneas de preparación con la leche correcta.
