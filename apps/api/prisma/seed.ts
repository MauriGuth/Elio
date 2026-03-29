// ──────────────────────────────────────────────────────────────
// Nova – Gastronomy Management System
// Database Seed File
// ──────────────────────────────────────────────────────────────

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, LocationType } from '../generated/prisma';
import * as bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;
const prisma = new PrismaClient(adapter ? { adapter } : ({} as never));

// ── Date helpers ─────────────────────────────────────────────
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);

// ── Clean Database ───────────────────────────────────────────
async function cleanDatabase() {
  console.log('🗑️  Limpiando base de datos...');

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.aIEvent.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.shipmentItem.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.productionOrderItem.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.goodsReceiptItem.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.productSupplier.deleteMany();
  await prisma.table.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();

  console.log('✅ Base de datos limpia\n');
}

// ══════════════════════════════════════════════════════════════
// Main Seed Function
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱 Iniciando seed de la base de datos Nova...\n');
  await cleanDatabase();

  // ════════════════════════════════════════════════════════════
  // 1. LOCATIONS
  // ════════════════════════════════════════════════════════════
  console.log('📍 Creando ubicaciones...');

  const deposito = await prisma.location.create({
    data: {
      name: 'Depósito Central',
      slug: 'deposito-central',
      type: LocationType.WAREHOUSE,
      address: 'Av. Juan B. Justo 4200, CABA',
      phone: '+54 11 4555-0001',
      isProduction: true,
    },
  });

  const palermo = await prisma.location.create({
    data: {
      name: 'Café Palermo',
      slug: 'cafe-palermo',
      type: LocationType.CAFE,
      address: 'Thames 1602, Palermo Soho, CABA',
      phone: '+54 11 4833-0002',
      hasTables: true,
    },
  });

  const recoleta = await prisma.location.create({
    data: {
      name: 'Restaurante Recoleta',
      slug: 'restaurante-recoleta',
      type: LocationType.RESTAURANT,
      address: 'Av. Alvear 1891, Recoleta, CABA',
      phone: '+54 11 4801-0003',
      hasTables: true,
    },
  });

  const express = await prisma.location.create({
    data: {
      name: 'Express Microcentro',
      slug: 'express-microcentro',
      type: LocationType.EXPRESS,
      address: 'Florida 165, Microcentro, CABA',
      phone: '+54 11 4328-0004',
    },
  });

  const belgrano = await prisma.location.create({
    data: {
      name: 'Café Belgrano',
      slug: 'cafe-belgrano',
      type: LocationType.CAFE,
      address: 'Av. Cabildo 2040, Belgrano, CABA',
      phone: '+54 11 4783-0005',
      hasTables: true,
    },
  });

  await prisma.location.create({
    data: {
      name: 'Retiro de mercadería o proveedor',
      slug: 'retiro-mercaderia-proveedor',
      type: LocationType.SUPPLIER_PICKUP,
    },
  });

  console.log('  ✓ 6 ubicaciones creadas');

  // ════════════════════════════════════════════════════════════
  // 2. USERS
  // ════════════════════════════════════════════════════════════
  console.log('👤 Creando usuarios...');

  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@elio.com',
      passwordHash,
      firstName: 'Martín',
      lastName: 'Rodríguez',
      phone: '+54 11 5555-0001',
      role: Role.ADMIN,
    },
  });

  const depositoMgr = await prisma.user.create({
    data: {
      email: 'deposito@elio.com',
      passwordHash,
      firstName: 'Carlos',
      lastName: 'Fernández',
      phone: '+54 11 5555-0002',
      role: Role.WAREHOUSE_MANAGER,
      locationId: deposito.id,
    },
  });

  const palermoMgr = await prisma.user.create({
    data: {
      email: 'palermo@elio.com',
      passwordHash,
      firstName: 'Lucía',
      lastName: 'García',
      phone: '+54 11 5555-0003',
      role: Role.LOCATION_MANAGER,
      locationId: palermo.id,
    },
  });

  const recoletaMgr = await prisma.user.create({
    data: {
      email: 'recoleta@elio.com',
      passwordHash,
      firstName: 'Ana',
      lastName: 'Martínez',
      phone: '+54 11 5555-0004',
      role: Role.LOCATION_MANAGER,
      locationId: recoleta.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'mozo@elio.com',
      passwordHash,
      firstName: 'Diego',
      lastName: 'López',
      phone: '+54 11 5555-0005',
      role: Role.WAITER,
      locationId: recoleta.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'cocina@elio.com',
      passwordHash,
      firstName: 'Roberto',
      lastName: 'Sánchez',
      phone: '+54 11 5555-0006',
      role: Role.KITCHEN,
      locationId: recoleta.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'caja@elio.com',
      passwordHash,
      firstName: 'Valentina',
      lastName: 'Torres',
      phone: '+54 11 5555-0007',
      role: Role.CASHIER,
      locationId: palermo.id,
    },
  });

  const logistics = await prisma.user.create({
    data: {
      email: 'logistica@elio.com',
      passwordHash,
      firstName: 'Pablo',
      lastName: 'Díaz',
      phone: '+54 11 5555-0008',
      role: Role.LOGISTICS,
    },
  });

  console.log('  ✓ 8 usuarios creados');

  // ════════════════════════════════════════════════════════════
  // 3. CATEGORIES
  // ════════════════════════════════════════════════════════════
  console.log('📁 Creando categorías...');

  const catCafe = await prisma.category.create({
    data: {
      name: 'Café y Bebidas Calientes',
      slug: 'cafe-y-bebidas-calientes',
      icon: 'coffee',
      color: '#8B4513',
      sortOrder: 1,
    },
  });

  const catBebidas = await prisma.category.create({
    data: {
      name: 'Bebidas Frías',
      slug: 'bebidas-frias',
      icon: 'glass-water',
      color: '#4169E1',
      sortOrder: 2,
    },
  });

  const catPanaderia = await prisma.category.create({
    data: {
      name: 'Panadería y Pastelería',
      slug: 'panaderia-y-pasteleria',
      icon: 'croissant',
      color: '#D2691E',
      sortOrder: 3,
    },
  });

  const catComidas = await prisma.category.create({
    data: {
      name: 'Comidas Principales',
      slug: 'comidas-principales',
      icon: 'utensils',
      color: '#2E8B57',
      sortOrder: 4,
    },
  });

  const catIngredientes = await prisma.category.create({
    data: {
      name: 'Ingredientes Base',
      slug: 'ingredientes-base',
      icon: 'wheat',
      color: '#DAA520',
      sortOrder: 5,
    },
  });

  const catLacteos = await prisma.category.create({
    data: {
      name: 'Lácteos',
      slug: 'lacteos',
      icon: 'milk',
      color: '#0D9488',
      sortOrder: 6,
    },
  });

  const catFrutas = await prisma.category.create({
    data: {
      name: 'Frutas y Verduras',
      slug: 'frutas-y-verduras',
      icon: 'apple',
      color: '#228B22',
      sortOrder: 7,
    },
  });

  const catDescartables = await prisma.category.create({
    data: {
      name: 'Descartables y Limpieza',
      slug: 'descartables-y-limpieza',
      icon: 'spray-can',
      color: '#708090',
      sortOrder: 8,
    },
  });

  console.log('  ✓ 8 categorías creadas');

  // ════════════════════════════════════════════════════════════
  // 4. SUPPLIERS
  // ════════════════════════════════════════════════════════════
  console.log('🏭 Creando proveedores...');

  const supCafe = await prisma.supplier.create({
    data: {
      name: 'Café del Sur',
      legalName: 'Café del Sur S.A.',
      taxId: '30-12345678-9',
      contactName: 'Jorge Herrera',
      contactPhone: '+54 11 4300-1001',
      contactEmail: 'ventas@cafedelsur.com.ar',
      address: 'Av. Patricios 1200, Barracas, CABA',
      paymentTerms: '30 días',
    },
  });

  const supLacteos = await prisma.supplier.create({
    data: {
      name: 'Distribuidora Lácteos BA',
      legalName: 'Distribuidora Lácteos Buenos Aires S.R.L.',
      taxId: '30-23456789-0',
      contactName: 'María Gómez',
      contactPhone: '+54 11 4300-2002',
      contactEmail: 'pedidos@lacteosba.com.ar',
      address: 'Ruta 8 km 32, Pilar, Buenos Aires',
      paymentTerms: '15 días',
    },
  });

  const supPanaderia = await prisma.supplier.create({
    data: {
      name: 'Panadería Industrial San Martín',
      legalName: 'Panadería Industrial San Martín S.A.',
      taxId: '30-34567890-1',
      contactName: 'Ricardo Paz',
      contactPhone: '+54 11 4300-3003',
      contactEmail: 'ventas@panaderiasmn.com.ar',
      address: 'Av. San Martín 5500, Villa Devoto, CABA',
      paymentTerms: '30 días',
    },
  });

  const supFrutas = await prisma.supplier.create({
    data: {
      name: 'Frutas Frescas del Mercado',
      legalName: 'Frutas Frescas del Mercado Central S.R.L.',
      taxId: '30-45678901-2',
      contactName: 'Eduardo Silva',
      contactPhone: '+54 11 4300-4004',
      contactEmail: 'pedidos@frutasfrescas.com.ar',
      address: 'Mercado Central, Tapiales, Buenos Aires',
      paymentTerms: '7 días',
    },
  });

  const supPackaging = await prisma.supplier.create({
    data: {
      name: 'Packaging Solutions SRL',
      legalName: 'Packaging Solutions S.R.L.',
      taxId: '30-56789012-3',
      contactName: 'Carolina Ruiz',
      contactPhone: '+54 11 4300-5005',
      contactEmail: 'ventas@packagingsol.com.ar',
      address: 'Parque Industrial, Avellaneda, Buenos Aires',
      paymentTerms: '30 días',
    },
  });

  console.log('  ✓ 5 proveedores creados');

  // ════════════════════════════════════════════════════════════
  // 5. PRODUCTS
  // ════════════════════════════════════════════════════════════
  console.log('📦 Creando productos...');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: Record<string, any> = {};

  // ── Café y Bebidas Calientes ───────────────────────────
  p.cafeGrano = await prisma.product.create({
    data: {
      sku: 'CAF-001',
      name: 'Café en grano',
      description: 'Café en grano blend premium, tostado medio',
      categoryId: catCafe.id,
      unit: 'kg',
      avgCost: 12000,
      lastCost: 12500,
      isIngredient: true,
    },
  });

  p.cafeMolido = await prisma.product.create({
    data: {
      sku: 'CAF-002',
      name: 'Café molido',
      description: 'Café molido para espresso, tostado intenso',
      categoryId: catCafe.id,
      unit: 'kg',
      avgCost: 8500,
      lastCost: 8800,
      isIngredient: true,
    },
  });

  p.descafeinado = await prisma.product.create({
    data: {
      sku: 'CAF-003',
      name: 'Descafeinado',
      description: 'Café descafeinado molido premium',
      categoryId: catCafe.id,
      unit: 'kg',
      avgCost: 14000,
      lastCost: 14200,
      isIngredient: true,
    },
  });

  p.cafeAmericano = await prisma.product.create({
    data: {
      sku: 'VTA-001',
      name: 'Café Americano',
      description: 'Espresso doble con agua caliente',
      categoryId: catCafe.id,
      unit: 'taza',
      avgCost: 300,
      lastCost: 300,
      salePrice: 2500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  p.cafeConLeche = await prisma.product.create({
    data: {
      sku: 'VTA-002',
      name: 'Café con Leche',
      description: 'Café espresso con leche caliente espumada',
      categoryId: catCafe.id,
      unit: 'taza',
      avgCost: 450,
      lastCost: 450,
      salePrice: 3000,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  p.cappuccino = await prisma.product.create({
    data: {
      sku: 'VTA-003',
      name: 'Cappuccino',
      description: 'Espresso con leche espumada y cacao',
      categoryId: catCafe.id,
      unit: 'taza',
      avgCost: 550,
      lastCost: 550,
      salePrice: 3500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  p.latte = await prisma.product.create({
    data: {
      sku: 'VTA-004',
      name: 'Latte',
      description: 'Espresso suave con abundante leche vaporizada',
      categoryId: catCafe.id,
      unit: 'taza',
      avgCost: 500,
      lastCost: 500,
      salePrice: 3200,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  // ── Bebidas Frías ──────────────────────────────────────
  p.aguaMineral = await prisma.product.create({
    data: {
      sku: 'BEB-001',
      name: 'Agua mineral 500ml',
      description: 'Agua mineral sin gas, botella 500ml',
      categoryId: catBebidas.id,
      unit: 'unidad',
      avgCost: 450,
      lastCost: 480,
      salePrice: 1800,
      isSellable: true,
      isIngredient: false,
    },
  });

  p.jugoNaranja = await prisma.product.create({
    data: {
      sku: 'BEB-002',
      name: 'Jugo de naranja',
      description: 'Jugo de naranja natural, exprimido',
      categoryId: catBebidas.id,
      unit: 'L',
      avgCost: 2200,
      lastCost: 2400,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.gaseosaCola = await prisma.product.create({
    data: {
      sku: 'BEB-003',
      name: 'Gaseosa cola',
      description: 'Gaseosa cola, botella 1.5L',
      categoryId: catBebidas.id,
      unit: 'L',
      avgCost: 1400,
      lastCost: 1500,
      isIngredient: true,
    },
  });

  p.cervezaArtesanal = await prisma.product.create({
    data: {
      sku: 'BEB-004',
      name: 'Cerveza artesanal',
      description: 'Cerveza artesanal IPA, botella 500ml',
      categoryId: catBebidas.id,
      unit: 'unidad',
      avgCost: 1800,
      lastCost: 1900,
      salePrice: 4500,
      isSellable: true,
      isIngredient: false,
    },
  });

  // ── Panadería y Pastelería ─────────────────────────────
  p.harina = await prisma.product.create({
    data: {
      sku: 'PAN-001',
      name: 'Harina 000',
      description: 'Harina de trigo triple cero para panificación',
      categoryId: catPanaderia.id,
      unit: 'kg',
      avgCost: 650,
      lastCost: 680,
      isIngredient: true,
    },
  });

  p.azucar = await prisma.product.create({
    data: {
      sku: 'PAN-002',
      name: 'Azúcar',
      description: 'Azúcar blanca refinada',
      categoryId: catPanaderia.id,
      unit: 'kg',
      avgCost: 850,
      lastCost: 900,
      isIngredient: true,
    },
  });

  p.levadura = await prisma.product.create({
    data: {
      sku: 'PAN-003',
      name: 'Levadura fresca',
      description: 'Levadura fresca para panificación',
      categoryId: catPanaderia.id,
      unit: 'kg',
      avgCost: 4200,
      lastCost: 4500,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.chocolateCobertura = await prisma.product.create({
    data: {
      sku: 'PAN-004',
      name: 'Chocolate cobertura',
      description: 'Chocolate semiamargo para cobertura y pastelería',
      categoryId: catPanaderia.id,
      unit: 'kg',
      avgCost: 9500,
      lastCost: 9800,
      isIngredient: true,
    },
  });

  p.cacaoPolvo = await prisma.product.create({
    data: {
      sku: 'PAN-005',
      name: 'Cacao en polvo',
      description: 'Cacao amargo en polvo para repostería y bebidas',
      categoryId: catPanaderia.id,
      unit: 'kg',
      avgCost: 7800,
      lastCost: 8000,
      isIngredient: true,
    },
  });

  p.medialuna = await prisma.product.create({
    data: {
      sku: 'VTA-005',
      name: 'Medialuna',
      description: 'Medialuna de manteca artesanal',
      categoryId: catPanaderia.id,
      unit: 'unidad',
      avgCost: 350,
      lastCost: 380,
      salePrice: 1200,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
      isPerishable: true,
    },
  });

  p.facturas = await prisma.product.create({
    data: {
      sku: 'VTA-006',
      name: 'Facturas surtidas',
      description: 'Docena de facturas surtidas (vigilantes, cañoncitos, bolas de fraile)',
      categoryId: catPanaderia.id,
      unit: 'docena',
      avgCost: 3500,
      lastCost: 3800,
      salePrice: 8500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
      isPerishable: true,
    },
  });

  p.tartaFrutas = await prisma.product.create({
    data: {
      sku: 'VTA-007',
      name: 'Tarta de frutas',
      description: 'Porción de tarta de frutas de estación con crema',
      categoryId: catPanaderia.id,
      unit: 'porción',
      avgCost: 1800,
      lastCost: 1900,
      salePrice: 4500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
      isPerishable: true,
    },
  });

  p.brownie = await prisma.product.create({
    data: {
      sku: 'VTA-008',
      name: 'Brownie',
      description: 'Brownie de chocolate con nueces',
      categoryId: catPanaderia.id,
      unit: 'unidad',
      avgCost: 600,
      lastCost: 650,
      salePrice: 2200,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  // ── Comidas Principales ────────────────────────────────
  p.jamon = await prisma.product.create({
    data: {
      sku: 'COM-001',
      name: 'Jamón cocido',
      description: 'Jamón cocido natural, feteado',
      categoryId: catComidas.id,
      unit: 'kg',
      avgCost: 11500,
      lastCost: 12000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.panDeMiga = await prisma.product.create({
    data: {
      sku: 'COM-002',
      name: 'Pan de miga',
      description: 'Pan de miga blanco para sándwiches',
      categoryId: catComidas.id,
      unit: 'unidad',
      avgCost: 350,
      lastCost: 380,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.pollo = await prisma.product.create({
    data: {
      sku: 'COM-003',
      name: 'Pollo',
      description: 'Pechuga de pollo deshuesada',
      categoryId: catComidas.id,
      unit: 'kg',
      avgCost: 4200,
      lastCost: 4500,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.salmon = await prisma.product.create({
    data: {
      sku: 'COM-004',
      name: 'Salmón',
      description: 'Filete de salmón rosado fresco',
      categoryId: catComidas.id,
      unit: 'kg',
      avgCost: 18500,
      lastCost: 19000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.tostado = await prisma.product.create({
    data: {
      sku: 'VTA-009',
      name: 'Tostado de Jamón y Queso',
      description: 'Tostado de jamón y queso en pan de miga',
      categoryId: catComidas.id,
      unit: 'unidad',
      avgCost: 1500,
      lastCost: 1600,
      salePrice: 4800,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  p.ensaladaCesar = await prisma.product.create({
    data: {
      sku: 'VTA-010',
      name: 'Ensalada César',
      description: 'Lechuga, pollo grillado, parmesano, croutons y aderezo César',
      categoryId: catComidas.id,
      unit: 'porción',
      avgCost: 2800,
      lastCost: 3000,
      salePrice: 7500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  p.hamburguesa = await prisma.product.create({
    data: {
      sku: 'VTA-011',
      name: 'Hamburguesa Clásica',
      description: 'Hamburguesa de carne 200g con lechuga, tomate y cheddar',
      categoryId: catComidas.id,
      unit: 'unidad',
      avgCost: 3200,
      lastCost: 3400,
      salePrice: 8500,
      isSellable: true,
      isIngredient: false,
      isProduced: true,
    },
  });

  // ── Ingredientes Base ──────────────────────────────────
  p.huevos = await prisma.product.create({
    data: {
      sku: 'ING-001',
      name: 'Huevos',
      description: 'Huevos de gallina, tamaño grande',
      categoryId: catIngredientes.id,
      unit: 'unidad',
      avgCost: 180,
      lastCost: 200,
      isIngredient: true,
      isPerishable: true,
    },
  });

  // ── Lácteos ────────────────────────────────────────────
  p.lecheEntera = await prisma.product.create({
    data: {
      sku: 'LAC-001',
      name: 'Leche entera',
      description: 'Leche entera pasteurizada',
      categoryId: catLacteos.id,
      unit: 'L',
      avgCost: 950,
      lastCost: 1000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.lecheDescremada = await prisma.product.create({
    data: {
      sku: 'LAC-002',
      name: 'Leche descremada',
      description: 'Leche descremada pasteurizada',
      categoryId: catLacteos.id,
      unit: 'L',
      avgCost: 1050,
      lastCost: 1100,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.crema = await prisma.product.create({
    data: {
      sku: 'LAC-003',
      name: 'Crema de leche',
      description: 'Crema de leche para cocinar y batir',
      categoryId: catLacteos.id,
      unit: 'L',
      avgCost: 3200,
      lastCost: 3400,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.quesoCremoso = await prisma.product.create({
    data: {
      sku: 'LAC-004',
      name: 'Queso cremoso',
      description: 'Queso cremoso para sándwiches y cocina',
      categoryId: catLacteos.id,
      unit: 'kg',
      avgCost: 8500,
      lastCost: 8800,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.manteca = await prisma.product.create({
    data: {
      sku: 'LAC-005',
      name: 'Manteca',
      description: 'Manteca para panificación y cocina',
      categoryId: catLacteos.id,
      unit: 'kg',
      avgCost: 7800,
      lastCost: 8000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  // ── Frutas y Verduras ──────────────────────────────────
  p.tomate = await prisma.product.create({
    data: {
      sku: 'FRU-001',
      name: 'Tomate',
      description: 'Tomate redondo maduro',
      categoryId: catFrutas.id,
      unit: 'kg',
      avgCost: 2800,
      lastCost: 3000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  p.lechuga = await prisma.product.create({
    data: {
      sku: 'FRU-002',
      name: 'Lechuga',
      description: 'Lechuga crespa fresca',
      categoryId: catFrutas.id,
      unit: 'kg',
      avgCost: 1800,
      lastCost: 2000,
      isIngredient: true,
      isPerishable: true,
    },
  });

  // ── Descartables y Limpieza ────────────────────────────
  p.servilletas = await prisma.product.create({
    data: {
      sku: 'DES-001',
      name: 'Servilletas',
      description: 'Servilletas de papel, paquete x100',
      categoryId: catDescartables.id,
      unit: 'paquete',
      avgCost: 1200,
      lastCost: 1300,
      isIngredient: false,
    },
  });

  p.vasosDescartables = await prisma.product.create({
    data: {
      sku: 'DES-002',
      name: 'Vasos descartables',
      description: 'Vasos de cartón para café, 240ml',
      categoryId: catDescartables.id,
      unit: 'unidad',
      avgCost: 85,
      lastCost: 90,
      isIngredient: false,
    },
  });

  p.detergente = await prisma.product.create({
    data: {
      sku: 'DES-003',
      name: 'Detergente multiuso',
      description: 'Detergente multiuso concentrado para limpieza',
      categoryId: catDescartables.id,
      unit: 'L',
      avgCost: 2500,
      lastCost: 2600,
      isIngredient: false,
    },
  });

  const productCount = Object.keys(p).length;
  console.log(`  ✓ ${productCount} productos creados`);

  // ════════════════════════════════════════════════════════════
  // 6. PRODUCT–SUPPLIER RELATIONSHIPS
  // ════════════════════════════════════════════════════════════
  console.log('🔗 Creando relaciones producto-proveedor...');

  const productSupplierData = [
    // ── Café del Sur ──
    { productId: p.cafeGrano.id, supplierId: supCafe.id, unitCost: 12500, minOrderQty: 5, leadTimeDays: 3, isPreferred: true, supplierSku: 'CDS-BL-001' },
    { productId: p.cafeMolido.id, supplierId: supCafe.id, unitCost: 8800, minOrderQty: 5, leadTimeDays: 3, isPreferred: true, supplierSku: 'CDS-ML-002' },
    { productId: p.descafeinado.id, supplierId: supCafe.id, unitCost: 14200, minOrderQty: 2, leadTimeDays: 5, isPreferred: true, supplierSku: 'CDS-DC-003' },
    { productId: p.cacaoPolvo.id, supplierId: supCafe.id, unitCost: 8000, minOrderQty: 2, leadTimeDays: 3, isPreferred: true, supplierSku: 'CDS-CA-004' },

    // ── Distribuidora Lácteos BA ──
    { productId: p.lecheEntera.id, supplierId: supLacteos.id, unitCost: 1000, minOrderQty: 20, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-LE-001' },
    { productId: p.lecheDescremada.id, supplierId: supLacteos.id, unitCost: 1100, minOrderQty: 20, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-LD-002' },
    { productId: p.crema.id, supplierId: supLacteos.id, unitCost: 3400, minOrderQty: 5, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-CR-003' },
    { productId: p.quesoCremoso.id, supplierId: supLacteos.id, unitCost: 8800, minOrderQty: 3, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-QC-004' },
    { productId: p.manteca.id, supplierId: supLacteos.id, unitCost: 8000, minOrderQty: 3, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-MT-005' },
    { productId: p.huevos.id, supplierId: supLacteos.id, unitCost: 200, minOrderQty: 30, leadTimeDays: 1, isPreferred: true, supplierSku: 'DLB-HU-006' },
    { productId: p.jamon.id, supplierId: supLacteos.id, unitCost: 12000, minOrderQty: 2, leadTimeDays: 2, isPreferred: true, supplierSku: 'DLB-JC-007' },

    // ── Panadería Industrial San Martín ──
    { productId: p.harina.id, supplierId: supPanaderia.id, unitCost: 680, minOrderQty: 25, leadTimeDays: 2, isPreferred: true, supplierSku: 'PISM-HA-001' },
    { productId: p.azucar.id, supplierId: supPanaderia.id, unitCost: 900, minOrderQty: 25, leadTimeDays: 2, isPreferred: true, supplierSku: 'PISM-AZ-002' },
    { productId: p.levadura.id, supplierId: supPanaderia.id, unitCost: 4500, minOrderQty: 1, leadTimeDays: 1, isPreferred: true, supplierSku: 'PISM-LV-003' },
    { productId: p.chocolateCobertura.id, supplierId: supPanaderia.id, unitCost: 9800, minOrderQty: 2, leadTimeDays: 3, isPreferred: true, supplierSku: 'PISM-CH-004' },
    { productId: p.panDeMiga.id, supplierId: supPanaderia.id, unitCost: 380, minOrderQty: 20, leadTimeDays: 1, isPreferred: true, supplierSku: 'PISM-PM-005' },

    // ── Frutas Frescas del Mercado ──
    { productId: p.tomate.id, supplierId: supFrutas.id, unitCost: 3000, minOrderQty: 5, leadTimeDays: 1, isPreferred: true, supplierSku: 'FFM-TM-001' },
    { productId: p.lechuga.id, supplierId: supFrutas.id, unitCost: 2000, minOrderQty: 3, leadTimeDays: 1, isPreferred: true, supplierSku: 'FFM-LC-002' },
    { productId: p.jugoNaranja.id, supplierId: supFrutas.id, unitCost: 2400, minOrderQty: 10, leadTimeDays: 1, isPreferred: true, supplierSku: 'FFM-JN-003' },
    { productId: p.pollo.id, supplierId: supFrutas.id, unitCost: 4500, minOrderQty: 5, leadTimeDays: 1, isPreferred: true, supplierSku: 'FFM-PO-004' },
    { productId: p.salmon.id, supplierId: supFrutas.id, unitCost: 19000, minOrderQty: 2, leadTimeDays: 1, isPreferred: true, supplierSku: 'FFM-SM-005' },

    // ── Packaging Solutions SRL ──
    { productId: p.servilletas.id, supplierId: supPackaging.id, unitCost: 1300, minOrderQty: 20, leadTimeDays: 5, isPreferred: true, supplierSku: 'PS-SV-001' },
    { productId: p.vasosDescartables.id, supplierId: supPackaging.id, unitCost: 90, minOrderQty: 500, leadTimeDays: 5, isPreferred: true, supplierSku: 'PS-VD-002' },
    { productId: p.detergente.id, supplierId: supPackaging.id, unitCost: 2600, minOrderQty: 5, leadTimeDays: 5, isPreferred: true, supplierSku: 'PS-DT-003' },
    { productId: p.aguaMineral.id, supplierId: supPackaging.id, unitCost: 480, minOrderQty: 100, leadTimeDays: 3, isPreferred: true, supplierSku: 'PS-AM-004' },
    { productId: p.gaseosaCola.id, supplierId: supPackaging.id, unitCost: 1500, minOrderQty: 20, leadTimeDays: 3, isPreferred: true, supplierSku: 'PS-GC-005' },
    { productId: p.cervezaArtesanal.id, supplierId: supPackaging.id, unitCost: 1900, minOrderQty: 24, leadTimeDays: 5, isPreferred: true, supplierSku: 'PS-CA-006' },

    // ── Secondary suppliers (cross-supply) ──
    { productId: p.huevos.id, supplierId: supFrutas.id, unitCost: 220, minOrderQty: 30, leadTimeDays: 1, isPreferred: false },
    { productId: p.lecheEntera.id, supplierId: supPanaderia.id, unitCost: 1050, minOrderQty: 10, leadTimeDays: 2, isPreferred: false },
  ];

  await prisma.productSupplier.createMany({ data: productSupplierData });
  console.log(`  ✓ ${productSupplierData.length} relaciones producto-proveedor creadas`);

  // ════════════════════════════════════════════════════════════
  // 7. STOCK LEVELS
  // ════════════════════════════════════════════════════════════
  console.log('📊 Creando niveles de stock...');

  const stockData = [
    // ── Depósito Central (all products, high quantities) ─────
    { productId: p.cafeGrano.id, locationId: deposito.id, quantity: 80, minQuantity: 20, maxQuantity: 150 },
    { productId: p.cafeMolido.id, locationId: deposito.id, quantity: 60, minQuantity: 15, maxQuantity: 100 },
    { productId: p.descafeinado.id, locationId: deposito.id, quantity: 25, minQuantity: 8, maxQuantity: 50 },
    { productId: p.lecheEntera.id, locationId: deposito.id, quantity: 150, minQuantity: 50, maxQuantity: 300 },
    { productId: p.lecheDescremada.id, locationId: deposito.id, quantity: 80, minQuantity: 30, maxQuantity: 150 },
    { productId: p.crema.id, locationId: deposito.id, quantity: 30, minQuantity: 10, maxQuantity: 50 },
    { productId: p.quesoCremoso.id, locationId: deposito.id, quantity: 25, minQuantity: 8, maxQuantity: 40 },
    { productId: p.manteca.id, locationId: deposito.id, quantity: 20, minQuantity: 8, maxQuantity: 35 },
    { productId: p.harina.id, locationId: deposito.id, quantity: 100, minQuantity: 30, maxQuantity: 200 },
    { productId: p.azucar.id, locationId: deposito.id, quantity: 80, minQuantity: 25, maxQuantity: 150 },
    { productId: p.levadura.id, locationId: deposito.id, quantity: 8, minQuantity: 3, maxQuantity: 15 },
    { productId: p.chocolateCobertura.id, locationId: deposito.id, quantity: 15, minQuantity: 5, maxQuantity: 30 },
    { productId: p.cacaoPolvo.id, locationId: deposito.id, quantity: 12, minQuantity: 4, maxQuantity: 20 },
    { productId: p.huevos.id, locationId: deposito.id, quantity: 200, minQuantity: 60, maxQuantity: 500 },
    { productId: p.jamon.id, locationId: deposito.id, quantity: 15, minQuantity: 5, maxQuantity: 25 },
    { productId: p.panDeMiga.id, locationId: deposito.id, quantity: 80, minQuantity: 30, maxQuantity: 150 },
    { productId: p.pollo.id, locationId: deposito.id, quantity: 30, minQuantity: 10, maxQuantity: 50 },
    { productId: p.salmon.id, locationId: deposito.id, quantity: 12, minQuantity: 4, maxQuantity: 20 },
    { productId: p.tomate.id, locationId: deposito.id, quantity: 25, minQuantity: 10, maxQuantity: 50 },
    { productId: p.lechuga.id, locationId: deposito.id, quantity: 15, minQuantity: 5, maxQuantity: 30 },
    { productId: p.jugoNaranja.id, locationId: deposito.id, quantity: 40, minQuantity: 15, maxQuantity: 80 },
    { productId: p.gaseosaCola.id, locationId: deposito.id, quantity: 50, minQuantity: 20, maxQuantity: 100 },
    { productId: p.aguaMineral.id, locationId: deposito.id, quantity: 300, minQuantity: 100, maxQuantity: 600 },
    { productId: p.cervezaArtesanal.id, locationId: deposito.id, quantity: 120, minQuantity: 40, maxQuantity: 200 },
    { productId: p.medialuna.id, locationId: deposito.id, quantity: 150, minQuantity: 50, maxQuantity: 300 },
    { productId: p.facturas.id, locationId: deposito.id, quantity: 20, minQuantity: 8, maxQuantity: 40 },
    { productId: p.brownie.id, locationId: deposito.id, quantity: 60, minQuantity: 20, maxQuantity: 120 },
    { productId: p.tartaFrutas.id, locationId: deposito.id, quantity: 15, minQuantity: 5, maxQuantity: 30 },
    { productId: p.servilletas.id, locationId: deposito.id, quantity: 50, minQuantity: 15, maxQuantity: 80 },
    { productId: p.vasosDescartables.id, locationId: deposito.id, quantity: 2000, minQuantity: 500, maxQuantity: 5000 },
    { productId: p.detergente.id, locationId: deposito.id, quantity: 15, minQuantity: 5, maxQuantity: 30 },

    // ── Café Palermo (some items CRITICAL / MEDIUM) ──────────
    { productId: p.cafeGrano.id, locationId: palermo.id, quantity: 8, minQuantity: 3, maxQuantity: 15 },
    { productId: p.cafeMolido.id, locationId: palermo.id, quantity: 1.5, minQuantity: 3, maxQuantity: 10 },   // ⚠️ CRITICAL
    { productId: p.descafeinado.id, locationId: palermo.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },
    { productId: p.lecheEntera.id, locationId: palermo.id, quantity: 4, minQuantity: 10, maxQuantity: 30 },   // ⚠️ CRITICAL
    { productId: p.lecheDescremada.id, locationId: palermo.id, quantity: 8, minQuantity: 5, maxQuantity: 20 },
    { productId: p.crema.id, locationId: palermo.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },
    { productId: p.quesoCremoso.id, locationId: palermo.id, quantity: 2.5, minQuantity: 2, maxQuantity: 6 },  // ~ MEDIUM
    { productId: p.manteca.id, locationId: palermo.id, quantity: 2, minQuantity: 1.5, maxQuantity: 5 },
    { productId: p.azucar.id, locationId: palermo.id, quantity: 3, minQuantity: 2, maxQuantity: 10 },         // ~ MEDIUM
    { productId: p.cacaoPolvo.id, locationId: palermo.id, quantity: 2, minQuantity: 1, maxQuantity: 5 },
    { productId: p.jamon.id, locationId: palermo.id, quantity: 3, minQuantity: 1.5, maxQuantity: 5 },
    { productId: p.panDeMiga.id, locationId: palermo.id, quantity: 15, minQuantity: 8, maxQuantity: 30 },
    { productId: p.medialuna.id, locationId: palermo.id, quantity: 25, minQuantity: 15, maxQuantity: 50 },
    { productId: p.facturas.id, locationId: palermo.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.brownie.id, locationId: palermo.id, quantity: 12, minQuantity: 6, maxQuantity: 25 },
    { productId: p.tartaFrutas.id, locationId: palermo.id, quantity: 4, minQuantity: 2, maxQuantity: 8 },
    { productId: p.aguaMineral.id, locationId: palermo.id, quantity: 40, minQuantity: 15, maxQuantity: 80 },
    { productId: p.jugoNaranja.id, locationId: palermo.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.gaseosaCola.id, locationId: palermo.id, quantity: 8, minQuantity: 5, maxQuantity: 20 },
    { productId: p.cervezaArtesanal.id, locationId: palermo.id, quantity: 18, minQuantity: 8, maxQuantity: 30 },
    { productId: p.servilletas.id, locationId: palermo.id, quantity: 8, minQuantity: 3, maxQuantity: 15 },
    { productId: p.vasosDescartables.id, locationId: palermo.id, quantity: 300, minQuantity: 100, maxQuantity: 500 },

    // ── Restaurante Recoleta (full kitchen, wider variety) ───
    { productId: p.cafeGrano.id, locationId: recoleta.id, quantity: 6, minQuantity: 3, maxQuantity: 12 },
    { productId: p.cafeMolido.id, locationId: recoleta.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.descafeinado.id, locationId: recoleta.id, quantity: 2.5, minQuantity: 1.5, maxQuantity: 6 },
    { productId: p.lecheEntera.id, locationId: recoleta.id, quantity: 15, minQuantity: 8, maxQuantity: 30 },
    { productId: p.lecheDescremada.id, locationId: recoleta.id, quantity: 10, minQuantity: 5, maxQuantity: 20 },
    { productId: p.crema.id, locationId: recoleta.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.quesoCremoso.id, locationId: recoleta.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },   // ~ MEDIUM
    { productId: p.manteca.id, locationId: recoleta.id, quantity: 3, minQuantity: 2, maxQuantity: 6 },
    { productId: p.harina.id, locationId: recoleta.id, quantity: 10, minQuantity: 5, maxQuantity: 25 },
    { productId: p.azucar.id, locationId: recoleta.id, quantity: 8, minQuantity: 3, maxQuantity: 15 },
    { productId: p.levadura.id, locationId: recoleta.id, quantity: 1.5, minQuantity: 1, maxQuantity: 3 },
    { productId: p.chocolateCobertura.id, locationId: recoleta.id, quantity: 3, minQuantity: 1.5, maxQuantity: 6 },
    { productId: p.cacaoPolvo.id, locationId: recoleta.id, quantity: 2, minQuantity: 1, maxQuantity: 4 },
    { productId: p.huevos.id, locationId: recoleta.id, quantity: 30, minQuantity: 12, maxQuantity: 60 },
    { productId: p.jamon.id, locationId: recoleta.id, quantity: 4, minQuantity: 2, maxQuantity: 8 },
    { productId: p.panDeMiga.id, locationId: recoleta.id, quantity: 20, minQuantity: 10, maxQuantity: 40 },
    { productId: p.pollo.id, locationId: recoleta.id, quantity: 1.5, minQuantity: 5, maxQuantity: 15 },       // ⚠️ CRITICAL
    { productId: p.salmon.id, locationId: recoleta.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },
    { productId: p.tomate.id, locationId: recoleta.id, quantity: 5, minQuantity: 3, maxQuantity: 12 },
    { productId: p.lechuga.id, locationId: recoleta.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },
    { productId: p.medialuna.id, locationId: recoleta.id, quantity: 20, minQuantity: 10, maxQuantity: 40 },
    { productId: p.facturas.id, locationId: recoleta.id, quantity: 4, minQuantity: 2, maxQuantity: 8 },
    { productId: p.brownie.id, locationId: recoleta.id, quantity: 10, minQuantity: 5, maxQuantity: 20 },
    { productId: p.tartaFrutas.id, locationId: recoleta.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.aguaMineral.id, locationId: recoleta.id, quantity: 50, minQuantity: 20, maxQuantity: 100 },
    { productId: p.jugoNaranja.id, locationId: recoleta.id, quantity: 8, minQuantity: 4, maxQuantity: 15 },
    { productId: p.gaseosaCola.id, locationId: recoleta.id, quantity: 12, minQuantity: 6, maxQuantity: 25 },
    { productId: p.cervezaArtesanal.id, locationId: recoleta.id, quantity: 24, minQuantity: 10, maxQuantity: 40 },
    { productId: p.servilletas.id, locationId: recoleta.id, quantity: 10, minQuantity: 4, maxQuantity: 20 },
    { productId: p.vasosDescartables.id, locationId: recoleta.id, quantity: 200, minQuantity: 80, maxQuantity: 400 },
    { productId: p.detergente.id, locationId: recoleta.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },

    // ── Express Microcentro (limited grab-and-go) ────────────
    { productId: p.cafeMolido.id, locationId: express.id, quantity: 3, minQuantity: 2, maxQuantity: 8 },
    { productId: p.lecheEntera.id, locationId: express.id, quantity: 8, minQuantity: 5, maxQuantity: 15 },
    { productId: p.lecheDescremada.id, locationId: express.id, quantity: 5, minQuantity: 3, maxQuantity: 10 },
    { productId: p.azucar.id, locationId: express.id, quantity: 2, minQuantity: 1.5, maxQuantity: 5 },
    { productId: p.cacaoPolvo.id, locationId: express.id, quantity: 1, minQuantity: 0.5, maxQuantity: 3 },
    { productId: p.medialuna.id, locationId: express.id, quantity: 3, minQuantity: 15, maxQuantity: 40 },     // ⚠️ CRITICAL
    { productId: p.brownie.id, locationId: express.id, quantity: 5, minQuantity: 4, maxQuantity: 15 },
    { productId: p.aguaMineral.id, locationId: express.id, quantity: 8, minQuantity: 20, maxQuantity: 60 },   // ⚠️ CRITICAL
    { productId: p.gaseosaCola.id, locationId: express.id, quantity: 4, minQuantity: 3, maxQuantity: 10 },
    { productId: p.servilletas.id, locationId: express.id, quantity: 5, minQuantity: 2, maxQuantity: 10 },
    { productId: p.vasosDescartables.id, locationId: express.id, quantity: 150, minQuantity: 80, maxQuantity: 300 },

    // ── Café Belgrano (similar to Palermo) ───────────────────
    { productId: p.cafeGrano.id, locationId: belgrano.id, quantity: 6, minQuantity: 3, maxQuantity: 12 },
    { productId: p.cafeMolido.id, locationId: belgrano.id, quantity: 4, minQuantity: 3, maxQuantity: 10 },    // ~ MEDIUM
    { productId: p.descafeinado.id, locationId: belgrano.id, quantity: 2, minQuantity: 1.5, maxQuantity: 6 },
    { productId: p.lecheEntera.id, locationId: belgrano.id, quantity: 12, minQuantity: 8, maxQuantity: 25 },
    { productId: p.lecheDescremada.id, locationId: belgrano.id, quantity: 6, minQuantity: 4, maxQuantity: 15 },
    { productId: p.crema.id, locationId: belgrano.id, quantity: 2.5, minQuantity: 2, maxQuantity: 6 },
    { productId: p.quesoCremoso.id, locationId: belgrano.id, quantity: 2, minQuantity: 1.5, maxQuantity: 5 },
    { productId: p.manteca.id, locationId: belgrano.id, quantity: 1.5, minQuantity: 1, maxQuantity: 4 },
    { productId: p.azucar.id, locationId: belgrano.id, quantity: 4, minQuantity: 2, maxQuantity: 8 },
    { productId: p.cacaoPolvo.id, locationId: belgrano.id, quantity: 1.5, minQuantity: 1, maxQuantity: 4 },
    { productId: p.jamon.id, locationId: belgrano.id, quantity: 2, minQuantity: 1.5, maxQuantity: 5 },
    { productId: p.panDeMiga.id, locationId: belgrano.id, quantity: 12, minQuantity: 6, maxQuantity: 25 },
    { productId: p.medialuna.id, locationId: belgrano.id, quantity: 20, minQuantity: 12, maxQuantity: 40 },
    { productId: p.facturas.id, locationId: belgrano.id, quantity: 4, minQuantity: 3, maxQuantity: 8 },
    { productId: p.brownie.id, locationId: belgrano.id, quantity: 8, minQuantity: 5, maxQuantity: 20 },
    { productId: p.tartaFrutas.id, locationId: belgrano.id, quantity: 3, minQuantity: 2, maxQuantity: 6 },
    { productId: p.aguaMineral.id, locationId: belgrano.id, quantity: 30, minQuantity: 12, maxQuantity: 60 },
    { productId: p.jugoNaranja.id, locationId: belgrano.id, quantity: 4, minQuantity: 2, maxQuantity: 8 },
    { productId: p.gaseosaCola.id, locationId: belgrano.id, quantity: 6, minQuantity: 4, maxQuantity: 15 },
    { productId: p.cervezaArtesanal.id, locationId: belgrano.id, quantity: 15, minQuantity: 6, maxQuantity: 25 },
    { productId: p.servilletas.id, locationId: belgrano.id, quantity: 6, minQuantity: 3, maxQuantity: 12 },
    { productId: p.vasosDescartables.id, locationId: belgrano.id, quantity: 250, minQuantity: 80, maxQuantity: 400 },
  ];

  await prisma.stockLevel.createMany({ data: stockData });
  console.log(`  ✓ ${stockData.length} niveles de stock creados`);

  // ════════════════════════════════════════════════════════════
  // 8. RECIPES
  // ════════════════════════════════════════════════════════════
  console.log('📋 Creando recetas...');

  const recipeCappuccino = await prisma.recipe.create({
    data: {
      name: 'Cappuccino',
      description: 'Espresso con leche espumada y cacao en polvo',
      category: 'Bebidas Calientes',
      yieldQty: 1,
      yieldUnit: 'taza',
      productId: p.cappuccino.id,
      prepTimeMin: 5,
      instructions:
        '1. Preparar un shot de espresso doble (18g café molido)\n' +
        '2. Vaporizar 150ml de leche hasta obtener espuma cremosa\n' +
        '3. Verter el espresso en la taza\n' +
        '4. Agregar la leche espumada con movimiento circular\n' +
        '5. Espolvorear cacao en polvo por encima',
      createdById: admin.id,
      ingredients: {
        create: [
          { productId: p.cafeMolido.id, qtyPerYield: 0.018, unit: 'kg', sortOrder: 1 },
          { productId: p.lecheEntera.id, qtyPerYield: 0.15, unit: 'L', sortOrder: 2 },
          { productId: p.cacaoPolvo.id, qtyPerYield: 0.005, unit: 'kg', sortOrder: 3 },
        ],
      },
    },
  });

  const recipeMedialuna = await prisma.recipe.create({
    data: {
      name: 'Medialuna de Manteca',
      description: 'Medialunas de manteca artesanales, receta clásica argentina',
      category: 'Panadería',
      yieldQty: 12,
      yieldUnit: 'unidad',
      productId: p.medialuna.id,
      prepTimeMin: 180,
      instructions:
        '1. Mezclar harina, azúcar y levadura disuelta en leche tibia\n' +
        '2. Incorporar manteca pomada y amasar hasta lograr masa elástica\n' +
        '3. Dejar leudar 1 hora tapada con repasador húmedo\n' +
        '4. Estirar la masa y cortar triángulos\n' +
        '5. Enrollar cada triángulo en forma de medialuna\n' +
        '6. Dejar leudar 30 minutos más sobre la placa\n' +
        '7. Pincelar con huevo batido\n' +
        '8. Hornear a 200°C por 15-18 minutos hasta dorar',
      createdById: admin.id,
      ingredients: {
        create: [
          { productId: p.harina.id, qtyPerYield: 0.5, unit: 'kg', sortOrder: 1 },
          { productId: p.manteca.id, qtyPerYield: 0.15, unit: 'kg', sortOrder: 2 },
          { productId: p.azucar.id, qtyPerYield: 0.05, unit: 'kg', sortOrder: 3 },
          { productId: p.levadura.id, qtyPerYield: 0.02, unit: 'kg', sortOrder: 4 },
        ],
      },
    },
  });

  const recipeTostado = await prisma.recipe.create({
    data: {
      name: 'Tostado de Jamón y Queso',
      description: 'Clásico tostado argentino de jamón cocido y queso cremoso en pan de miga',
      category: 'Comidas',
      yieldQty: 1,
      yieldUnit: 'unidad',
      productId: p.tostado.id,
      prepTimeMin: 8,
      instructions:
        '1. Tomar 2 rebanadas de pan de miga\n' +
        '2. Colocar fetas de jamón cocido\n' +
        '3. Agregar fetas de queso cremoso\n' +
        '4. Cerrar el sándwich\n' +
        '5. Tostar en plancha caliente 3-4 min por lado\n' +
        '6. Cortar en diagonal y servir caliente',
      createdById: admin.id,
      ingredients: {
        create: [
          { productId: p.panDeMiga.id, qtyPerYield: 2, unit: 'unidad', sortOrder: 1 },
          { productId: p.jamon.id, qtyPerYield: 0.08, unit: 'kg', sortOrder: 2 },
          { productId: p.quesoCremoso.id, qtyPerYield: 0.06, unit: 'kg', sortOrder: 3 },
        ],
      },
    },
  });

  const recipeEnsalada = await prisma.recipe.create({
    data: {
      name: 'Ensalada César',
      description: 'Ensalada César con pollo grillado, parmesano y croutons caseros',
      category: 'Comidas',
      yieldQty: 1,
      yieldUnit: 'porción',
      productId: p.ensaladaCesar.id,
      prepTimeMin: 15,
      instructions:
        '1. Lavar y trozar la lechuga con las manos\n' +
        '2. Grillar la pechuga de pollo y cortar en tiras\n' +
        '3. Tostar cubos de pan de miga para croutons\n' +
        '4. Armar el plato con lechuga como base\n' +
        '5. Agregar pollo, croutons y queso rallado\n' +
        '6. Aderezar con salsa César al momento de servir',
      createdById: admin.id,
      ingredients: {
        create: [
          { productId: p.lechuga.id, qtyPerYield: 0.15, unit: 'kg', sortOrder: 1 },
          { productId: p.pollo.id, qtyPerYield: 0.12, unit: 'kg', sortOrder: 2 },
          { productId: p.quesoCremoso.id, qtyPerYield: 0.04, unit: 'kg', sortOrder: 3 },
          { productId: p.panDeMiga.id, qtyPerYield: 1, unit: 'unidad', sortOrder: 4, notes: 'Para croutons' },
        ],
      },
    },
  });

  const recipeBrownie = await prisma.recipe.create({
    data: {
      name: 'Brownie de Chocolate',
      description: 'Brownie húmedo de chocolate semiamargo con nueces',
      category: 'Pastelería',
      yieldQty: 12,
      yieldUnit: 'unidad',
      productId: p.brownie.id,
      prepTimeMin: 45,
      instructions:
        '1. Derretir chocolate con manteca a baño María\n' +
        '2. Batir huevos con azúcar hasta punto letra\n' +
        '3. Incorporar la mezcla de chocolate tibia\n' +
        '4. Agregar harina tamizada con movimientos envolventes\n' +
        '5. Volcar en molde de 30x20 enmantecado y enharinado\n' +
        '6. Hornear a 180°C por 25-30 minutos\n' +
        '7. Dejar enfriar completamente antes de cortar en 12 porciones',
      createdById: admin.id,
      ingredients: {
        create: [
          { productId: p.chocolateCobertura.id, qtyPerYield: 0.2, unit: 'kg', sortOrder: 1 },
          { productId: p.harina.id, qtyPerYield: 0.15, unit: 'kg', sortOrder: 2 },
          { productId: p.azucar.id, qtyPerYield: 0.2, unit: 'kg', sortOrder: 3 },
          { productId: p.manteca.id, qtyPerYield: 0.15, unit: 'kg', sortOrder: 4 },
          { productId: p.huevos.id, qtyPerYield: 4, unit: 'unidad', sortOrder: 5 },
        ],
      },
    },
  });

  console.log('  ✓ 5 recetas creadas');

  // ════════════════════════════════════════════════════════════
  // 9. TABLES
  // ════════════════════════════════════════════════════════════
  console.log('🪑 Creando mesas...');

  const tablesData = [
    // ── Café Palermo – 8 mesas ──
    ...Array.from({ length: 5 }, (_, i) => ({
      locationId: palermo.id,
      name: `Mesa ${i + 1}`,
      zone: 'Salón',
      capacity: i < 3 ? 2 : 4,
      sortOrder: i + 1,
      positionX: (i % 3) * 120,
      positionY: Math.floor(i / 3) * 120,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      locationId: palermo.id,
      name: `Mesa ${i + 6}`,
      zone: 'Vereda',
      capacity: i === 2 ? 4 : 2,
      sortOrder: i + 6,
      positionX: i * 120,
      positionY: 300,
    })),

    // ── Restaurante Recoleta – 15 mesas ──
    ...Array.from({ length: 8 }, (_, i) => ({
      locationId: recoleta.id,
      name: `Mesa ${i + 1}`,
      zone: 'Salón Principal',
      capacity: i < 4 ? 4 : 6,
      sortOrder: i + 1,
      positionX: (i % 4) * 140,
      positionY: Math.floor(i / 4) * 140,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      locationId: recoleta.id,
      name: `Mesa ${i + 9}`,
      zone: 'Terraza',
      capacity: 4,
      sortOrder: i + 9,
      positionX: i * 140,
      positionY: 350,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      locationId: recoleta.id,
      name: `Mesa ${i + 13}`,
      zone: 'VIP',
      capacity: i === 2 ? 6 : 2,
      sortOrder: i + 13,
      positionX: i * 160,
      positionY: 500,
    })),

    // ── Café Belgrano – 6 mesas ──
    ...Array.from({ length: 4 }, (_, i) => ({
      locationId: belgrano.id,
      name: `Mesa ${i + 1}`,
      zone: 'Interior',
      capacity: i < 2 ? 2 : 4,
      sortOrder: i + 1,
      positionX: (i % 2) * 120,
      positionY: Math.floor(i / 2) * 120,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      locationId: belgrano.id,
      name: `Mesa ${i + 5}`,
      zone: 'Vereda',
      capacity: 2,
      sortOrder: i + 5,
      positionX: i * 120,
      positionY: 280,
    })),
  ];

  await prisma.table.createMany({ data: tablesData });
  console.log(`  ✓ ${tablesData.length} mesas creadas`);

  // ════════════════════════════════════════════════════════════
  // 10. ALERTS
  // ════════════════════════════════════════════════════════════
  console.log('🚨 Creando alertas...');

  const alertsData = [
    {
      locationId: palermo.id,
      type: 'stock_critical',
      priority: 'critical',
      title: 'Stock crítico: Café molido',
      message:
        'El stock de Café molido en Café Palermo está en 1.5 kg, por debajo del mínimo de 3 kg. Se requiere reposición urgente.',
      referenceType: 'product',
      referenceId: p.cafeMolido.id,
      status: 'active',
      createdAt: hoursAgo(2),
    },
    {
      locationId: palermo.id,
      type: 'stock_critical',
      priority: 'critical',
      title: 'Stock crítico: Leche entera',
      message:
        'El stock de Leche entera en Café Palermo está en 4 L, por debajo del mínimo de 10 L. Se requiere reposición urgente.',
      referenceType: 'product',
      referenceId: p.lecheEntera.id,
      status: 'active',
      createdAt: hoursAgo(3),
    },
    {
      locationId: recoleta.id,
      type: 'stock_critical',
      priority: 'critical',
      title: 'Stock crítico: Pollo',
      message:
        'El stock de Pollo en Restaurante Recoleta está en 1.5 kg, por debajo del mínimo de 5 kg. Se requiere reposición urgente.',
      referenceType: 'product',
      referenceId: p.pollo.id,
      status: 'active',
      createdAt: hoursAgo(1),
    },
    {
      locationId: express.id,
      type: 'stock_critical',
      priority: 'high',
      title: 'Stock crítico: Medialunas',
      message:
        'El stock de Medialunas en Express Microcentro está en 3 unidades, muy por debajo del mínimo de 15. Solicitar envío desde depósito.',
      referenceType: 'product',
      referenceId: p.medialuna.id,
      status: 'active',
      createdAt: hoursAgo(4),
    },
    {
      locationId: express.id,
      type: 'stock_critical',
      priority: 'high',
      title: 'Stock bajo: Agua mineral',
      message:
        'El stock de Agua mineral 500ml en Express Microcentro está en 8 unidades, por debajo del mínimo de 20.',
      referenceType: 'product',
      referenceId: p.aguaMineral.id,
      status: 'active',
      createdAt: hoursAgo(5),
    },
    {
      locationId: palermo.id,
      type: 'stock_low',
      priority: 'medium',
      title: 'Stock bajo: Azúcar',
      message:
        'El stock de Azúcar en Café Palermo está en 3 kg, cercano al mínimo de 2 kg. Considerar reposición preventiva.',
      referenceType: 'product',
      referenceId: p.azucar.id,
      status: 'active',
      createdAt: hoursAgo(6),
    },
    {
      type: 'ai_prediction',
      priority: 'medium',
      title: 'Predicción IA: Alta demanda de café este fin de semana',
      message:
        'Basado en datos históricos y eventos cercanos, se predice un aumento del 35% en el consumo de café para el próximo fin de semana. Se recomienda aumentar el stock en todas las sucursales.',
      status: 'active',
      createdAt: hoursAgo(8),
    },
    {
      type: 'ai_prediction',
      priority: 'low',
      title: 'Predicción IA: Tendencia de cerveza artesanal',
      message:
        'Se detecta una tendencia creciente en el consumo de cerveza artesanal en Café Palermo (+20% mes a mes). Considerar ampliar la oferta.',
      status: 'active',
      createdAt: daysAgo(1),
    },
  ];

  await prisma.alert.createMany({ data: alertsData });
  console.log(`  ✓ ${alertsData.length} alertas creadas`);

  // ════════════════════════════════════════════════════════════
  // 11. AI EVENTS
  // ════════════════════════════════════════════════════════════
  console.log('🤖 Creando eventos de IA...');

  const aiEventsData = [
    {
      type: 'stock_prediction',
      severity: 'warning',
      title: 'Predicción de quiebre de stock: Café molido',
      description:
        'El modelo predictivo estima que el stock de Café molido en Café Palermo llegará a cero en 2 días basado en la tasa de consumo actual de 0.75 kg/día.',
      data: JSON.stringify({
        product: 'Café molido',
        location: 'Café Palermo',
        daysToStockout: 2,
        dailyConsumption: 0.75,
        currentStock: 1.5,
      }),
      relatedEntity: 'product',
      relatedId: p.cafeMolido.id,
      status: 'active',
      createdAt: hoursAgo(2),
    },
    {
      type: 'stock_prediction',
      severity: 'warning',
      title: 'Predicción de quiebre de stock: Leche entera',
      description:
        'Se estima que el stock de Leche entera en Café Palermo se agotará en 1.5 días. Consumo promedio: 2.7 L/día.',
      data: JSON.stringify({
        product: 'Leche entera',
        location: 'Café Palermo',
        daysToStockout: 1.5,
        dailyConsumption: 2.7,
        currentStock: 4,
      }),
      relatedEntity: 'product',
      relatedId: p.lecheEntera.id,
      status: 'active',
      createdAt: hoursAgo(3),
    },
    {
      type: 'purchase_suggestion',
      severity: 'info',
      title: 'Sugerencia de compra: Pedido semanal de lácteos',
      description:
        'Basado en el consumo proyectado para la semana, se sugiere realizar el siguiente pedido a Distribuidora Lácteos BA: 100L leche entera, 50L leche descremada, 15L crema, 10kg queso cremoso.',
      data: JSON.stringify({
        supplier: 'Distribuidora Lácteos BA',
        items: [
          { product: 'Leche entera', qty: 100, unit: 'L' },
          { product: 'Leche descremada', qty: 50, unit: 'L' },
          { product: 'Crema de leche', qty: 15, unit: 'L' },
          { product: 'Queso cremoso', qty: 10, unit: 'kg' },
        ],
        estimatedTotal: 287500,
      }),
      relatedEntity: 'supplier',
      relatedId: supLacteos.id,
      status: 'active',
      createdAt: hoursAgo(12),
    },
    {
      type: 'anomaly_detection',
      severity: 'warning',
      title: 'Anomalía detectada: Consumo inusual de azúcar',
      description:
        'Se detectó un consumo de azúcar 45% superior al promedio en Restaurante Recoleta durante los últimos 3 días. Verificar posible desperdicio o error de registro.',
      data: JSON.stringify({
        product: 'Azúcar',
        location: 'Restaurante Recoleta',
        expectedConsumption: 2.1,
        actualConsumption: 3.05,
        deviationPct: 45,
      }),
      relatedEntity: 'product',
      relatedId: p.azucar.id,
      status: 'active',
      createdAt: daysAgo(1),
    },
    {
      type: 'stock_prediction',
      severity: 'info',
      title: 'Pronóstico semanal: Demanda estable',
      description:
        'El análisis predictivo indica demanda estable para la próxima semana en todas las sucursales. No se anticipan variaciones significativas respecto al promedio histórico.',
      data: JSON.stringify({
        period: 'next_week',
        trend: 'stable',
        confidence: 0.87,
      }),
      status: 'active',
      createdAt: daysAgo(1),
    },
    {
      type: 'anomaly_detection',
      severity: 'info',
      title: 'Patrón detectado: Pico de ventas martes por la tarde',
      description:
        'Se identificó un patrón recurrente de aumento de ventas los martes entre 15:00 y 18:00 en Café Belgrano, correlacionado con eventos de la zona. Considerar reforzar staff.',
      data: JSON.stringify({
        location: 'Café Belgrano',
        pattern: 'tuesday_afternoon_peak',
        avgIncrease: '28%',
        timeRange: '15:00-18:00',
      }),
      status: 'active',
      createdAt: daysAgo(2),
    },
  ];

  await prisma.aIEvent.createMany({ data: aiEventsData });
  console.log(`  ✓ ${aiEventsData.length} eventos de IA creados`);

  // ════════════════════════════════════════════════════════════
  // 12. GOODS RECEIPTS
  // ════════════════════════════════════════════════════════════
  console.log('📥 Creando recepciones de mercadería...');

  // Receipt 1: Coffee delivery to warehouse – confirmed
  await prisma.goodsReceipt.create({
    data: {
      locationId: deposito.id,
      supplierId: supCafe.id,
      receiptNumber: 'REC-2026-001',
      invoiceNumber: 'FC-A-0001-00045678',
      invoiceDate: daysAgo(3),
      method: 'manual',
      status: 'confirmed',
      totalAmount: 995000,
      notes: 'Entrega mensual de café – todo en orden',
      userId: depositoMgr.id,
      confirmedById: admin.id,
      confirmedAt: daysAgo(3),
      createdAt: daysAgo(3),
      items: {
        create: [
          {
            productId: p.cafeGrano.id,
            orderedQty: 50,
            receivedQty: 50,
            unitCost: 12000,
            lotNumber: 'LOT-CDS-2026-0089',
          },
          {
            productId: p.cafeMolido.id,
            orderedQty: 30,
            receivedQty: 30,
            unitCost: 8500,
            lotNumber: 'LOT-CDS-2026-0090',
          },
          {
            productId: p.descafeinado.id,
            orderedQty: 10,
            receivedQty: 10,
            unitCost: 14000,
            lotNumber: 'LOT-CDS-2026-0091',
          },
        ],
      },
    },
  });

  // Receipt 2: Dairy delivery to warehouse – draft (pending verification)
  await prisma.goodsReceipt.create({
    data: {
      locationId: deposito.id,
      supplierId: supLacteos.id,
      receiptNumber: 'REC-2026-002',
      method: 'manual',
      status: 'draft',
      totalAmount: 286500,
      notes: 'Pendiente de verificación de cantidades',
      userId: depositoMgr.id,
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: p.lecheEntera.id,
            orderedQty: 100,
            receivedQty: 100,
            unitCost: 950,
            expiryDate: daysFromNow(7),
          },
          {
            productId: p.crema.id,
            orderedQty: 20,
            receivedQty: 18,
            unitCost: 3200,
            expiryDate: daysFromNow(5),
            notes: 'Faltaron 2L – reclamar al proveedor',
          },
          {
            productId: p.quesoCremoso.id,
            orderedQty: 15,
            receivedQty: 15,
            unitCost: 8500,
            expiryDate: daysFromNow(14),
          },
        ],
      },
    },
  });

  // Receipt 3: Fresh produce to restaurant – confirmed
  await prisma.goodsReceipt.create({
    data: {
      locationId: recoleta.id,
      supplierId: supFrutas.id,
      receiptNumber: 'REC-2026-003',
      invoiceNumber: 'FC-B-0002-00012345',
      invoiceDate: daysAgo(1),
      method: 'manual',
      status: 'confirmed',
      totalAmount: 74000,
      userId: recoletaMgr.id,
      confirmedById: recoletaMgr.id,
      confirmedAt: daysAgo(1),
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: p.tomate.id,
            orderedQty: 20,
            receivedQty: 20,
            unitCost: 2800,
            expiryDate: daysFromNow(5),
          },
          {
            productId: p.lechuga.id,
            orderedQty: 10,
            receivedQty: 10,
            unitCost: 1800,
            expiryDate: daysFromNow(3),
          },
        ],
      },
    },
  });

  console.log('  ✓ 3 recepciones de mercadería creadas');

  // ════════════════════════════════════════════════════════════
  // 13. PRODUCTION ORDERS
  // ════════════════════════════════════════════════════════════
  console.log('🏭 Creando órdenes de producción...');

  // Order 1: Cappuccino batch – completed
  await prisma.productionOrder.create({
    data: {
      orderNumber: 'PROD-2026-001',
      recipeId: recipeCappuccino.id,
      locationId: deposito.id,
      plannedQty: 50,
      actualQty: 48,
      status: 'completed',
      estimatedCost: 27500,
      actualCost: 26400,
      laborCost: 5000,
      wasteQty: 2,
      wasteNotes: '2 tazas con espuma defectuosa',
      plannedDate: daysAgo(2),
      startedAt: daysAgo(2),
      completedAt: daysAgo(2),
      createdById: depositoMgr.id,
      startedById: depositoMgr.id,
      completedById: depositoMgr.id,
      createdAt: daysAgo(3),
      items: {
        create: [
          { productId: p.cafeMolido.id, plannedQty: 0.9, actualQty: 0.9, unitCost: 8500, status: 'completed' },
          { productId: p.lecheEntera.id, plannedQty: 7.5, actualQty: 7.8, unitCost: 950, status: 'completed' },
          { productId: p.cacaoPolvo.id, plannedQty: 0.25, actualQty: 0.25, unitCost: 7800, status: 'completed' },
        ],
      },
    },
  });

  // Order 2: Brownie batch – in progress
  await prisma.productionOrder.create({
    data: {
      orderNumber: 'PROD-2026-002',
      recipeId: recipeBrownie.id,
      locationId: deposito.id,
      plannedQty: 2,
      status: 'in_progress',
      estimatedCost: 15800,
      plannedDate: now,
      startedAt: hoursAgo(1),
      createdById: depositoMgr.id,
      startedById: depositoMgr.id,
      createdAt: hoursAgo(3),
      items: {
        create: [
          { productId: p.chocolateCobertura.id, plannedQty: 0.4, unitCost: 9500, status: 'in_progress' },
          { productId: p.harina.id, plannedQty: 0.3, unitCost: 650, status: 'in_progress' },
          { productId: p.azucar.id, plannedQty: 0.4, unitCost: 850, status: 'in_progress' },
          { productId: p.manteca.id, plannedQty: 0.3, unitCost: 7800, status: 'in_progress' },
          { productId: p.huevos.id, plannedQty: 8, unitCost: 180, status: 'pending' },
        ],
      },
    },
  });

  // Order 3: Medialuna batch – draft (AI suggested)
  await prisma.productionOrder.create({
    data: {
      orderNumber: 'PROD-2026-003',
      recipeId: recipeMedialuna.id,
      locationId: deposito.id,
      plannedQty: 5,
      status: 'draft',
      estimatedCost: 28500,
      plannedDate: daysFromNow(1),
      createdById: depositoMgr.id,
      aiSuggested: true,
      notes: 'Sugerido por IA – stock de medialunas bajo en sucursales',
      items: {
        create: [
          { productId: p.harina.id, plannedQty: 2.5, unitCost: 650, status: 'pending' },
          { productId: p.manteca.id, plannedQty: 0.75, unitCost: 7800, status: 'pending' },
          { productId: p.azucar.id, plannedQty: 0.25, unitCost: 850, status: 'pending' },
          { productId: p.levadura.id, plannedQty: 0.1, unitCost: 4200, status: 'pending' },
        ],
      },
    },
  });

  console.log('  ✓ 3 órdenes de producción creadas');

  // ════════════════════════════════════════════════════════════
  // 14. SHIPMENTS
  // ════════════════════════════════════════════════════════════
  console.log('🚚 Creando envíos...');

  // Shipment 1: Depósito → Café Palermo – delivered
  await prisma.shipment.create({
    data: {
      shipmentNumber: 'SHP-2026-001',
      originId: deposito.id,
      destinationId: palermo.id,
      status: 'delivered',
      estimatedArrival: daysAgo(2),
      dispatchedAt: daysAgo(2),
      deliveredAt: daysAgo(2),
      receivedAt: daysAgo(2),
      totalItems: 3,
      notes: 'Reposición semanal Palermo',
      createdById: logistics.id,
      dispatchedById: logistics.id,
      receivedById: palermoMgr.id,
      approvedById: palermoMgr.id,
      createdAt: daysAgo(3),
      items: {
        create: [
          { productId: p.cafeMolido.id, sentQty: 5, receivedQty: 5, unitCost: 8500 },
          { productId: p.lecheEntera.id, sentQty: 20, receivedQty: 20, unitCost: 950 },
          {
            productId: p.medialuna.id,
            sentQty: 50,
            receivedQty: 48,
            unitCost: 350,
            diffReason: '2 medialunas dañadas en transporte',
          },
        ],
      },
    },
  });

  // Shipment 2: Depósito → Restaurante Recoleta – dispatched
  await prisma.shipment.create({
    data: {
      shipmentNumber: 'SHP-2026-002',
      originId: deposito.id,
      destinationId: recoleta.id,
      status: 'dispatched',
      estimatedArrival: now,
      dispatchedAt: hoursAgo(2),
      totalItems: 3,
      notes: 'Pedido urgente – stock bajo de proteínas',
      createdById: logistics.id,
      dispatchedById: logistics.id,
      createdAt: hoursAgo(4),
      items: {
        create: [
          { productId: p.pollo.id, sentQty: 10, unitCost: 4200, lotNumber: 'LOT-FFM-2026-0234' },
          { productId: p.lechuga.id, sentQty: 5, unitCost: 1800 },
          { productId: p.quesoCremoso.id, sentQty: 3, unitCost: 8500 },
        ],
      },
    },
  });

  // Shipment 3: Depósito → Express Microcentro – draft
  await prisma.shipment.create({
    data: {
      shipmentNumber: 'SHP-2026-003',
      originId: deposito.id,
      destinationId: express.id,
      status: 'draft',
      totalItems: 2,
      notes: 'Reposición programada para mañana',
      createdById: logistics.id,
      items: {
        create: [
          { productId: p.aguaMineral.id, sentQty: 100, unitCost: 450 },
          { productId: p.cafeMolido.id, sentQty: 2, unitCost: 8500 },
        ],
      },
    },
  });

  console.log('  ✓ 3 envíos creados');

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════
  console.log('\n✅ Seed completado exitosamente!');
  console.log('───────────────────────────────────────');
  console.log('  📍 Ubicaciones:       5');
  console.log('  👤 Usuarios:          8');
  console.log('  📁 Categorías:        8');
  console.log('  🏭 Proveedores:       5');
  console.log(`  📦 Productos:         ${productCount}`);
  console.log(`  🔗 Prod-Proveedor:    ${productSupplierData.length}`);
  console.log(`  📊 Niveles de stock:  ${stockData.length}`);
  console.log('  📋 Recetas:           5');
  console.log(`  🪑 Mesas:             ${tablesData.length}`);
  console.log(`  🚨 Alertas:           ${alertsData.length}`);
  console.log(`  🤖 Eventos IA:        ${aiEventsData.length}`);
  console.log('  📥 Recepciones:       3');
  console.log('  🏭 Órdenes prod.:     3');
  console.log('  🚚 Envíos:            3');
  console.log('───────────────────────────────────────\n');
}

// ══════════════════════════════════════════════════════════════
// Execute
// ══════════════════════════════════════════════════════════════
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
