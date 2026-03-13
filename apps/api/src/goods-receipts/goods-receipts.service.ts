import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { CreateGoodsReceiptItemDto } from './dto/create-goods-receipt-item.dto';
import { UpdateGoodsReceiptItemDto } from './dto/update-goods-receipt-item.dto';
import OpenAI from 'openai';
import * as fs from 'fs';

@Injectable()
export class GoodsReceiptsService {
  private readonly logger = new Logger(GoodsReceiptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    locationId?: string;
    supplierId?: string;
    status?: string;
    method?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      locationId,
      supplierId,
      status,
      method,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (locationId) where.locationId = locationId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (method) where.method = method;

    if (dateFrom || dateTo) {
      const createdAt: Record<string, unknown> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) createdAt.lte = new Date(dateTo);
      where.createdAt = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true, type: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unit: true,
                avgCost: true,
              },
            },
          },
        },
        supplier: true,
        location: { select: { id: true, name: true, type: true } },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        confirmedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sourcePurchaseOrder: {
          select: { id: true, orderNumber: true },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Goods receipt with ID "${id}" not found`);
    }

    return receipt;
  }

  /** Comparación de precios: último precio vs actual por ítem (para pre-compra e IA) */
  async getPriceComparison(receiptId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, sku: true, name: true, unit: true },
            },
          },
        },
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Goods receipt with ID "${receiptId}" not found`);
    }

    const itemsWithComparison = await Promise.all(
      receipt.items.map(async (item) => {
        const previous = await this.prisma.supplierPriceHistory.findFirst({
          where: {
            supplierId: receipt.supplierId,
            productId: item.productId,
            ...(receipt.status === 'confirmed'
              ? { sourceReceiptId: { not: receiptId } }
              : {}),
          },
          orderBy: { recordedAt: 'desc' },
          select: { unitCost: true },
        });
        const previousUnitCost = previous?.unitCost ?? null;
        const currentUnitCost = item.unitCost;
        let change: 'up' | 'down' | 'same' = 'same';
        let changePercent: number | null = null;
        if (previousUnitCost != null && previousUnitCost > 0) {
          const pct =
            ((currentUnitCost - previousUnitCost) / previousUnitCost) * 100;
          changePercent = Math.round(pct * 100) / 100;
          if (changePercent > 0.01) change = 'up';
          else if (changePercent < -0.01) change = 'down';
        }
        return {
          itemId: item.id,
          productId: item.productId,
          productName: item.product?.name,
          sku: item.product?.sku,
          unit: item.product?.unit,
          currentUnitCost,
          previousUnitCost,
          change,
          changePercent,
        };
      }),
    );

    return {
      receiptId,
      supplierId: receipt.supplierId,
      supplierName: receipt.supplier?.name,
      items: itemsWithComparison,
    };
  }

  private todayDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async create(data: CreateGoodsReceiptDto, userId: string) {
    const method = data.method || 'manual';
    if (method === 'manual' && !data.invoiceDate) {
      throw new BadRequestException('La fecha de factura es obligatoria.');
    }
    if (data.invoiceDate) {
      const invStr = String(data.invoiceDate).slice(0, 10);
      const today = this.todayDateString();
      if (invStr < today) {
        throw new BadRequestException('La fecha de factura no puede ser anterior al día actual.');
      }
    }
    const receiptNumber = await this.generateReceiptNumber();

    const totalAmount = data.items.reduce(
      (sum, item) => sum + item.unitCost * item.receivedQty,
      0,
    );

    return this.prisma.goodsReceipt.create({
      data: {
        receiptNumber,
        locationId: data.locationId,
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        method: data.method || 'manual',
        invoiceImageUrl: data.invoiceImageUrl,
        ocrConfidence: data.ocrConfidence,
        ocrRawData: data.ocrRawData,
        notes: data.notes,
        status: 'draft',
        totalAmount,
        userId,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            orderedQty: item.orderedQty ?? item.receivedQty,
            receivedQty: item.receivedQty,
            unitCost: item.unitCost,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            notes: item.notes,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, sku: true, name: true, unit: true },
            },
          },
        },
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: UpdateGoodsReceiptDto) {
    const receipt = await this.findById(id);

    if (receipt.status !== 'draft') {
      throw new BadRequestException(
        'Only draft receipts can be updated',
      );
    }
    if (data.invoiceDate) {
      const invStr = String(data.invoiceDate).slice(0, 10);
      const today = this.todayDateString();
      if (invStr < today) {
        throw new BadRequestException('La fecha de factura no puede ser anterior al día actual.');
      }
    }

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        notes: data.notes,
        receivedByName: data.receivedByName,
        receivedBySignature: data.receivedBySignature,
      },
    });
  }

  async addItem(receiptId: string, data: CreateGoodsReceiptItemDto) {
    const receipt = await this.findById(receiptId);

    if (receipt.status !== 'draft') {
      throw new BadRequestException('Can only add items to draft receipts');
    }

    const item = await this.prisma.goodsReceiptItem.create({
      data: {
        receiptId,
        productId: data.productId,
        orderedQty: data.orderedQty ?? data.receivedQty,
        receivedQty: data.receivedQty,
        unitCost: data.unitCost,
        lotNumber: data.lotNumber,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        notes: data.notes,
      },
      include: {
        product: {
          select: { id: true, sku: true, name: true, unit: true },
        },
      },
    });

    await this.recalculateTotalAmount(receiptId);
    return item;
  }

  async updateItem(itemId: string, data: UpdateGoodsReceiptItemDto) {
    const item = await this.prisma.goodsReceiptItem.findUnique({
      where: { id: itemId },
      include: { receipt: { select: { status: true } } },
    });

    if (!item) {
      throw new NotFoundException(
        `Goods receipt item with ID "${itemId}" not found`,
      );
    }

    if (item.receipt.status !== 'draft') {
      throw new BadRequestException(
        'Can only update items on draft receipts',
      );
    }

    const updated = await this.prisma.goodsReceiptItem.update({
      where: { id: itemId },
      data: {
        productId: data.productId,
        orderedQty: data.orderedQty,
        receivedQty: data.receivedQty,
        unitCost: data.unitCost,
        lotNumber: data.lotNumber,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        notes: data.notes,
      },
      include: {
        product: {
          select: { id: true, sku: true, name: true, unit: true },
        },
      },
    });

    await this.recalculateTotalAmount(item.receiptId);
    return updated;
  }

  async removeItem(itemId: string) {
    const item = await this.prisma.goodsReceiptItem.findUnique({
      where: { id: itemId },
      include: { receipt: { select: { status: true } } },
    });

    if (!item) {
      throw new NotFoundException(
        `Goods receipt item with ID "${itemId}" not found`,
      );
    }

    if (item.receipt.status !== 'draft') {
      throw new BadRequestException(
        'Can only remove items from draft receipts',
      );
    }

    await this.prisma.goodsReceiptItem.delete({ where: { id: itemId } });
    await this.recalculateTotalAmount(item.receiptId);

    return { message: 'Item removed successfully' };
  }

  async confirm(id: string, userId: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!receipt) {
      throw new NotFoundException(`Goods receipt with ID "${id}" not found`);
    }

    if (receipt.status !== 'draft') {
      throw new BadRequestException('Only draft receipts can be confirmed');
    }

    if (receipt.items.length === 0) {
      throw new BadRequestException(
        'Cannot confirm a receipt with no items',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update receipt status
      const confirmedReceipt = await tx.goodsReceipt.update({
        where: { id },
        data: {
          status: 'confirmed',
          confirmedById: userId,
          confirmedAt: new Date(),
        },
      });

      // 2. Process each item
      for (const item of receipt.items) {
        // 2a. Create stock movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: receipt.locationId,
            type: 'goods_receipt',
            quantity: item.receivedQty,
            unitCost: item.unitCost,
            referenceType: 'goods_receipt',
            referenceId: receipt.id,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate,
            userId,
          },
        });

        // 2b. Upsert stock level
        const existingLevel = await tx.stockLevel.findUnique({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: receipt.locationId,
            },
          },
        });

        if (existingLevel) {
          await tx.stockLevel.update({
            where: { id: existingLevel.id },
            data: {
              quantity: { increment: item.receivedQty },
            },
          });
        } else {
          await tx.stockLevel.create({
            data: {
              productId: item.productId,
              locationId: receipt.locationId,
              quantity: item.receivedQty,
            },
          });
        }

        // 2c. Update product avgCost (weighted average)
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (product) {
          // Sum all stock levels for this product across all locations
          const stockAggregate = await tx.stockLevel.aggregate({
            where: { productId: item.productId },
            _sum: { quantity: true },
          });

          const currentTotalStock = stockAggregate._sum.quantity || 0;
          // Previous total stock = current total - what we just added
          const previousTotalStock = currentTotalStock - item.receivedQty;

          let newAvgCost: number;
          if (previousTotalStock <= 0) {
            // No previous stock, avg cost is the new unit cost
            newAvgCost = item.unitCost;
          } else {
            // Weighted average
            newAvgCost =
              (product.avgCost * previousTotalStock +
                item.unitCost * item.receivedQty) /
              currentTotalStock;
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              avgCost: Math.round(newAvgCost * 100) / 100,
              lastCost: item.unitCost,
            },
          });
        }

        // 2d. Historial de precios (para comparación e IA)
        await tx.supplierPriceHistory.create({
          data: {
            supplierId: receipt.supplierId,
            productId: item.productId,
            unitCost: item.unitCost,
            sourceReceiptId: receipt.id,
          },
        });
      }

      // 3. Orden de pago automática
      const totalAmount =
        receipt.totalAmount ??
        receipt.items.reduce(
          (sum, i) => sum + i.receivedQty * i.unitCost,
          0,
        );
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          supplierId: receipt.supplierId,
          goodsReceiptId: receipt.id,
          amount: Math.round(totalAmount * 100) / 100,
          status: 'pending',
          invoiceNumber: receipt.invoiceNumber ?? undefined,
        },
      });

      // 4. Notificación a administración
      const supplier = await tx.supplier.findUnique({
        where: { id: receipt.supplierId },
        select: { name: true },
      });
      await tx.alert.create({
        data: {
          locationId: receipt.locationId,
          type: 'payment_order',
          priority: 'medium',
          title: 'Nueva orden de pago',
          message: `Ingreso confirmado: ${supplier?.name ?? 'Proveedor'}. Monto: $${paymentOrder.amount.toLocaleString('es-AR')}. Factura: ${receipt.invoiceNumber ?? 'N/A'}. Ver órdenes de pago.`,
          referenceType: 'payment_order',
          referenceId: paymentOrder.id,
        },
      });

      return confirmedReceipt;
    });
  }

  async cancel(id: string) {
    const receipt = await this.findById(id);

    if (receipt.status === 'cancelled') {
      throw new BadRequestException('Receipt is already cancelled');
    }

    if (receipt.status === 'confirmed') {
      throw new BadRequestException(
        'Cannot cancel a confirmed receipt',
      );
    }

    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  // ── OCR Scan con OpenAI Vision ───────────────────────────────

  async processOcrScan(filePath: string, filename: string) {
    this.logger.log(`Processing OCR scan for file: ${filename}`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'tu-api-key-aqui') {
      throw new BadRequestException(
        'OPENAI_API_KEY no configurada. Agregá tu API key en apps/api/.env',
      );
    }

    try {
      // Read image and convert to base64
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = filename.match(/\.png$/i)
        ? 'image/png'
        : filename.match(/\.webp$/i)
          ? 'image/webp'
          : 'image/jpeg';

      // Get our products and suppliers for context
      const [products, suppliers] = await Promise.all([
        this.prisma.product.findMany({
          select: { id: true, sku: true, name: true, unit: true, lastCost: true, avgCost: true },
        }),
        this.prisma.supplier.findMany({
          select: { id: true, name: true, taxId: true },
        }),
      ]);

      const productList = products
        .map((p) => `- SKU: ${p.sku}, Nombre: "${p.name}", Unidad: ${p.unit}`)
        .join('\n');
      const supplierList = suppliers
        .map((s) => `- Nombre: "${s.name}", CUIT/ID fiscal: ${s.taxId || 'N/A'}`)
        .join('\n');

      // Call OpenAI Vision
      const openai = new OpenAI({ apiKey });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `Eres un asistente experto en leer facturas y remitos de proveedores gastronómicos/alimenticios.
Tu trabajo es extraer datos estructurados de la imagen de una factura.

PRODUCTOS CONOCIDOS en nuestro sistema:
${productList}

PROVEEDORES CONOCIDOS en nuestro sistema:
${supplierList}

Responde SIEMPRE en formato JSON válido (sin markdown, sin backticks) con esta estructura exacta:
{
  "invoiceNumber": "string o null",
  "invoiceDate": "YYYY-MM-DD o null",
  "supplierName": "nombre del emisor tal como aparece o null",
  "supplierTaxId": "CUIT/RUT/NIT del emisor o null",
  "total": numero o null,
  "confidence": numero de 0 a 100,
  "items": [
    {
      "description": "descripción tal como aparece en la factura",
      "quantity": numero,
      "unitCost": numero (precio unitario sin IVA si es posible),
      "total": numero (subtotal de la línea),
      "matchedSku": "SKU del producto que mejor coincide de la lista o null"
    }
  ]
}

Reglas:
- Los precios pueden estar en formato argentino (1.500,00) o estándar (1500.00). Devolvé siempre números decimales con punto.
- Si no podés leer un campo con certeza, poné null.
- Intentá matchear cada ítem con un SKU de la lista de productos conocidos. Si no hay coincidencia clara, poné null.
- El campo "confidence" es tu nivel de certeza general (0-100) sobre la lectura.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extraé todos los datos de esta factura/remito:',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      });

      const rawResponse = response.choices[0]?.message?.content || '';
      this.logger.log(`OpenAI response received (${rawResponse.length} chars)`);

      // Parse JSON response (handle possible markdown wrapping)
      let jsonStr = rawResponse.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        this.logger.error(`Failed to parse OpenAI JSON: ${jsonStr}`);
        throw new BadRequestException(
          'No se pudo interpretar la respuesta de IA. Intentá con una foto más clara.',
        );
      }

      // Match items to our product database
      const matchedItems = (parsed.items || []).map((item: any) => {
        let matchedProduct: (typeof products)[0] | null = null;
        let matchConfidence = 0;

        // First try the SKU match from OpenAI
        if (item.matchedSku) {
          matchedProduct =
            products.find((p) => p.sku === item.matchedSku) || null;
          if (matchedProduct) matchConfidence = 90;
        }

        // Fallback: fuzzy name match
        if (!matchedProduct) {
          const desc = (item.description || '').toLowerCase();
          for (const product of products) {
            const name = product.name.toLowerCase();
            if (name.includes(desc) || desc.includes(name)) {
              matchedProduct = product;
              matchConfidence = 75;
              break;
            }
            // Word overlap
            const descWords = desc.split(/\s+/).filter((w: string) => w.length > 2);
            const nameWords = name.split(/\s+/).filter((w) => w.length > 2);
            let overlap = 0;
            for (const dw of descWords) {
              if (nameWords.some((nw) => nw.includes(dw) || dw.includes(nw))) {
                overlap++;
              }
            }
            const score = descWords.length > 0 ? overlap / descWords.length : 0;
            if (score > 0.5 && score > matchConfidence / 100) {
              matchedProduct = product;
              matchConfidence = Math.round(score * 100);
            }
          }
        }

        return {
          description: item.description || 'Sin descripción',
          quantity: item.quantity || 1,
          unitCost: item.unitCost || 0,
          total: item.total || 0,
          matchedProduct: matchedProduct
            ? {
                id: matchedProduct.id,
                sku: matchedProduct.sku,
                name: matchedProduct.name,
                unit: matchedProduct.unit,
                lastCost: matchedProduct.lastCost,
              }
            : null,
          matchConfidence,
        };
      });

      // Match supplier
      let matchedSupplierId: string | null = null;
      if (parsed.supplierName || parsed.supplierTaxId) {
        for (const sup of suppliers) {
          if (
            parsed.supplierTaxId &&
            sup.taxId &&
            sup.taxId.replace(/[-.\s]/g, '') ===
              parsed.supplierTaxId.replace(/[-.\s]/g, '')
          ) {
            matchedSupplierId = sup.id;
            break;
          }
          if (
            parsed.supplierName &&
            sup.name.toLowerCase().includes(parsed.supplierName.toLowerCase().substring(0, 10))
          ) {
            matchedSupplierId = sup.id;
            break;
          }
        }
      }

      return {
        success: true,
        imageUrl: `/uploads/${filename}`,
        confidence: parsed.confidence || 80,
        rawText: rawResponse,
        parsed: {
          invoiceNumber: parsed.invoiceNumber || null,
          invoiceDate: parsed.invoiceDate || null,
          supplierName: parsed.supplierName || null,
          supplierTaxId: parsed.supplierTaxId || null,
          total: parsed.total || null,
          matchedSupplierId,
          items: matchedItems,
        },
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`OCR processing failed: ${err?.message || err}`);
      throw new BadRequestException(
        `Error procesando la imagen: ${err?.message || 'Error desconocido'}`,
      );
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private async generateReceiptNumber(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const prefix = `GR-${dateStr}-`;

    // Find the latest receipt with this date prefix
    const latest = await this.prisma.goodsReceipt.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });

    let sequence = 1;
    if (latest) {
      const lastSeq = parseInt(latest.receiptNumber.split('-').pop() || '0', 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${sequence.toString().padStart(3, '0')}`;
  }

  private async recalculateTotalAmount(receiptId: string): Promise<void> {
    const items = await this.prisma.goodsReceiptItem.findMany({
      where: { receiptId },
    });

    const totalAmount = items.reduce(
      (sum, item) => sum + item.unitCost * item.receivedQty,
      0,
    );

    await this.prisma.goodsReceipt.update({
      where: { id: receiptId },
      data: { totalAmount },
    });
  }
}
