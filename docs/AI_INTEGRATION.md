# ELIO — Integración con Inteligencia Artificial

---

## 1. Visión General de IA

La IA en Nova opera como un **asistente inteligente** que trabaja en segundo plano analizando datos, detectando patrones y generando acciones proactivas. No reemplaza decisiones humanas: las **sugiere y facilita**.

### 1.1 Capacidades de IA

| Capacidad | Tecnología | Frecuencia | Input | Output |
|---|---|---|---|---|
| OCR de Facturas | GPT-4 Vision / Google Document AI | On-demand | Imagen de factura | Datos estructurados |
| Pedidos por Voz | Whisper API + NLP | On-demand | Audio | Pedido estructurado |
| Predicción de Stock | Prophet / LSTM | Cada 6 horas | Histórico de movimientos | Proyección de agotamiento |
| Detección de Anomalías | Isolation Forest / Z-Score | Cada hora | Movimientos de stock | Alertas de anomalía |
| Sugerencias de Compra | Reglas + ML | Diario a las 06:00 | Stock + predicciones | Lista de compras sugerida |
| Optimización Producción | Análisis de demanda | Diario a las 05:00 | Ventas históricas | Plan de producción |
| Análisis de Costos | Regresión | Semanal | Costos históricos | Tendencias y alertas |

---

## 2. Módulo OCR — Lectura Inteligente de Facturas

### 2.1 Arquitectura

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Imagen   │───▶│ Pre-     │───▶│ OCR      │───▶│ Post-    │
│ Original │    │ proceso  │    │ Engine   │    │ proceso  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                 • Rotación      • GPT-4V       • Matching
                 • Recorte       • O Document AI • Validación
                 • Contraste     • Extracción    • Confianza
                 • Deskew        • Estructura    • Sugerencias
```

### 2.2 Pipeline de Procesamiento

**Paso 1: Pre-procesamiento de Imagen**
```python
def preprocess_invoice_image(image_bytes):
    """
    - Detectar orientación y rotar si necesario
    - Ajustar contraste y brillo
    - Eliminar ruido
    - Deskew (enderezar)
    - Recortar bordes
    - Redimensionar a resolución óptima (300 DPI equivalente)
    """
    pass
```

**Paso 2: Extracción OCR**

Prompt para GPT-4 Vision:
```
Analiza esta imagen de una factura de proveedor de alimentos/insumos gastronómicos 
en Argentina. Extrae la siguiente información en formato JSON:

{
  "supplier": {
    "name": "nombre del proveedor",
    "tax_id": "CUIT si visible",
    "address": "dirección si visible"
  },
  "invoice": {
    "type": "A, B o C",
    "number": "número completo de factura",
    "date": "fecha en formato YYYY-MM-DD",
    "due_date": "fecha de vencimiento si visible"
  },
  "items": [
    {
      "description": "texto exacto del item",
      "quantity": número,
      "unit": "unidad (kg, lt, und, etc)",
      "unit_price": número,
      "total": número
    }
  ],
  "totals": {
    "subtotal": número,
    "tax": número,
    "total": número
  },
  "payment_method": "contado/crédito/etc si visible",
  "confidence": porcentaje general de confianza
}

Si algún campo no es legible, usa null y reduce la confianza.
Responde SOLO con el JSON, sin texto adicional.
```

**Paso 3: Post-procesamiento y Matching**
```python
def match_ocr_results(ocr_data, tenant_id):
    """
    1. Match de proveedor:
       - Buscar por nombre similar (fuzzy match > 80%)
       - Buscar por CUIT exacto
       - Si no hay match → marcar para creación manual
    
    2. Match de productos:
       - Para cada item extraído:
         a. Búsqueda fuzzy en nombre de productos (threshold 85%)
         b. Búsqueda por código/SKU si presente
         c. Búsqueda por palabras clave en descripción
         d. Asignar confianza individual
         e. Si confianza < 90% → marcar para revisión manual
    
    3. Validación cruzada:
       - Verificar que sum(items.total) ≈ totals.subtotal
       - Verificar que subtotal + tax ≈ total
       - Verificar coherencia de precios vs último costo
    
    4. Generar resultado con confianza global
    """
    pass
