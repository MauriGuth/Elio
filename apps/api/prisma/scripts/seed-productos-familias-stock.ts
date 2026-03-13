/**
 * Actualiza/agrega productos según listado por familia (imágenes planilla).
 * - Todos los productos quedan con stock en DORADO (0 si no existía).
 * - Los de familias barista, cafe especial, barista-take, bebidas-liquado, bebidas-smoothie
 *   además quedan con stock en todas las ubicaciones tipo CAFE ("todos los coffees").
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { LocationType, PrismaClient } from '../../generated/prisma';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Familias que además deben tener stock en todos los locales tipo CAFE */
const FAMILIAS_EN_COFFEES = new Set([
  'barista',
  'cafe-especial',
  'barista-take',
  'bebidas-liquado',
  'bebidas-smoothie',
]);

/** Producto y familia (slug de categoría). */
const PRODUCTOS_FAMILIA: Array<{ name: string; family: string }> = [
  // Imagen 1 – APERITIVO
  { name: 'APEROL SPRITZ', family: 'aperitivo' },
  { name: 'APER. CAMPARI ORANGE', family: 'aperitivo' },
  { name: 'APER. CYNAR JULEP', family: 'aperitivo' },
  { name: 'CLEOPATRA', family: 'aperitivo' },
  // Imagen 1 – BARISTA (cafés y tés)
  { name: 'AMERICANO TAZON', family: 'barista' },
  { name: 'AMERICANO DOBLE', family: 'barista' },
  { name: 'AMERICANO JARRITO', family: 'barista' },
  { name: 'AMERICANO POCILLO', family: 'barista' },
  { name: 'BRASIL MEDIUM TAZON', family: 'barista' },
  { name: 'BRASIL MEDIUM DOBLE', family: 'barista' },
  { name: 'BRASIL MEDIUM JARRITO', family: 'barista' },
  { name: 'CAFÉ CON LECHE TAZON', family: 'barista' },
  { name: 'CAFÉ CON LECHE DOBLE', family: 'barista' },
  { name: 'CAFÉ CON LECHE JARRITO', family: 'barista' },
  { name: 'CAFÉ SOLO TAZON', family: 'barista' },
  { name: 'CAFÉ SOLO DOBLE', family: 'barista' },
  { name: 'CAFÉ SOLO JARRITO', family: 'barista' },
  { name: 'CAFÉ SOLO POCILLO', family: 'barista' },
  { name: 'CORTADO TAZON', family: 'barista' },
  { name: 'CORTADO DOBLE', family: 'barista' },
  { name: 'CORTADO JARRITO', family: 'barista' },
  { name: 'CORTADO POCILLO', family: 'barista' },
  { name: 'DARK TAZON', family: 'barista' },
  { name: 'DARK DOBLE', family: 'barista' },
  { name: 'DARK JARRITO', family: 'barista' },
  { name: 'DARK POCILLO', family: 'barista' },
  { name: 'DECAFF TAZON', family: 'barista' },
  { name: 'DECAFF DOBLE', family: 'barista' },
  { name: 'DECAFF JARRITO', family: 'barista' },
  { name: 'DECAFF POCILLO', family: 'barista' },
  { name: 'ETIOPIA TAZON', family: 'barista' },
  { name: 'ETIOPIA DOBLE', family: 'barista' },
  { name: 'ETIOPIA JARRITO', family: 'barista' },
  { name: 'ETIOPIA POCILLO', family: 'barista' },
  { name: 'HONDURAS TAZON', family: 'barista' },
  { name: 'HONDURAS DOBLE', family: 'barista' },
  { name: 'HONDURAS JARRITO', family: 'barista' },
  { name: 'HONDURAS POCILLO', family: 'barista' },
  { name: 'INDIA TAZON', family: 'barista' },
  { name: 'INDIA DOBLE', family: 'barista' },
  { name: 'INDIA JARRITO', family: 'barista' },
  { name: 'INDIA POCILLO', family: 'barista' },
  { name: 'LAGRIMA TAZON', family: 'barista' },
  { name: 'LAGRIMA DOBLE', family: 'barista' },
  { name: 'LAGRIMA JARRITO', family: 'barista' },
  { name: 'LAGRIMA POCILLO', family: 'barista' },
  { name: 'LATTE TAZON', family: 'barista' },
  { name: 'LATTE DOBLE', family: 'barista' },
  { name: 'LATTE JARRITO', family: 'barista' },
  { name: 'LATTE POCILLO', family: 'barista' },
  { name: 'MACHIATTO TAZON', family: 'barista' },
  { name: 'MACHIATTO DOBLE', family: 'barista' },
  { name: 'MACHIATTO JARRITO', family: 'barista' },
  { name: 'MACHIATTO POCILLO', family: 'barista' },
  { name: 'NICARAGUA TAZON', family: 'barista' },
  { name: 'NICARAGUA DOBLE', family: 'barista' },
  { name: 'NICARAGUA JARRITO', family: 'barista' },
  { name: 'NICARAGUA POCILLO', family: 'barista' },
  { name: 'PAPUA TAZON', family: 'barista' },
  { name: 'PAPUA DOBLE', family: 'barista' },
  { name: 'PAPUA JARRITO', family: 'barista' },
  { name: 'PAPUA POCILLO', family: 'barista' },
  { name: 'PASSION TAZON', family: 'barista' },
  { name: 'PASSION DOBLE', family: 'barista' },
  { name: 'PASSION JARRITO', family: 'barista' },
  { name: 'PASSION POCILLO', family: 'barista' },
  { name: 'PERU TAZON', family: 'barista' },
  { name: 'PERU DOBLE', family: 'barista' },
  { name: 'PERU JARRITO', family: 'barista' },
  { name: 'PERU POCILLO', family: 'barista' },
  { name: 'RISTRETTO POCILLO', family: 'barista' },
  { name: 'RUANDA TAZON', family: 'barista' },
  { name: 'RUANDA DOBLE', family: 'barista' },
  { name: 'RUANDA JARRITO', family: 'barista' },
  { name: 'RUANDA POCILLO', family: 'barista' },
  { name: 'SALVADOR TAZON', family: 'barista' },
  { name: 'SALVADOR DOBLE', family: 'barista' },
  { name: 'SALVADOR JARRITO', family: 'barista' },
  { name: 'SALVADOR POCILLO', family: 'barista' },
  { name: 'SANTOS TAZON', family: 'barista' },
  { name: 'SANTOS DOBLE', family: 'barista' },
  { name: 'SANTOS JARRITO', family: 'barista' },
  { name: 'SANTOS POCILLO', family: 'barista' },
  { name: 'TE BLACK ORIGINAL', family: 'barista' },
  { name: 'TE BLACK ORANGE', family: 'barista' },
  { name: 'TE BLACK CHAI COCOA', family: 'barista' },
  { name: 'TE GREEN FRESH', family: 'barista' },
  { name: 'TE BERRY RED', family: 'barista' },
  { name: 'TE HERBAL DELIGHT', family: 'barista' },
  { name: 'TE PATAGONIAN BERRIES', family: 'barista' },
  // Imagen 1 – BEBIDAS
  { name: 'ALMIBAR DE ACAI', family: 'bebidas' },
  { name: 'ALMIBAR FRUTOS ROJOS', family: 'bebidas' },
  { name: 'ALMIBAR GINGER ALE', family: 'bebidas' },
  { name: 'ALMIBAR HIERBAS HERBACED', family: 'bebidas' },
  { name: 'ALMIBAR MARACUYA', family: 'bebidas' },
  { name: 'ALMIBAR SIMPLE', family: 'bebidas' },
  { name: 'HIELO ESFERA CON RODAJA DE NARANJA', family: 'bebidas' },
  { name: 'INFUSION PARA ICE GREENCH', family: 'bebidas' },
  { name: 'INFUSION PARA JULEP PATAGONIA', family: 'bebidas' },
  { name: 'JUGO DE ANANA', family: 'bebidas' },
  { name: 'LIMONADA BLUE BERRY', family: 'bebidas' },
  { name: 'LIMONADA FRUTOS ROJOS', family: 'bebidas' },
  { name: 'LIMONADA MARACUYA', family: 'bebidas' },
  { name: 'LIMONADA MENTA Y JENGIBRE', family: 'bebidas' },
  { name: 'POMELADA', family: 'bebidas' },
  { name: 'PRENSA LIMONADA', family: 'bebidas' },
  // Imagen 2 – COCTELES
  { name: 'COCT. COSMOPOLITAN', family: 'cocteles' },
  { name: 'COCT. EXPRESO MARTINI', family: 'cocteles' },
  { name: 'COCT. GIN TEA TONIC', family: 'cocteles' },
  { name: 'COCT. GIN TONIC', family: 'cocteles' },
  { name: 'COCT. MANHATTAN', family: 'cocteles' },
  { name: 'COCT. MARGARITA', family: 'cocteles' },
  { name: 'COCT. NEGRONI', family: 'cocteles' },
  { name: 'COCT. NEW YORK SOUR', family: 'cocteles' },
  { name: 'COCT. OLD FASHIONED', family: 'cocteles' },
  { name: 'COCT. SEX ON THE BEACH', family: 'cocteles' },
  { name: 'DRY MARTINI GIN', family: 'cocteles' },
  { name: 'DRY MARTINI VODKA', family: 'cocteles' },
  { name: 'WHISKY SOUR', family: 'cocteles' },
  // Imagen 2 – DE AUTOR
  { name: 'AUTOR BEATLE JUICE', family: 'de-autor' },
  { name: 'AUTOR BRUMA DEL BOSQUE', family: 'de-autor' },
  { name: 'AUTOR CAIPIORIENTAL SAKE', family: 'de-autor' },
  { name: 'AUTOR CAIPIORIENTAL VINO BLANCO', family: 'de-autor' },
  { name: 'AUTOR DORADO', family: 'de-autor' },
  { name: 'AUTOR OUT LANDER', family: 'de-autor' },
  // Imagen 2 – MOCKTAILS
  { name: 'MOCK. SHIRLEY TEMPLE', family: 'mocktails' },
  { name: 'MOCK. EXPRESO TONNIC', family: 'mocktails' },
  { name: 'MOCK. JULEP PATAGONIA', family: 'mocktails' },
  { name: 'MOCK. ICE GREENCH', family: 'mocktails' },
  // Imagen 2 – CAFÉ ESPECIAL
  { name: 'MOCACCINO CAFÉ', family: 'cafe-especial' },
  { name: 'CAPUCCINO CAFÉ', family: 'cafe-especial' },
  { name: 'CAPUCCINO A LA ITALIANA', family: 'cafe-especial' },
  { name: 'CAPUCCINO HAZELNUT', family: 'cafe-especial' },
  { name: 'LATTE AVELLANAS TAZON', family: 'cafe-especial' },
  { name: 'LATTE VAINILLA TAZON', family: 'cafe-especial' },
  { name: 'LATTE CARAMEL TAZON', family: 'cafe-especial' },
  { name: 'LATTE CARAMEL DOBLE', family: 'cafe-especial' },
  { name: 'LATTE VAINILLA DOBLE', family: 'cafe-especial' },
  { name: 'LATTE AVELLANAS DOBLE', family: 'cafe-especial' },
  { name: 'SUBMARINO CAFÉ', family: 'cafe-especial' },
  { name: 'SUBMARINO CARAMEL CAFÉ', family: 'cafe-especial' },
  { name: 'T.C CAFE BOMBON', family: 'cafe-especial' },
  { name: 'T.C CAFÉ AL CHOCOLATE', family: 'cafe-especial' },
  { name: 'T.C TENTACION', family: 'cafe-especial' },
  { name: 'T.C IRLANDES', family: 'cafe-especial' },
  { name: 'T.C PEANUT COFFE CREAM', family: 'cafe-especial' },
  { name: 'T.F ICE COFFEE', family: 'cafe-especial' },
  { name: 'T.F ICE COFFEE C/LECHE', family: 'cafe-especial' },
  { name: 'T.F COLD BREW', family: 'cafe-especial' },
  { name: 'T.F COLD BREW C/LECHE', family: 'cafe-especial' },
  { name: 'T.F AFFOGATO', family: 'cafe-especial' },
  { name: 'T.F ICE CAPPUCINO', family: 'cafe-especial' },
  { name: 'T.F ICE CARAMEL', family: 'cafe-especial' },
  { name: 'T.F ESPRESSO TONIC', family: 'cafe-especial' },
  { name: 'T.F ICE LATTE AVELLANAS', family: 'cafe-especial' },
  { name: 'T.F ICE LATTE VAINILLA', family: 'cafe-especial' },
  { name: 'T.F ICE LATTE CARAMEL', family: 'cafe-especial' },
  { name: 'T.F SPANISH LATTE', family: 'cafe-especial' },
  { name: 'T.F SPANISH LATTE C/LECHE', family: 'cafe-especial' },
  // Imagen 2 – BARISTA-TAKE
  { name: 'TAKE CAFÉ SOLO GRANDE', family: 'barista-take' },
  { name: 'TAKE CAFE CON LECHE GRANDE', family: 'barista-take' },
  { name: 'TAKE CORTADO GRANDE', family: 'barista-take' },
  { name: 'TAKE MACHIATTO GRANDE', family: 'barista-take' },
  { name: 'TAKE LAGRIMA GRANDE', family: 'barista-take' },
  { name: 'TAKE AMERICANO GRANDE', family: 'barista-take' },
  { name: 'TAKE LATTE GRANDE', family: 'barista-take' },
  { name: 'TAKE LATTE AVELLANAS GRANDE', family: 'barista-take' },
  { name: 'TAKE LATTE CARAMEL GRANDE', family: 'barista-take' },
  { name: 'TAKE LATTE VAINILLA GRANDE', family: 'barista-take' },
  { name: 'TAKE MOCACCINO GRANDE', family: 'barista-take' },
  { name: 'TAKE CAPPUCINO GRANDE', family: 'barista-take' },
  { name: 'TAKE CAPPUCINO ITALIANO GRANDE', family: 'barista-take' },
  { name: 'TAKE HAZELNUT GRANDE', family: 'barista-take' },
  { name: 'TAKE SUBMARINO CARAMEL GRANDE', family: 'barista-take' },
  { name: 'TAKE SUBMARINO GRANDE', family: 'barista-take' },
  { name: 'TAKE CAFE SOLO CHICO', family: 'barista-take' },
  { name: 'TAKE CAFÉ CON LECHE CHICO', family: 'barista-take' },
  { name: 'TAKE CORTADO CHICO', family: 'barista-take' },
  { name: 'TAKE MACHIATTO CHICO', family: 'barista-take' },
  { name: 'TAKE LAGRIMA CHICO', family: 'barista-take' },
  { name: 'TAKE AMERICANO CHICO', family: 'barista-take' },
  { name: 'TAKE LATTE CHICO', family: 'barista-take' },
  { name: 'TAKE LATTE AVELLANAS CHICO', family: 'barista-take' },
  { name: 'TAKE LATTE CARAMEL CHICO', family: 'barista-take' },
  { name: 'TAKE LATTE VAINILLA CHICO', family: 'barista-take' },
  { name: 'TAKE MOCACCINO CHICO', family: 'barista-take' },
  { name: 'TAKE CAPPUCINO CHICO', family: 'barista-take' },
  { name: 'TAKE CAPPUCINO ITALIANO CHICO', family: 'barista-take' },
  { name: 'TAKE HAZELNUT CHICO', family: 'barista-take' },
  { name: 'TAKE SUBMARINO CARAMEL CHICO', family: 'barista-take' },
  { name: 'TAKE SUBMARINO CHICO', family: 'barista-take' },
  { name: 'TAKE LIMONADA MARACUYA Y MANGO', family: 'barista-take' },
  { name: 'TAKE LIMONADA FRUTOS ROJOS', family: 'barista-take' },
  { name: 'TAKE LIMONADA', family: 'barista-take' },
  { name: 'TAKE JUGO DE NARANJA', family: 'barista-take' },
  { name: 'TAKE LICUADO MULTIFRUTA LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO MULTIFRUTA AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO MULTIFRUTA JUGO', family: 'barista-take' },
  { name: 'TAKE LICUADO BANANA LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO BANANA AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO BANANA JUGO', family: 'barista-take' },
  { name: 'TAKE LICUADO MARACUYA LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO MARACUYA AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO MARACUYA JUGO', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTILLA LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTILLA AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTILLA JUGO', family: 'barista-take' },
  { name: 'TAKE LICUADO DURAZNO LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO DURAZNO AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO DURAZNO JUGO', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTOS ROJOS LECHE', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTOS ROJOS AGUA', family: 'barista-take' },
  { name: 'TAKE LICUADO FRUTOS ROJOS JUGO', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES MARACUYA LECHE', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES MARACUYA AGUA', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES MARACUYA JUGO', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTILLA LECHE', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTILLA AGUA', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTILLA JUGO', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES DURAZNO LECHE', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES DURAZNO AGUA', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES DURAZNO JUGO', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTOS ROJOS LECHE', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTOS ROJOS AGUA', family: 'barista-take' },
  { name: 'TAKE SMOOTHIES FRUTOS ROJOS JUGO', family: 'barista-take' },
  // Imagen 2 – BEBIDAS-LICUADO
  { name: 'MIX FRUTA FRESCA', family: 'bebidas-liquado' },
  { name: 'LICUADO MULTIFRUTA LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO MULTIFRUTA AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO MULTIFRUTA JUGO', family: 'bebidas-liquado' },
  { name: 'LICUADO BANANA LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO BANANA AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO MARACUYA LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO MARACUYA AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO MARACUYA JUGO', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTILLA LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTILLA AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTILLA JUGO', family: 'bebidas-liquado' },
  { name: 'LICUADO DURAZNO LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO DURAZNO AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO DURAZNO JUGO', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTOS ROJOS LECHE', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTOS ROJOS AGUA', family: 'bebidas-liquado' },
  { name: 'LICUADO FRUTOS ROJOS JUGO', family: 'bebidas-liquado' },
  // Imagen 2 – BEBIDAS-SMOOTHIE
  { name: 'SMOOTHIES DURAZNO LECHE', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES DURAZNO AGUA', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES DURAZNO JUGO', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTOS DEL BOSQUE LECHE', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTOS DEL BOSQUE AGUA', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTOS DEL BOSQUE JUGO', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES MARACUYA Y MANGO LECHE', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES MARACUYA Y MANGO AGUA', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES MARACUYA Y MANGO JUGO', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTILLA LECHE', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTILLA AGUA', family: 'bebidas-smoothie' },
  { name: 'SMOOTHIES FRUTILLA JUGO', family: 'bebidas-smoothie' },
  // —— FORMULA queso/fiambre y empaques (planilla) – stock Dorado
  { name: 'QUESO SARDO', family: 'insumos' },
  { name: 'QUESO TYBO FETA', family: 'insumos' },
  { name: 'QUESO TYBO RECORTE', family: 'insumos' },
  { name: 'QUESO AHUMADO', family: 'insumos' },
  { name: 'QUESO MUZZARELLA', family: 'insumos' },
  { name: 'QUESO MUZZARELLA FETA', family: 'insumos' },
  { name: 'QUESO AZUL', family: 'insumos' },
  { name: 'LOMITO DE CERDO FETAS', family: 'insumos' },
  { name: 'JAMON COCIDO FETAS', family: 'insumos' },
  { name: 'MORTADELA FETAS', family: 'insumos' },
  { name: 'MORTADELA C/PISTACHO FETAS', family: 'insumos' },
  { name: 'PANCETA PREMIUN', family: 'insumos' },
  { name: 'PANCETA AHUMADA FETA', family: 'insumos' },
  { name: 'JAMON CRUDO FETAS', family: 'insumos' },
  { name: 'ROTULOS ADHERENTE', family: 'insumos' },
  { name: 'BOLSA VACIO 170X300', family: 'insumos' },
  { name: 'BOLSA VACIO 250X350', family: 'insumos' },
  { name: 'SEPARADORES LAMINAS ALTA DENSIDAD', family: 'insumos' },
  // —— Tabla degustación quesos
  { name: 'QUESO CABRINO', family: 'insumos' },
  { name: 'QUESO RUMEL', family: 'insumos' },
  { name: 'QUESO 4 ESQUINA', family: 'insumos' },
  { name: 'QUESO CENDRE DEL VALLE', family: 'insumos' },
  { name: 'QUESO DE CABRA FETA', family: 'insumos' },
  { name: 'QUESO TOSCANO', family: 'insumos' },
  { name: 'QUESO DE CABRA GASCONY', family: 'insumos' },
];

async function main() {
  const [locations, categories, products, stockLevels] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, type: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, categoryId: true },
    }),
    prisma.stockLevel.findMany({ select: { productId: true, locationId: true } }),
  ]);

  let locationDorado = locations.find(
    (l) => normalizeKey(l.name) === 'DORADO' || (l.slug && l.slug.toLowerCase() === 'dorado'),
  );
  if (!locationDorado) {
    locationDorado = await prisma.location.create({
      data: {
        name: 'Dorado',
        slug: 'dorado',
        type: LocationType.RESTAURANT,
        isActive: true,
        hasTables: true,
      },
    });
    console.log('Ubicación creada: Dorado');
  }
  const locationCoffees = locations.filter((l) => l.type === LocationType.CAFE);

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const familySlugs = [...new Set(PRODUCTOS_FAMILIA.map((p) => p.family))];
  for (const slug of familySlugs) {
    if (!categoryBySlug.has(slug)) {
      const name =
        slug === 'de-autor'
          ? 'De Autor'
          : slug
              .split('-')
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join(' ');
      const cat = await prisma.category.create({
        data: { name, slug, sortOrder: categories.length + familySlugs.indexOf(slug) },
      });
      categoryBySlug.set(slug, cat.id);
      console.log('Categoría creada:', name, `(${slug})`);
    }
  }

  const productByKey = new Map(products.map((p) => [normalizeKey(p.name), p]));
  const stockSet = new Set(stockLevels.map((s) => `${s.productId}:${s.locationId}`));
  const usedSkus = new Set(products.map((p) => p.sku));

  function nextSku(prefix: string): string {
    let candidate = prefix;
    let n = 1;
    while (usedSkus.has(candidate)) {
      candidate = `${prefix}-${n}`;
      n++;
    }
    usedSkus.add(candidate);
    return candidate;
  }

  let productsCreated = 0;
  let productsUpdated = 0;
  let stockDoradoCreated = 0;
  let stockCoffeesCreated = 0;

  for (const row of PRODUCTOS_FAMILIA) {
    const key = normalizeKey(row.name);
    const categoryId = categoryBySlug.get(row.family);
    if (!categoryId) continue;

    let product = productByKey.get(key);
    if (!product) {
      const baseSku = key.replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'PROD';
      product = await prisma.product.create({
        data: {
          name: row.name.trim(),
          sku: nextSku(`FAM-${baseSku}`),
          categoryId,
          unit: 'unidad',
          isSellable: true,
          isIngredient: true,
          isProduced: true,
          isActive: true,
          avgCost: 0,
          lastCost: 0,
          salePrice: 0,
        },
      });
      productByKey.set(key, product);
      productsCreated++;
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { categoryId },
      });
      productsUpdated++;
    }

    const doradoId = locationDorado.id;
    const stockKeyDorado = `${product.id}:${doradoId}`;
    if (!stockSet.has(stockKeyDorado)) {
      await prisma.stockLevel.create({
        data: {
          productId: product.id,
          locationId: doradoId,
          quantity: 0,
          minQuantity: 0,
        },
      });
      stockSet.add(stockKeyDorado);
      stockDoradoCreated++;
    }

    if (FAMILIAS_EN_COFFEES.has(row.family)) {
      for (const loc of locationCoffees) {
        const ck = `${product.id}:${loc.id}`;
        if (!stockSet.has(ck)) {
          await prisma.stockLevel.create({
            data: {
              productId: product.id,
              locationId: loc.id,
              quantity: 0,
              minQuantity: 0,
            },
          });
          stockSet.add(ck);
          stockCoffeesCreated++;
        }
      }
    }
  }

  console.log('---');
  console.log('Productos creados:', productsCreated);
  console.log('Productos actualizados (categoría):', productsUpdated);
  console.log('Stock DORADO creados:', stockDoradoCreated);
  console.log('Stock en locales CAFE creados:', stockCoffeesCreated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
