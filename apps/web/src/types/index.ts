// Types for Nova System

export type StockStatus = "critical" | "medium" | "normal" | "excess"
export type OrderStatus = "open" | "in_progress" | "ready" | "served" | "billing" | "closed" | "cancelled"
export type ProductionStatus = "draft" | "pending" | "in_progress" | "completed" | "completed_adjusted" | "cancelled"
export type ShipmentStatus = "draft" | "prepared" | "dispatched" | "in_transit" | "reception_control" | "delivered" | "received" | "received_with_diff" | "closed" | "cancelled"
export type TableStatus = "available" | "occupied" | "ordering" | "billing" | "reserved" | "disabled"
export type AlertPriority = "low" | "medium" | "high" | "critical"
export type UserRole = "admin" | "location_manager" | "warehouse_manager" | "production_worker" | "logistics" | "cashier" | "waiter" | "kitchen" | "auditor"

export interface Product {
  id: string
  sku: string
  barcode?: string
  name: string
  description?: string
  category: Category
  unit: string
  imageUrl?: string
  avgCost: number
  lastCost: number
  salePrice: number
  isSellable: boolean
  isIngredient: boolean
  isProduced: boolean
  isPerishable: boolean
  isActive: boolean
  stockByLocation: StockLevel[]
  totalStock: number
  worstStatus: StockStatus
}

export interface Category {
  id: string
  name: string
  slug: string
  icon: string
  color: string
}

export interface StockLevel {
  locationId: string
  locationName: string
  quantity: number
  minQuantity: number
  maxQuantity?: number
  status: StockStatus
}

export interface StockMovement {
  id: string
  productName: string
  productSku: string
  locationName: string
  type: string
  quantity: number
  unitCost?: number
  reference?: string
  userName: string
  createdAt: string
}

export interface Location {
  id: string
  name: string
  slug: string
  type: "warehouse" | "cafe" | "restaurant" | "express"
  address?: string
  isActive: boolean
  isProduction: boolean
  hasTables: boolean
  lastHeartbeat?: string
  status: "online" | "offline" | "warning"
}

export interface Supplier {
  id: string
  name: string
  legalName?: string
  taxId?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  paymentTerms?: string
  isActive: boolean
}

export interface GoodsReceipt {
  id: string
  receiptNumber: string
  supplier: Supplier
  location: Location
  invoiceNumber?: string
  invoiceDate?: string
  method: "manual" | "ocr"
  ocrConfidence?: number
  status: "draft" | "pending_review" | "confirmed" | "cancelled"
  totalAmount: number
  itemsCount: number
  itemsWithDiff: number
  userName: string
  createdAt: string
}

export interface ProductionOrder {
  id: string
  orderNumber: string
  recipeName: string
  recipeVersion: string
  locationName: string
  plannedQty: number
  actualQty?: number
  status: ProductionStatus
  estimatedCost: number
  actualCost?: number
  unitCost: number
  plannedDate: string
  startedAt?: string
  completedAt?: string
  createdBy: string
  aiSuggested: boolean
}

export interface Recipe {
  id: string
  name: string
  version: string
  category: string
  yieldQty: number
  yieldUnit: string
  prepTimeMin: number
  isActive: boolean
  ingredients: RecipeIngredient[]
}

export interface RecipeIngredient {
  productId: string
  productName: string
  qtyPerYield: number
  unit: string
}

export interface Shipment {
  id: string
  shipmentNumber: string
  origin: Location
  destination: Location
  status: ShipmentStatus
  totalItems: number
  estimatedArrival?: string
  dispatchedAt?: string
  receivedAt?: string
  createdBy: string
  createdAt: string
  items: ShipmentItem[]
}

export interface ShipmentItem {
  productId: string
  productName: string
  sentQty: number
  receivedQty?: number
  difference?: number
  diffReason?: string
}

export interface TableInfo {
  id: string
  name: string
  zone: string
  capacity: number
  status: TableStatus
  currentOrderId?: string
  customerCount?: number
  occupiedMinutes?: number
  positionX: number
  positionY: number
}

export interface Order {
  id: string
  orderNumber: string
  type: "dine_in" | "takeaway" | "delivery" | "counter"
  tableName?: string
  status: OrderStatus
  customerCount: number
  subtotal: number
  total: number
  paymentMethod?: string
  waiterName?: string
  items: OrderItem[]
  openedAt: string
  closedAt?: string
}

export interface OrderItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  sector: "kitchen" | "bar" | "coffee" | "bakery" | "delivery"
  status: "pending" | "in_progress" | "ready" | "served" | "cancelled"
  notes?: string
  startedAt?: string
  readyAt?: string
}

export interface Alert {
  id: string
  type: string
  priority: AlertPriority
  title: string
  message: string
  locationName?: string
  status: "active" | "read" | "resolved" | "dismissed"
  createdAt: string
}

export interface AIEvent {
  id: string
  type: string
  severity: "info" | "warning" | "critical"
  title: string
  description: string
  status: "active" | "acknowledged" | "acted_upon" | "dismissed"
  createdAt: string
}

export interface DashboardKPIs {
  stockCritical: number
  productionPending: number
  movementsToday: number
  aiAlerts: number
  salesToday: number
  salesYesterday: number
  ordersToday: number
  activeLocations: number
  totalLocations: number
}

export interface ActivityItem {
  id: string
  time: string
  description: string
  type: "receipt" | "production" | "shipment" | "ai" | "cash" | "correction" | "order"
  userName: string
}
