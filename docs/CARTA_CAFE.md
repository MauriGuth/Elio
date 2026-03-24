# Carta de café (pocillo, jarrito, tazón, etc.)

## Documento de referencia (canónico)

| | |
|--|--|
| **PDF oficial** | [`docs/carta/CARTA-21_3.pdf`](carta/CARTA-21_3.pdf) |
| **Notas** | 12 páginas (versión **21/3**). El seed carga **toda la carta base** en `CARTA-*`: cafés, take, té, limonadas, licuados, smoothies, desayunos, pastelería, **y bloque cocina** (croissants/waffles/tostados, saludables, sandwiches, wraps, ensaladas, pokes, keto) según PDF p.9–12. |

**Porciones torta/tarta con nombre** (p.8–9): el seed genera SKUs `CARTA-TORTA-*` (1/8) y `CARTA-TARTA-*` (1/6) para toda la lista del PDF. Los ítems `CARTA-PAST-*` anteriores siguen existiendo; podés unificar en Stock si preferís un solo SKU por sabor.

**Take:** en recetas take (cafés 8/12oz, limonadas, licuados/smoothies take 450ml, cafés especiales take 8/12oz) se descuenta **`CARTA-INS-PACK-TAKE`** (collarín/tapa/revolvedor). Al **cerrar el pedido**, el backend descuenta **`CARTA-INS-POSAVASOS`**: **1 unidad cada 2 unidades take** en el mismo ticket (las líneas take se detectan por consumo de pack take vía opción POS o receta fija). Corré el seed carta café para crear el insumo posavasos.

**Cafés especiales solo en take:** productos `CARTA-CAFE-ESP-TAKE-8OZ` y `CARTA-CAFE-ESP-TAKE-12OZ` con recetas del PDF p.4–5 (Mocaccino, Capuccinos, Latte saborizado, Submarinos).

**Variantes dulce/salado:** `CARTA-CRO-JAMON-QUESO` y `CARTA-CLAS-MEDIALUNA` piden en el POS **Dulce** o **Salado/Salada** antes de cargar la línea.

**Pastelería PDF p.8 (agregados):** `CARTA-MEDIALUNA-SOLO`, `CARTA-CROISSANT-SOLO` (medialuna/croissant solos dulce/salado); `CARTA-BUDIN-RODAJA` (rodaja limón… carrot); licuados salón **450ml** `CARTA-LICUADO-SALON-450` (modal como smoothie: tipo + base líquida) y **jugo verde** `CARTA-LICUADO-SALON-JUGO-VERDE`; alfajores **Choco y frutos rojos** / **Nuez y DDL**; cuadrados (brownie clásico, red velvet, brownie cheesecake, crumble manzana, limón, pastafrola, coco+DDL) y **cuadrados sin TACC** (coco+DDL, limón, brownie, crumble manzana). **DESA AMERICANO** lleva receta con **3 tostadas** (PAN).

Si actualizás el PDF en tu PC, copiá de nuevo el archivo a `docs/carta/CARTA-21_3.pdf` (o versioná el nombre) y actualizá esta sección.

---

## Carga automática desde el PDF

En la API:

```bash
cd apps/api && npm run prisma:seed-carta-cafe-pdf
```

**Importante:** el script corre contra la base definida en `DATABASE_URL` del entorno donde lo ejecutes. Si en la web (Stock) no ves `CLASICO POCILLO` / `CARTA-POCILLO`, en esa base **aún no se cargó el seed** (ej. solo lo corriste en local). En Railway: *Settings → Variables* con `DATABASE_URL`, luego en el shell del servicio API ejecutá el mismo comando, o corré el seed desde tu máquina apuntando a la URL de Postgres de producción.

### Pestañas del POS (categorías)

El seed **crea/actualiza categorías** con slug `carta-*` (ej. `carta-cafes-especiales`, `carta-tragos-calientes`) y asigna cada producto `CARTA-*` a la categoría que corresponde al bloque del menú (como el PDF). En el POS de mesa, las pestañas **«Todos» + categorías** muestran esos nombres y el listado filtra por `categoryId`. El orden de las pestañas sigue el **`sortOrder`** de cada categoría (definido en `seed-carta-cafe-pdf.ts` → `CARTA_POS_CATEGORY_DEFS`). Si agregás un SKU nuevo, actualizá `getCartaPosCategorySlug()` en ese script.