```

### 2.3 Niveles de Confianza

| Confianza | Acción | UI |
|---|---|---|
| >= 95% | Auto-completar sin intervención | ✅ Badge verde |
| 90-94% | Auto-completar, revisión rápida | 🟡 Badge amarillo |
| 80-89% | Requiere confirmación item por item | ⚠️ Badge naranja |
| < 80% | Revisión manual obligatoria | 🔴 Badge rojo |

---

## 3. Pedidos por Voz

### 3.1 Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Audio    │───▶│ Speech   │───▶│ NLP      │───▶│ Matching │
│ Captura  │    │ to Text  │    │ Parser   │    │ & Struct │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
  WebAudio       Whisper API     GPT-4 / Fine    Catálogo
  API            es-AR locale    tuned model     de menú
```

### 3.2 Procesamiento de Voz

**Paso 1: Captura de Audio**
- Formato: WebM/Opus o WAV
- Sample rate: 16kHz mínimo
- Duración máxima: 60 segundos
- Noise cancellation en cliente

**Paso 2: Speech-to-Text (Whisper)**
```python
def transcribe_order(audio_bytes):
    response = openai.audio.transcriptions.create(
        model="whisper-1",
        file=audio_bytes,
        language="es",
        prompt="Pedido de restaurante: café, medialunas, tostados, jugos, ensaladas, sandwiches"
    )
    return response.text
```

**Paso 3: NLP — Parseo del Pedido**

Prompt:
```
Eres un sistema de procesamiento de pedidos de restaurante/cafetería.
El menú disponible es:
{menu_items_json}

Analiza el siguiente pedido dictado por un mozo y extrae los items:
"{transcription}"

Responde en JSON:
{
  "items": [
    {
      "product_match": "nombre exacto del menú",
      "product_id": "id del menú",
      "quantity": número,
      "notes": "modificaciones especiales (sin tomate, caliente, grande, etc)",
      "confidence": porcentaje
    }
  ],
  "unrecognized": ["frases que no pudiste interpretar"]
}
```

### 3.3 Ejemplos de Procesamiento

| Input (voz) | Output (estructurado) |
|---|---|
| "Dos cortados y tres medialunas" | 2x Cortado, 3x Medialuna |
| "Un cappuccino con canela sin azúcar" | 1x Cappuccino, notes: "con canela, sin azúcar" |
| "Cuatro medialunas, dos calientes" | 4x Medialuna, notes: "2 calientes" |
| "Un tostado jota y cu sin tomate" | 1x Tostado J&Q, notes: "sin tomate" |
| "Dos jugos grandes de naranja" | 2x Jugo Naranja Grande |

---

## 4. Predicción de Stock

### 4.1 Modelo

**Algoritmo:** Facebook Prophet + ajustes por estacionalidad gastronómica

**Features:**
- Consumo diario histórico (mínimo 30 días)
- Día de la semana (lun-dom)
- Feriados y eventos especiales
- Estación del año
- Condiciones climáticas (opcional, vía API externa)
- Tendencia general

### 4.2 Proceso

```python
def predict_stock_depletion(product_id, location_id, days_ahead=14):
    """
    1. Obtener últimos 90 días de movimientos de egreso
    2. Calcular consumo diario promedio por día de semana
    3. Aplicar modelo Prophet para proyectar consumo futuro
    4. Calcular fecha estimada de agotamiento
    5. Generar alerta si agotamiento < 5 días
    6. Sugerir cantidad de reposición (basada en lead time proveedor)
    
    Returns:
    {
        "product_id": "uuid",
        "current_stock": 25.0,
        "daily_avg_consumption": 12.5,
        "predicted_consumption_7d": [14, 12, 11, 15, 13, 8, 6],
        "estimated_days_remaining": 2.0,
        "estimated_stockout_date": "2026-02-13",
        "confidence_interval": { "lower": 1.5, "upper": 2.8 },
        "suggested_reorder_qty": 75,
        "suggested_reorder_date": "2026-02-11"
    }
    """
    pass
```

### 4.3 Calendario de Ejecución

