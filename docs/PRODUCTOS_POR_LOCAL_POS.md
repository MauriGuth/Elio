# Productos por local – Cajas y mesas (POS)

## Cómo funciona la distribución

No todos los productos van a todos los locales. La asignación se define así:

- **StockLevel** en la base de datos: cada producto tiene uno o más registros en `stock_levels` por local. Si un producto tiene un `StockLevel` para un local, ese producto **está disponible** en el POS (cajas y mesas) de ese local.
- Los precios por local se guardan en `stock_levels.sale_price` (y si es null se usa `products.sale_price`).

## Origen de los datos (articulos_carta.json)

Al cargar con `npm run prisma:load-articulos`:

| Campo en JSON | Locales donde se crea stock |
|---------------|-----------------------------|
| `precio_coffee_store` definido | Todos los locales tipo **CAFE** |
| `precio_dorado` definido | Locales cuyo nombre o slug contiene **"dorado"** |
| `precio_posada` definido | Locales cuyo nombre o slug contiene **"posada"** o **"dinosaurio"** |

Ejemplos:

- Un artículo con solo `precio_dorado` → solo en el local Dorado.
- Un artículo con `precio_coffee_store` y `precio_dorado` → en todos los cafés y en Dorado.
- Un artículo con los tres precios → en todos los cafés, en Dorado y en La Posada del Dinosaurio.

## Comportamiento en el sistema

1. **API de productos**  
   `GET /products?locationId=xxx` devuelve solo productos que tienen stock (algún `StockLevel`) en ese local. El POS (mesas y caja) usa este filtro con el local seleccionado.

2. **POS Mesas**  
   Al abrir una mesa, se cargan solo los productos con stock en el local de esa mesa.

3. **POS Caja**  
   En la pestaña de productos y en el micro balance se usan productos del local de la caja (vía `locationId` o endpoints que ya filtran por local).

## La Posada del Dinosaurio – Cajas y mesas

Para dejar habilitado el sistema de cajas y mesas en **La Posada del Dinosaurio**:

```bash
cd apps/api
npm run prisma:setup-posada
```

El script:

- Busca el local por nombre/slug ("posada" o "dinosaurio").
- Pone `hasTables = true`.
- Crea **Caja Principal** si no hay ninguna caja.
- Crea **16 mesas** (Mesa 1..16) si no existen.

El local debe existir antes (creado desde el dashboard o con datos que referencien "La Posada del Dinosaurio"). Los productos con `precio_posada` en el JSON ya tendrán stock en ese local después de `prisma:load-articulos`.