**Mismo patrón que CLASICO POCILLO / DOBLE:** en **Cafés especiales**, **Tragos calientes** y **Tragos fríos** (salón) hay **un solo producto vendible** con grupo de modificadores obligatorio (`Preparación — …`): al tocarlo en el POS se abre el modal con **radios por variedad** y exclusiones de insumos; en **Stock → Editar receta** se editan las **líneas por opción** (como las variantes Café solo / Cortado del pocillo). SKUs: `CARTA-CAFES-ESPECIALES-SALON`, `CARTA-TRG-CALIENTES`, `CARTA-TRG-FRIOS`. **ICE LATTE SABORIZADO** sigue como producto aparte (`CARTA-TRG-FRIO-ICE-LATTE-SAB`, tres sabores). Los SKUs viejos por trago suelto se desactivan al correr el seed (`OBSOLETE_MERGED_CARTA_SKUS`).

### Qué carga el seed (resumen)

| Tipo | Ejemplos de SKU / nombre |
|------|---------------------------|
| Clásicos | `CARTA-POCILLO` … `CLASICO TAZON` |
| Take café | `CARTA-TAKE-8OZ`, `CARTA-TAKE-12OZ` |
| Limonadas / jugo | `CARTA-LIMONADA-TAKE-8OZ`, `12OZ`, salón **`LIMONADA EN COFFEE 450ML`** (`CARTA-LIMONADA-SALON-450`: 4 variedades; premix/almíbar + hielo + `CARTA-INS-SORBETE`, `RODAJA-LIMON`, `FLOR-MENTA`), take `CARTA-LIMONADA-TAKE-450`, **`JUGO DE NARANJA EXPRIMIDO`** (`CARTA-JUGO-NARANJA-EXPRIMIDO`: GRANDE y CHICO CARTA llevan sorbete + rodaja naranja; CHICO DESAYUNO solo jugo + hielo) |
| Licuado / smoothie | `CARTA-LICUADO` (jarrito); **450ml** un producto salón y uno take: **`LICUADO SALON 450ML`**, **`LICUADO TAKE 450ML`** (`CARTA-LICUADO-SALON-450`, `CARTA-LICUADO-TAKE-450`) — **2 grupos como smoothie**: (tipo) multifruta / banana / 4 pulpas + (base líquida); el POS muestra 3 líquidos según el tipo. **Jugo verde** `CARTA-LICUADO-SALON-JUGO-VERDE`. `CARTA-SMOOTHIE` / `CARTA-SMOOTHIE-TAKE-450`. |
| Café especialidad (grano) | `CARTA-CAFE-ESP-GRANO-JARRITO` (10 orígenes tipo PDF) |
| Prep / cremera | `CARTA-PREP-COLD-BREW-1L`, `CARTA-CREMERA-FUSION-VAINILLA` |
| Té | `CARTA-TE-HEBRAS` (etiquetas PDF: BLACK ORIGINAL … GREEN FRESH). Cada variedad descuenta su insumo de hebras: `CARTA-INS-TE-BLACK-ORIGINAL`, `…-BLACK-CHAI-COCOA`, etc. (no el genérico `CARTA-INS-HEBRAS-TE` en la receta por opción). |
| Latte saborizado | `LATTE SABORIZADO TAZON`, `LATTE SABORIZADO DOBLE`, `ICE LATTE SABORIZADO` — **2 grupos en el POS**: base café/leche (o base fría en ice latte) + **Sabor del syrup** (Avellana / Caramel / Vainilla). El stock suma ambas opciones. |
| Licuado take 450 | `CARTA-LICUADO-TAKE-450` — mismo modal que smoothie (2 grupos); líquidos **280ml** / **240ml** / **320ml** según tipo; pack en opciones tipo take. |
| Licuado salón 450 | `CARTA-LICUADO-SALON-450` — **220ml** / **240ml** / **320ml** según tipo. **Jugo verde**: SKU aparte. |
| Smoothies 450 | `CARTA-SMOOTHIE` / `CARTA-SMOOTHIE-TAKE-450` — **2 grupos obligatorios** (como latte saborizado): sabor (pulpa + hielo + sorbete [+ pack en take]) + base (leche / jugo / agua **210ml**). |
| Especiales / tragos | `MOCACCINO`, `CAPUCCINO*`, `SUBMARINO*`, `CAFE BOMBON`, `ICE COFFEE`, `AFFOGATO`, etc. |
| Desayunos | Combos `DESA-*` con **opciones de preparación** (tipo de pan / medialunas / laminados, etc.; café con leche + jugo chico en receta base). **Tostadas + 2 dips** y **cambio infusión/jugo grande** siguen como nota operativa hasta multi-select. También `TOAST-PALTA`, `CROISSANT`, `WAFFLE` |
| Clásicos + café | `CARTA-CLAS-MEDIALUNA`, `BUDIN`, `COOKIE` |
| Pastelería | Porciones y alfajores `CARTA-PAST-*`, cuadrados y sin TACC, formatos `CARTA-MEDIALUNA-SOLO`, `CARTA-CROISSANT-SOLO`, `CARTA-BUDIN-RODAJA` |
| Cocina p.9–11 | `CARTA-CRO-*`, `WAFFLE`, `TOSTADO`, `SALUD-*`, `SAND-*`, `MONT-*`, `WRAP-*`, `HAMB-*`, `ENS-*`, `POKE-*` |
| Keto p.12 | `CARTA-KETO-*`, `JUGO VERDE` |