```
05:00 AM — Predicción de demanda diaria (ventas esperadas)
06:00 AM — Predicción de stock (agotamiento por producto/ubicación)
06:30 AM — Generación de sugerencias de compra
07:00 AM — Generación de sugerencias de producción
```

---

## 5. Detección de Anomalías

### 5.1 Tipos de Anomalías

| Anomalía | Descripción | Método | Threshold |
|---|---|---|---|
| Consumo excesivo | Producto consumido mucho más que lo esperado | Z-Score | > 2σ |
| Consumo bajo | Producto consumido mucho menos que lo esperado | Z-Score | < -2σ |
| Ingreso inusual | Cantidad ingresada fuera de patrón | Isolation Forest | Score > 0.7 |
| Corrección frecuente | Muchas correcciones del mismo producto | Frecuencia | > 3/semana |
| Diferencia recurrente | Diferencias en envíos del mismo producto | Pattern | > 3 consecutivos |
| Costo atípico | Costo de compra muy diferente al promedio | Z-Score | > 2σ |
| Horario inusual | Movimiento de stock en horario no habitual | Reglas | Fuera de horario |

### 5.2 Proceso de Detección

```python
def detect_anomalies(tenant_id, window_hours=1):
    """
    Ejecuta cada hora:
    
    1. Obtener movimientos de la última hora
    2. Para cada movimiento:
       a. Calcular Z-Score vs promedio histórico (30 días)
       b. Si |z| > 2: marcar como anomalía potencial
       c. Aplicar Isolation Forest para confirmación
    3. Para correcciones:
       a. Contar correcciones por producto/local en la semana
       b. Si > 3: generar alerta
    4. Generar AI Events para anomalías confirmadas
    5. Clasificar severidad:
       - Info: desviación leve, solo para dashboard
       - Warning: desviación significativa, notificar
       - Critical: desviación grave, escalar a admin
    """
    pass
```

### 5.3 Ejemplo de Evento de Anomalía

```json
{
  "type": "anomaly_detection",
  "severity": "warning",
  "title": "Consumo inusual de azúcar en Café Norte",
  "description": "El consumo de azúcar en Café Norte hoy es 85% mayor al promedio para un martes. Consumo esperado: 5.2 Kg, consumo real: 9.6 Kg.",
  "data": {
    "product_id": "uuid",
    "product_name": "Azúcar",
    "location_id": "uuid",
    "location_name": "Café Norte",
    "expected_consumption": 5.2,
    "actual_consumption": 9.6,
    "deviation_pct": 84.6,
    "z_score": 2.8,
    "possible_causes": [
      "Evento especial o promoción activa",
      "Error en registro de movimiento",
      "Producción no registrada",
      "Pérdida no reportada"
    ],
    "suggested_actions": [
      "Verificar si hay evento o promoción activa",
      "Revisar movimientos de stock del día",
      "Consultar con el encargado del local"
    ]
  }
}
```

---

## 6. Sugerencias de Compra Automáticas

### 6.1 Algoritmo

```python
def generate_purchase_suggestions(tenant_id):
    """
    Ejecuta diariamente a las 06:30 AM:
    
    1. Para cada producto activo con is_ingredient=true:
       a. Obtener stock actual en todas las ubicaciones
       b. Obtener predicción de consumo para los próximos 7 días
       c. Calcular stock proyectado a 7 días
       d. Si stock_proyectado < stock_minimo_total:
          i.  Calcular cantidad a pedir
          ii. Identificar proveedor preferido
          iii. Considerar lead time del proveedor
          iv. Calcular costo estimado
          v.  Determinar urgencia
    
    2. Agrupar sugerencias por proveedor (optimizar envíos)
    3. Calcular costo total estimado por proveedor
    4. Generar AI Event con sugerencias
    
    Fórmula cantidad a pedir:
    qty = (stock_minimo * safety_factor) - stock_actual + consumo_lead_time
    safety_factor = 1.3 (30% de margen de seguridad)
    consumo_lead_time = consumo_diario_avg * lead_time_dias
    """
    pass
```

### 6.2 Ejemplo de Sugerencia

