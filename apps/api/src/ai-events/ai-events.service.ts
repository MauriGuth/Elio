import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAIEventDto } from './dto/create-ai-event.dto';
import { TakeActionDto } from './dto/take-action.dto';
import OpenAI from 'openai';

@Injectable()
export class AIEventsService {
  private readonly logger = new Logger(AIEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    type?: string;
    severity?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      type,
      severity,
      status,
      page = 1,
      limit = 20,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.aIEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actionBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.aIEvent.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const event = await this.prisma.aIEvent.findUnique({
      where: { id },
      include: {
        actionBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`AI event with ID "${id}" not found`);
    }

    return event;
  }

  async create(data: CreateAIEventDto) {
    return this.prisma.aIEvent.create({
      data: {
        type: data.type,
        severity: data.severity ?? 'info',
        title: data.title,
        description: data.description,
        data: data.data,
        relatedEntity: data.relatedEntity,
        relatedId: data.relatedId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
  }

  async takeAction(id: string, data: TakeActionDto, userId: string) {
    const event = await this.prisma.aIEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`AI event with ID "${id}" not found`);
    }

    return this.prisma.aIEvent.update({
      where: { id },
      data: {
        status: 'actioned',
        actionTaken: data.actionTaken,
        actionById: userId,
        actionAt: new Date(),
      },
      include: {
        actionBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async dismiss(id: string) {
    const event = await this.prisma.aIEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`AI event with ID "${id}" not found`);
    }

    return this.prisma.aIEvent.update({
      where: { id },
      data: { status: 'dismissed' },
    });
  }

  async getActive() {
    return this.prisma.aIEvent.findMany({
      where: {
        status: 'active',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        actionBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async generatePredictions() {
    // Placeholder for real AI - analyzes stock data and creates prediction events
    const stockLevels = await this.prisma.stockLevel.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } },
      },
    });

    const events: any[] = [];

    for (const sl of stockLevels) {
      // Simple heuristic: predict stockout if quantity is decreasing rapidly
      const recentMovements = await this.prisma.stockMovement.findMany({
        where: {
          productId: sl.productId,
          locationId: sl.locationId,
          type: 'sale',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
          },
        },
      });

      if (recentMovements.length === 0) continue;

      const totalConsumed = recentMovements.reduce(
        (sum, m) => sum + Math.abs(m.quantity),
        0,
      );
      const dailyRate = totalConsumed / 7;

      if (dailyRate === 0) continue;

      const daysUntilStockout = sl.quantity / dailyRate;

      if (daysUntilStockout <= 3) {
        // Check if prediction already exists
        const existing = await this.prisma.aIEvent.findFirst({
          where: {
            relatedEntity: 'stock_level',
            relatedId: sl.id,
            status: 'active',
            type: 'stockout_prediction',
          },
        });

        if (existing) continue;

        const event = await this.prisma.aIEvent.create({
          data: {
            type: 'stockout_prediction',
            severity: daysUntilStockout <= 1 ? 'critical' : 'warning',
            title: `Predicci\u00f3n de agotamiento: ${sl.product.name}`,
            description: `${sl.product.name} en ${sl.location.name} se agotar\u00e1 en aproximadamente ${Math.round(daysUntilStockout * 10) / 10} d\u00edas. Consumo diario promedio: ${Math.round(dailyRate * 10) / 10} unidades.`,
            data: JSON.stringify({
              productId: sl.productId,
              locationId: sl.locationId,
              currentQty: sl.quantity,
              dailyRate: Math.round(dailyRate * 10) / 10,
              daysUntilStockout: Math.round(daysUntilStockout * 10) / 10,
            }),
            relatedEntity: 'stock_level',
            relatedId: sl.id,
            expiresAt: new Date(
              Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000,
            ),
          },
        });

        events.push(event);
      }
    }

    return {
      generated: events.length,
      events,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // OpenAI helpers
  // ────────────────────────────────────────────────────────────────

  private getOpenAI(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'tu-api-key-aqui') {
      throw new BadRequestException(
        'OPENAI_API_KEY no configurada. Agregá tu API key en apps/api/.env',
      );
    }
    return new OpenAI({ apiKey });
  }

  // ────────────────────────────────────────────────────────────────
  // Análisis de Reportes con IA
  // ────────────────────────────────────────────────────────────────

  async analyzeReport(params: {
    dateFrom?: string;
    dateTo?: string;
    locationId?: string;
    reportType?: string;
  }) {
    this.logger.log('Generating AI report analysis...');
    const openai = this.getOpenAI();

    const dateFrom = params.dateFrom
      ? new Date(params.dateFrom)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = params.dateTo ? new Date(params.dateTo) : new Date();

    const movementWhere: any = {
      createdAt: { gte: dateFrom, lte: dateTo },
    };
    if (params.locationId) movementWhere.locationId = params.locationId;

    const [stockLevels, movements, receipts, locations, products, alerts] =
      await Promise.all([
        this.prisma.stockLevel.findMany({
          where: params.locationId
            ? { locationId: params.locationId }
            : undefined,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                salePrice: true,
                lastCost: true,
                avgCost: true,
                unit: true,
              },
            },
            location: { select: { id: true, name: true } },
          },
        }),
        this.prisma.stockMovement.findMany({
          where: movementWhere,
          include: {
            product: { select: { name: true, sku: true } },
            location: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        this.prisma.goodsReceipt.findMany({
          where: {
            createdAt: { gte: dateFrom, lte: dateTo },
            ...(params.locationId
              ? { locationId: params.locationId }
              : {}),
          },
          include: {
            supplier: { select: { name: true } },
            location: { select: { name: true } },
            items: {
              include: {
                product: { select: { name: true, sku: true } },
              },
            },
          },
          take: 100,
        }),
        this.prisma.location.findMany({
          select: { id: true, name: true, type: true },
        }),
        this.prisma.product.findMany({
          select: {
            id: true,
            name: true,
            sku: true,
            salePrice: true,
            lastCost: true,
            avgCost: true,
          },
        }),
        this.prisma.alert.findMany({
          where: { status: 'active' },
          select: {
            type: true,
            priority: true,
            title: true,
            message: true,
          },
          take: 20,
        }),
      ]);

    const criticalStock = stockLevels.filter(
      (sl) => sl.quantity <= sl.minQuantity,
    );
    const totalStockValue = stockLevels.reduce(
      (sum, sl) => sum + sl.quantity * (sl.product.avgCost ?? 0),
      0,
    );

    const movementsByType: Record<string, number> = {};
    movements.forEach((m) => {
      movementsByType[m.type] =
        (movementsByType[m.type] || 0) + Math.abs(m.quantity);
    });

    const totalReceiptsValue = receipts.reduce(
      (sum, r) => sum + (r.totalAmount ?? 0),
      0,
    );

    const lossMovements = movements.filter(
      (m) =>
        m.type === 'loss' ||
        m.type === 'damage' ||
        m.type === 'expired' ||
        m.type === 'correction',
    );
    const totalLossValue = lossMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantity) * (m.unitCost ?? 0),
      0,
    );

    const topByValue = [...stockLevels]
      .sort(
        (a, b) =>
          b.quantity * (b.product.avgCost ?? 0) -
          a.quantity * (a.product.avgCost ?? 0),
      )
      .slice(0, 10)
      .map((sl) => ({
        name: sl.product.name,
        location: sl.location.name,
        qty: sl.quantity,
        value: Math.round(sl.quantity * (sl.product.avgCost ?? 0)),
      }));

    const valueByLocation: Record<string, number> = {};
    stockLevels.forEach((sl) => {
      const locName = sl.location.name;
      valueByLocation[locName] =
        (valueByLocation[locName] || 0) +
        sl.quantity * (sl.product.avgCost ?? 0);
    });

    const dataContext = {
      periodo: {
        desde: dateFrom.toISOString().split('T')[0],
        hasta: dateTo.toISOString().split('T')[0],
      },
      resumen: {
        totalProductos: products.length,
        productosConStockCritico: criticalStock.length,
        valorTotalStock: Math.round(totalStockValue),
        totalLocales: locations.length,
      },
      movimientos: { total: movements.length, porTipo: movementsByType },
      ingresos: {
        totalComprobantes: receipts.length,
        valorTotal: Math.round(totalReceiptsValue),
      },
      perdidas: {
        movimientosPerdida: lossMovements.length,
        valorTotalPerdida: Math.round(totalLossValue),
      },
      topProductosPorValor: topByValue,
      valorPorLocal: valueByLocation,
      alertasActivas: alerts.map((a) => ({
        tipo: a.type,
        prioridad: a.priority,
        titulo: a.title,
      })),
      productosCriticos: criticalStock.slice(0, 15).map((sl) => ({
        producto: sl.product.name,
        local: sl.location.name,
        cantidad: sl.quantity,
        minimo: sl.minQuantity,
      })),
    };

    const reportType = params.reportType || 'general';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `Eres un analista de negocios experto en gastronomía y gestión de inventario.
Tu trabajo es analizar datos de stock, movimientos y compras para generar insights accionables.

Responde SIEMPRE en formato JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "resumenEjecutivo": "Párrafo breve (2-3 oraciones) con el estado general del negocio",
  "kpis": [
    { "nombre": "Nombre del KPI", "valor": "Valor formateado", "tendencia": "up" | "down" | "stable", "detalle": "Explicación breve" }
  ],
  "insights": [
    { "tipo": "warning" | "success" | "info" | "danger", "titulo": "Título del insight", "descripcion": "Descripción detallada", "accion": "Acción recomendada concreta" }
  ],
  "recomendaciones": [
    { "prioridad": "alta" | "media" | "baja", "titulo": "Título", "descripcion": "Qué hacer y por qué", "impacto": "Impacto esperado" }
  ],
  "proyecciones": [
    { "titulo": "Proyección", "periodo": "Período de tiempo", "descripcion": "Detalle de la proyección", "confianza": número de 0 a 100 }
  ],
  "anomalias": [
    { "severidad": "alta" | "media" | "baja", "titulo": "Anomalía detectada", "descripcion": "Detalle" }
  ]
}

Reglas:
- Sé específico: menciona productos, locales y cifras concretas.
- Las recomendaciones deben ser accionables.
- Detecta anomalías reales (mermas inusuales, consumo disparejo entre locales, precios atípicos).
- Proyecta tendencias a 7 y 30 días basándote en los movimientos.
- Si hay productos críticos, prioriza su mención.
- Los valores monetarios en ARS, formatea con $ y separadores de miles con punto.
- El tipo de reporte solicitado es: "${reportType}".`,
        },
        {
          role: 'user',
          content: `Analizá estos datos del negocio gastronómico para el período ${dateFrom.toISOString().split('T')[0]} a ${dateTo.toISOString().split('T')[0]}:\n\n${JSON.stringify(dataContext, null, 2)}`,
        },
      ],
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    this.logger.log(
      `OpenAI report analysis received (${rawResponse.length} chars)`,
    );

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: any) {
      this.logger.error(
        `Failed to parse OpenAI report JSON: ${err?.message}`,
      );
      throw new BadRequestException(
        'No se pudo interpretar el análisis de IA. Intentá de nuevo.',
      );
    }

    await this.prisma.aIEvent.create({
      data: {
        type: 'report_analysis',
        severity: 'info',
        title: `Análisis IA de reportes (${reportType})`,
        description: parsed.resumenEjecutivo || 'Análisis generado por IA',
        data: JSON.stringify(parsed),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return {
      success: true,
      analysis: parsed,
      generatedAt: new Date().toISOString(),
      periodo: {
        desde: dateFrom.toISOString().split('T')[0],
        hasta: dateTo.toISOString().split('T')[0],
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Análisis de Alertas con IA
  // ────────────────────────────────────────────────────────────────

  async analyzeAlerts() {
    this.logger.log('Generating AI alerts analysis...');
    const openai = this.getOpenAI();

    const [alerts, aiEvents, stockLevels, recentMovements] =
      await Promise.all([
        this.prisma.alert.findMany({
          where: { status: { in: ['active', 'read'] } },
          include: { location: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.aIEvent.findMany({
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.stockLevel.findMany({
          include: {
            product: {
              select: { name: true, sku: true, lastCost: true },
            },
            location: { select: { name: true } },
          },
        }),
        this.prisma.stockMovement.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          include: {
            product: { select: { name: true } },
            location: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      ]);

    const criticalStockLevels = stockLevels.filter(
      (sl) => sl.quantity <= sl.minQuantity,
    );

    const alertSummary = alerts.map((a) => ({
      tipo: a.type,
      prioridad: a.priority,
      titulo: a.title,
      mensaje: a.message,
      local: (a as any).location?.name || 'N/A',
      fecha: a.createdAt,
    }));

    const stockCritico = criticalStockLevels.map((sl) => ({
      producto: sl.product.name,
      sku: sl.product.sku,
      local: sl.location.name,
      cantidad: sl.quantity,
      minimo: sl.minQuantity,
      costoUnitario: sl.product.lastCost,
    }));

    const movsByType: Record<string, number> = {};
    recentMovements.forEach((m) => {
      movsByType[m.type] = (movsByType[m.type] || 0) + 1;
    });

    const dataContext = {
      alertasActivas: alertSummary,
      eventosIA: aiEvents.map((e) => ({
        tipo: e.type,
        severidad: e.severity,
        titulo: e.title,
        descripcion: e.description,
      })),
      stockCritico,
      movimientosRecientes7dias: movsByType,
      totalAlertasActivas: alerts.filter((a) => a.status === 'active')
        .length,
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `Eres un sistema experto en gestión de riesgos para negocios gastronómicos.
Analizá las alertas y el estado del stock para proveer un diagnóstico inteligente.

Responde SIEMPRE en formato JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "diagnostico": "Párrafo de 2-3 oraciones con el estado general de alertas",
  "nivelRiesgo": "critico" | "alto" | "medio" | "bajo",
  "alertasPrioritarias": [
    { "titulo": "Alerta prioritaria", "razon": "Por qué es prioritaria", "accionInmediata": "Qué hacer ahora", "impactoEstimado": "Qué pasa si no se actúa" }
  ],
  "patrones": [
    { "titulo": "Patrón detectado", "descripcion": "Detalle del patrón", "tipo": "warning" | "info" | "danger" }
  ],
  "planAccion": [
    { "paso": número, "accion": "Acción específica", "responsable": "Quién debería hacerlo", "plazo": "Cuándo" }
  ],
  "prediccionesRiesgo": [
    { "riesgo": "Descripción del riesgo", "probabilidad": "alta" | "media" | "baja", "plazo": "Cuándo podría ocurrir", "prevencion": "Cómo prevenirlo" }
  ]
}

Reglas:
- Sé específico con productos, locales y cifras.
- Prioriza por impacto en el negocio.
- Detecta patrones entre alertas.
- El plan de acción debe ser ejecutable y ordenado por urgencia.
- Considera que la ruptura de stock = platos fuera de carta = pérdida de ventas.`,
        },
        {
          role: 'user',
          content: `Analizá estas alertas y el estado actual del negocio:\n\n${JSON.stringify(dataContext, null, 2)}`,
        },
      ],
    });

    const rawResponse = response.choices[0]?.message?.content || '';
    this.logger.log(
      `OpenAI alerts analysis received (${rawResponse.length} chars)`,
    );

    let jsonStr = rawResponse.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: any) {
      this.logger.error(
        `Failed to parse OpenAI alerts JSON: ${err?.message}`,
      );
      throw new BadRequestException(
        'No se pudo interpretar el análisis de alertas. Intentá de nuevo.',
      );
    }

    return {
      success: true,
      analysis: parsed,
      generatedAt: new Date().toISOString(),
    };
  }

  async transcribeAudio(
    audioBase64: string,
    language: string,
    fileExt: string = 'webm',
    prompt?: string,
  ) {
    const openai = this.getOpenAI();

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    this.logger.log(
      `Transcribing audio: ${audioBuffer.length} bytes, ext=${fileExt}, lang=${language}`,
    );

    // Map extension to mime type
    const mimeMap: Record<string, string> = {
      webm: 'audio/webm',
      mp4: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      m4a: 'audio/m4a',
    };
    const mimeType = mimeMap[fileExt] || 'audio/webm';
    const filename = `audio.${fileExt}`;

    // Create a File-like object for OpenAI SDK
    const file = new File([audioBuffer], filename, { type: mimeType });

    try {
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language,
        response_format: 'text',
        ...(prompt && prompt.trim().length > 0 ? { prompt: prompt.trim().slice(0, 800) } : {}),
      });

      const transcript =
        typeof transcription === 'string'
          ? transcription
          : (transcription as any).text || '';

      this.logger.log(`Transcription result: "${transcript.substring(0, 100)}"`);

      return {
        success: true,
        transcript,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Whisper transcription failed: ${msg}`);
      throw new BadRequestException(`Error en la transcripción: ${msg}`);
    }
  }
}