Insumos: además de los de siempre, el seed crea `CARTA-INS-JUGO-LIMON`, `JUGO-NARANJA`, `PULPA-FRUTAS`, `YOGURT`, `PAN`, `HUEVO`, `PALTA`, `MIEL`, `MEZCLA-TORTA`, etc.

Las **cantidades de receta** son orientativas: revisalas contra tu PDF y ajustá en Stock / Recetas.

Crea/actualiza:

- **Insumos** `CARTA-INS-*` (café grano, agua, leche, leche espuma, soda).
- **Productos vendibles** (con `consumeRecipeOnSale`):  
  **CLASICO POCILLO**, **CLASICO JARRITO**, **CLASICO DOBLE**, **CLASICO TAZON** (SKUs `CARTA-POCILLO`, etc.).

Si ya tenías nombres viejos en la base, solo renombrá sin borrar datos:

```bash
cd apps/api && npm run prisma:rename-clasico-carta
```
- **Grupos de modificadores** globales `Preparación — Pocillo|Jarrito|Doble|Tazón` con las variantes del PDF (café solo, cortado, café con leche, machiato, …; Pocillo incluye también ristretto, latte, lágrima, americano). Cada variante descuenta **`CARTA-INS-GALLETA-COOKIE` ×1** («+ 1 cookie» del PDF).
- **Receta** por producto con el grupo ya vinculado al ingrediente (consumo por opción según líneas de stock).

Podés re-ejecutar el script: borra recetas de esos SKUs y grupos con el mismo nombre y vuelve a crear todo.

---

Guía para modelar en Nova/Elio lo que tenés en la carta en PDF (formatos + tipo de café + opcionales).

## 1. Productos de venta

Creá **un producto vendible por formato** (ej. *Clásico pocillo*, *Clásico jarrito*, *Clásico tazón*), con precio base del formato si aplica.

- Marcá **Vendible** y, si el café se arma en el momento y **no** stockás el “plato terminado”, activá **Descontar insumos al vender** en Stock → Editar producto.  
  Así, al **cerrar la mesa**, el sistema descuenta **café, agua, leche**, etc. según la receta y las opciones elegidas, no una unidad del producto carta.

## 2. Receta por producto

En **Recetas**, asociá la receta al producto de salida (ej. *Clásico pocillo*):

- **Rendimiento** coherente con la venta (ej. `1` unidad).
- Ingredientes **fijos** (sin grupo de modificadores): café molido, agua, etc. con cantidades por rendimiento según tu PDF.
- Para **variantes** (café solo, cortado, café con leche, con torta, etc.):
  - Definí un **grupo global** en *Modificadores de carta* (ej. “Tipo de café” o “Incluye”).
  - En la receta, en el ingrediente que representa esa variante, asigná **Grupo de modificadores** y cargá **por cada opción** las cantidades de insumo (pestaña de variantes / líneas de stock por opción).

El POS mostrará el modal **antes de cargar la línea** cuando la receta tenga grupos vinculados a ingredientes.

## 3. Opcionales con precio

En cada **opción** del grupo podés poner **Δ precio** y **líneas de stock** (porción de torta, leche extra, etc.).

## 4. Torta / variedad

Podés usar otro grupo (ej. “Variedad de torta”) con opciones *Cheesecake*, *Brownie*, etc., cada una con su precio y sus insumos en las líneas de stock de la opción.

## 5. Cierre de venta y stock

- Con **Descontar insumos al vender**: en el cierre se descuentan insumos de la receta + lo configurado en las opciones elegidas.
- Si el cliente saca un ingrediente en el POS (“sin X”), esos IDs se guardan y **no** se descuenta ese insumo base.

## 6. Resumen del PDF

Tu PDF lista por **formato** (pocillo, jarrito, …) las **variantes** (solo, cortado, …) con **gramos/ml** por insumo: replicá esas cantidades en la receta o en las líneas por opción según corresponda.