```json
{
  "type": "purchase_suggestion",
  "severity": "warning",
  "title": "5 productos necesitan reposición esta semana",
  "description": "Basado en el consumo proyectado, se recomienda realizar pedidos a 2 proveedores antes del jueves.",
  "data": {
    "by_supplier": [
      {
        "supplier_id": "uuid",
        "supplier_name": "Molinos del Sur",
        "lead_time_days": 2,
        "order_before": "2026-02-12",
        "items": [
          {
            "product_name": "Harina 000 x25Kg",
            "current_stock": 395,
            "projected_need_7d": 500,
            "suggested_qty": 200,
            "unit_cost": 2450,
            "total_cost": 490000
          },
          {
            "product_name": "Azúcar x50Kg",
            "current_stock": 200,
            "projected_need_7d": 180,
            "suggested_qty": 100,
            "unit_cost": 1800,
            "total_cost": 180000
          }
        ],
        "total_estimated": 670000
      },
      {
        "supplier_id": "uuid",
        "supplier_name": "Lácteos del Valle",
        "lead_time_days": 1,
        "order_before": "2026-02-13",
        "items": [
          {
            "product_name": "Leche Entera 1L",
            "current_stock": 120,
            "projected_need_7d": 350,
            "suggested_qty": 300,
            "unit_cost": 1200,
            "total_cost": 360000
          }
        ],
        "total_estimated": 360000
      }
    ],
    "grand_total": 1030000
  }
}
```

---

## 7. Optimización de Producción

### 7.1 Algoritmo

```python
def suggest_production_plan(tenant_id, target_date):
    """
    Ejecuta diariamente a las 05:00 AM para el día siguiente:
    
    1. Análisis de demanda:
       a. Histórico de ventas del mismo día de la semana (últimas 8 semanas)
       b. Ajuste por tendencia (crecimiento/decrecimiento)
       c. Ajuste por estacionalidad mensual
       d. Ajuste por feriados/eventos
       e. Promedio ponderado (más peso a semanas recientes)
    
    2. Para cada producto producido (is_produced=true):
       a. Calcular demanda esperada por local
       b. Sumar stock actual en cada local
       c. Calcular producción necesaria = demanda - stock_actual + buffer
       d. Buffer = 10% de la demanda (evitar quiebre)
    
    3. Verificar disponibilidad de insumos:
       a. Para cada receta, calcular insumos necesarios
       b. Verificar stock de insumos en depósito
       c. Si algún insumo falta → ajustar cantidad o marcar
    
    4. Optimización:
       a. Priorizar productos con mayor margen
       b. Agrupar producciones por receta (eficiencia)
       c. Considerar capacidad de producción (horno, personal)
    
    5. Generar plan con costos estimados
    """
    pass
```

### 7.2 Ejemplo de Sugerencia de Producción

```json
{
  "type": "production_suggestion",
  "severity": "info",
  "title": "Plan de producción sugerido para jueves 12/02",
  "description": "Basado en demanda histórica de jueves y stock actual.",
  "data": {
    "target_date": "2026-02-12",
    "day_of_week": "jueves",
    "suggestions": [
      {
        "recipe_id": "uuid",
        "recipe_name": "Medialunas de Manteca",
        "suggested_qty": 350,
        "basis": {
          "avg_sales_thursday": 320,
          "trend_adjustment": 1.05,
          "current_stock_all_locations": 58,
          "buffer_pct": 10
        },
        "ingredients_available": true,
        "estimated_cost": 96075,
        "priority": "high"
      },
      {
        "recipe_id": "uuid",
        "recipe_name": "Pan Lactal",
        "suggested_qty": 40,
        "basis": {
          "avg_sales_thursday": 35,
          "trend_adjustment": 1.0,
          "current_stock_all_locations": 5,
          "buffer_pct": 10
        },
        "ingredients_available": true,
        "estimated_cost": 28000,
        "priority": "high"
      },
      {
        "recipe_id": "uuid",
        "recipe_name": "Facturas Surtidas",
        "suggested_qty": 200,
        "basis": {
          "avg_sales_thursday": 180,
          "trend_adjustment": 1.02,
          "current_stock_all_locations": 12,
          "buffer_pct": 10
        },
        "ingredients_available": false,
        "missing_ingredients": [
          { "name": "Dulce de membrillo", "need": 5, "available": 2, "shortage": 3, "unit": "kg" }
        ],
        "max_producible": 130,
        "estimated_cost": 42000,
        "priority": "medium"
      }
    ],
    "total_estimated_cost": 166075,
    "total_estimated_labor": 45000
  }
}
```

---

## 8. Infraestructura de IA

### 8.1 Servicios Externos

| Servicio | Uso | Pricing Aprox. | Alternativa Self-hosted |
|---|---|---|---|
| OpenAI GPT-4 Vision | OCR de facturas | $0.01/imagen | — |
| OpenAI Whisper API | Speech-to-text | $0.006/minuto | Whisper local (GPU) |
| OpenAI GPT-4 | NLP de pedidos | $0.03/request | — |
| — | Predicción stock | Self-hosted | Prophet / LSTM |
| — | Anomalías | Self-hosted | scikit-learn |

### 8.2 Arquitectura de Servicios IA

```
┌─────────────────────────────────────────────────┐
│                   API Gateway                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ OCR      │  │ Voice    │  │ NLP      │      │
│  │ Service  │  │ Service  │  │ Service  │      │
│  │ (Python) │  │ (Python) │  │ (Python) │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │            │
│       ▼              ▼              ▼            │
│  ┌──────────────────────────────────────┐       │
│  │         OpenAI API / LLM            │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Stock    │  │ Anomaly  │  │ Demand   │      │
│  │ Predict  │  │ Detect   │  │ Forecast │      │
│  │ (Python) │  │ (Python) │  │ (Python) │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │            │
│       ▼              ▼              ▼            │
│  ┌──────────────────────────────────────┐       │
│  │     PostgreSQL + Redis (Cache)      │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│  ┌──────────────────────────────────────┐       │
│  │     Job Scheduler (Celery/Bull)     │       │
│  │     Cron jobs para predicciones     │       │
│  └──────────────────────────────────────┘       │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 8.3 Cola de Procesamiento IA

| Job | Prioridad | Timeout | Retries | Queue |
|---|---|---|---|---|
| OCR de factura | Alta | 30s | 2 | `ai:ocr` |
| Voice-to-order | Alta | 15s | 1 | `ai:voice` |
| Stock prediction | Media | 5min | 3 | `ai:prediction` |
| Anomaly detection | Media | 2min | 3 | `ai:anomaly` |
| Purchase suggestion | Baja | 10min | 3 | `ai:suggestion` |
| Production suggestion | Baja | 10min | 3 | `ai:suggestion` |

### 8.4 Almacenamiento de Modelos

```
/models
  /stock_prediction
    /model_v1.pkl          # Modelo Prophet serializado
    /scaler_v1.pkl         # Scaler para normalización
    /metadata.json         # Versión, fecha entrenamiento, métricas
  /anomaly_detection
    /isolation_forest_v1.pkl
    /baseline_stats.json   # Promedios y desviaciones por producto
  /nlp
    /menu_embeddings.json  # Embeddings del menú para matching
```

---

## 9. Monitoreo y Métricas de IA

### 9.1 Métricas a Trackear

| Métrica | Descripción | Alerta Si |
|---|---|---|
| OCR Accuracy | % de campos correctamente extraídos | < 85% |
| OCR Match Rate | % de productos correctamente macheados | < 80% |
| Voice Accuracy | % de pedidos correctamente interpretados | < 90% |
| Prediction MAPE | Error absoluto porcentual medio (stock) | > 25% |
| Anomaly False Positive Rate | % de falsas alarmas | > 30% |
| Suggestion Acceptance Rate | % de sugerencias aceptadas por usuario | < 50% |

### 9.2 Feedback Loop

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ IA genera│───▶│ Usuario  │───▶│ Sistema  │───▶│ Modelo   │
│ sugerencia│   │ acepta/  │    │ registra │    │ mejora   │
│          │    │ rechaza  │    │ feedback │    │ con datos│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

- Cada acción del usuario sobre sugerencias IA se registra
- Semanalmente se recalculan métricas de precisión
- Mensualmente se re-entrenan modelos con datos nuevos
- Se ajustan thresholds basado en feedback
