# ELIO — Requerimientos Técnicos e Infraestructura

---

## 1. Stack Tecnológico Recomendado

### 1.1 Frontend

| Componente | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Framework** | Next.js (React) | 15+ | SSR, App Router, Server Components, ecosystem |
| **Lenguaje** | TypeScript | 5.x | Type safety, DX, mantenibilidad |
| **Estilos** | Tailwind CSS | 4.x | Utility-first, consistencia, performance |
| **Componentes** | shadcn/ui | latest | Componentes accesibles, customizables, sin lock-in |
| **Estado Global** | Zustand | 5.x | Ligero, simple, TypeScript native |
| **Estado Server** | TanStack Query | 5.x | Cache, refetch, optimistic updates |
| **Formularios** | React Hook Form + Zod | latest | Performance, validación type-safe |
| **Gráficos** | Recharts | 2.x | Basado en D3, API declarativa |
| **Tablas** | TanStack Table | 8.x | Headless, sorting, filtering, pagination |
| **WebSocket** | Socket.io Client | 4.x | Reconexión automática, rooms |
| **Iconos** | Lucide React | latest | Consistente, tree-shakeable |
| **Dates** | date-fns | 3.x | Ligero, modular, locale es-AR |
| **PDF Export** | @react-pdf/renderer | latest | Generación de reportes PDF |
| **QR** | qrcode.react | latest | Generación de QR para envíos |
| **Drag & Drop** | dnd-kit | latest | Mapa de mesas |
| **Audio** | Web Audio API + MediaRecorder | native | Captura de voz |

### 1.2 Backend

| Componente | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Framework** | NestJS | 10+ | TypeScript, modular, enterprise-ready |
| **Lenguaje** | TypeScript | 5.x | Consistencia con frontend |
| **ORM** | Prisma | 6.x | Type-safe queries, migrations, seeding |
| **Validación** | class-validator + class-transformer | latest | Decorators, NestJS integration |
| **Auth** | Passport.js + JWT | latest | Estrategias flexibles |
| **WebSocket** | Socket.io | 4.x | Rooms, namespaces, middleware |
| **Queue** | BullMQ | 5.x | Jobs, cron, retry, Redis-backed |
| **Cache** | Redis (ioredis) | latest | Session, cache, pub/sub, queues |
| **File Upload** | Multer + Sharp | latest | Upload + image processing |
| **Email** | Nodemailer + SendGrid | latest | Transaccional + templates |
| **SMS** | Twilio SDK | latest | Solo alertas críticas |
| **Push** | Firebase Admin SDK | latest | Push notifications |
| **Logging** | Pino | 9.x | Structured logging, performance |
| **API Docs** | Swagger (OpenAPI) | 3.0 | Auto-generated desde decorators |
| **Testing** | Jest + Supertest | latest | Unit + Integration tests |

### 1.3 Servicios de IA (Python)

| Componente | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Framework** | FastAPI | 0.110+ | Async, tipado, OpenAPI auto |
| **ML** | scikit-learn | 1.5+ | Anomaly detection, clustering |
| **Forecasting** | Prophet | 1.1+ | Time series, estacionalidad |
| **NLP** | OpenAI API | latest | GPT-4 Vision, Whisper, embeddings |
| **Image** | Pillow + OpenCV | latest | Pre-procesamiento de imágenes |
| **Task Queue** | Celery | 5.x | Distributed task queue |
| **HTTP Client** | httpx | latest | Async HTTP client |

### 1.4 Base de Datos

| Componente | Tecnología | Versión | Justificación |
|---|---|---|---|
| **Principal** | PostgreSQL | 16+ | JSONB, RLS, full-text search, generated columns |
| **Cache/Queue** | Redis | 7+ | Cache, sessions, BullMQ, pub/sub |
| **Search** | PostgreSQL FTS | built-in | Full-text search en español |
| **Files** | S3 (AWS) o MinIO | latest | Object storage para imágenes |

### 1.5 Infraestructura

| Componente | Tecnología | Alternativa | Justificación |
|---|---|---|---|
| **Hosting App** | Vercel (Frontend) | Cloudflare Pages | Edge, SSR, CDN |
| **Hosting API** | Railway / Fly.io | AWS ECS | Containers, auto-scale |
| **Hosting IA** | Railway (GPU) | AWS Lambda | Python services |
| **DB Hosting** | Supabase / Neon | AWS RDS | Managed PostgreSQL |
| **Redis** | Upstash | AWS ElastiCache | Serverless Redis |
| **Storage** | AWS S3 | Cloudflare R2 | Object storage |
| **CDN** | CloudFront | Cloudflare | Assets, imágenes |
| **DNS** | Cloudflare | Route53 | DNS + WAF |
| **Monitoring** | Sentry | Datadog | Error tracking |
| **Analytics** | PostHog | Mixpanel | Product analytics |
| **CI/CD** | GitHub Actions | — | Automación |
| **Containers** | Docker | — | Desarrollo + deploy |

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama de Arquitectura

```
                         ┌─────────────┐
                         │   CloudFlare │
                         │   DNS + CDN  │
                         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
             ┌──────▼──────┐        ┌──────▼──────┐
             │   Vercel    │        │  Railway    │
             │  (Frontend) │        │  (API)      │
             │  Next.js    │        │  NestJS     │
             └──────┬──────┘        └──────┬──────┘
                    │                       │
                    │              ┌────────┼────────┐
                    │              │        │        │
                    │       ┌──────▼──┐ ┌──▼─────┐ ┌▼──────────┐
                    │       │PostgreSQL│ │ Redis  │ │ AI Service│
                    │       │ (Neon)   │ │(Upstash│ │ (Railway) │
                    │       └─────────┘ └────────┘ │ FastAPI   │
                    │                               └─────┬─────┘
                    │                                     │
             ┌──────▼──────┐                       ┌──────▼──────┐
             │     S3      │                       │  OpenAI API │
             │  (Storage)  │                       │  GPT-4/Whisp│
             └─────────────┘                       └─────────────┘
```

### 2.2 Flujo de Datos

```
┌──────────┐     HTTPS      ┌──────────┐      SQL       ┌──────────┐
│ Browser/ │ ◄─────────────▶│  API     │ ◄─────────────▶│PostgreSQL│
│ Mobile   │                 │  NestJS  │                 │          │
└──────────┘                 └────┬─────┘                 └──────────┘
     │                            │
     │ WebSocket                  │ Redis Pub/Sub
     │                            │
     └────────────────────────────┘
                                  │
                            ┌─────▼─────┐
                            │   Redis   │
                            │Cache/Queue│
                            └─────┬─────┘
                                  │ BullMQ
                            ┌─────▼─────┐
                            │ AI Worker │
                            │  Python   │
                            └───────────┘
```

---

## 3. Estructura del Proyecto

### 3.1 Monorepo Structure

```
nova/
├── apps/
│   ├── web/                    # Next.js Frontend
│   │   ├── app/
│   │   │   ├── (auth)/         # Login, forgot-password
│   │   │   ├── (dashboard)/    # Layout autenticado
│   │   │   │   ├── page.tsx    # Dashboard principal
│   │   │   │   ├── stock/
│   │   │   │   │   ├── page.tsx          # Listado productos
│   │   │   │   │   ├── [id]/page.tsx     # Detalle producto
│   │   │   │   │   └── new/page.tsx      # Nuevo producto
│   │   │   │   ├── goods-receipts/
│   │   │   │   │   ├── page.tsx          # Listado ingresos
│   │   │   │   │   ├── new/page.tsx      # Nuevo ingreso
│   │   │   │   │   └── [id]/page.tsx     # Detalle ingreso
│   │   │   │   ├── production/
│   │   │   │   │   ├── page.tsx          # Listado producción
│   │   │   │   │   ├── new/page.tsx      # Nueva orden
│   │   │   │   │   ├── [id]/page.tsx     # Detalle orden
│   │   │   │   │   └── recipes/          # Recetas
│   │   │   │   ├── logistics/
│   │   │   │   │   ├── page.tsx          # Listado envíos
│   │   │   │   │   ├── new/page.tsx      # Nuevo envío
│   │   │   │   │   └── [id]/page.tsx     # Detalle envío
│   │   │   │   ├── locations/
│   │   │   │   │   ├── page.tsx          # Listado locales
│   │   │   │   │   └── [id]/            # Dashboard local
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── stock/page.tsx
│   │   │   │   │       └── receive/page.tsx  # Recepción (tablet)
│   │   │   │   ├── orders/
│   │   │   │   │   ├── page.tsx          # Mapa de mesas
│   │   │   │   │   ├── [id]/page.tsx     # Detalle pedido
│   │   │   │   │   └── kitchen/
│   │   │   │   │       └── [sector]/page.tsx  # Monitor cocina
│   │   │   │   ├── reports/
│   │   │   │   │   ├── page.tsx          # Centro de reportes
│   │   │   │   │   ├── sales/page.tsx
│   │   │   │   │   ├── losses/page.tsx
│   │   │   │   │   └── costs/page.tsx
│   │   │   │   ├── ai/
│   │   │   │   │   ├── page.tsx          # Eventos IA
│   │   │   │   │   └── predictions/page.tsx
│   │   │   │   ├── users/
│   │   │   │   └── settings/
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── layout/          # Sidebar, TopBar, Layout
│   │   │   ├── stock/           # Componentes de stock
│   │   │   ├── production/      # Componentes de producción
│   │   │   ├── logistics/       # Componentes de logística
│   │   │   ├── orders/          # Componentes de comandas
│   │   │   ├── reports/         # Componentes de reportes
│   │   │   └── shared/          # Componentes compartidos
│   │   ├── hooks/               # Custom hooks
│   │   ├── lib/                 # Utilidades, API client
│   │   ├── stores/              # Zustand stores
│   │   ├── types/               # TypeScript types
│   │   └── styles/              # Global CSS
│   │
│   ├── api/                     # NestJS Backend
│   │   ├── src/
│   │   │   ├── auth/            # Módulo autenticación
│   │   │   ├── users/           # Módulo usuarios
│   │   │   ├── products/        # Módulo productos
│   │   │   ├── stock/           # Módulo stock
│   │   │   ├── categories/      # Módulo categorías
│   │   │   ├── suppliers/       # Módulo proveedores
│   │   │   ├── goods-receipts/  # Módulo ingresos
│   │   │   ├── production/      # Módulo producción
│   │   │   ├── recipes/         # Módulo recetas
│   │   │   ├── shipments/       # Módulo envíos
│   │   │   ├── locations/       # Módulo locales
│   │   │   ├── orders/          # Módulo comandas
│   │   │   ├── tables/          # Módulo mesas
│   │   │   ├── cash-register/   # Módulo caja
│   │   │   ├── reports/         # Módulo reportes
│   │   │   ├── alerts/          # Módulo alertas
│   │   │   ├── ai/              # Módulo IA (gateway)
│   │   │   ├── audit/           # Módulo auditoría
│   │   │   ├── websocket/       # Gateway WebSocket
│   │   │   ├── common/          # Guards, pipes, filters
│   │   │   ├── config/          # Configuración
│   │   │   └── prisma/          # Prisma service
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # Schema de BD
│   │   │   ├── migrations/      # Migraciones
│   │   │   └── seed.ts          # Datos semilla
│   │   └── test/                # Tests
│   │
│   └── ai/                      # Python AI Service
│       ├── app/
│       │   ├── main.py          # FastAPI app
│       │   ├── routers/
│       │   │   ├── ocr.py       # OCR endpoints
│       │   │   ├── voice.py     # Voice endpoints
│       │   │   ├── predictions.py
│       │   │   └── anomalies.py
│       │   ├── services/
│       │   │   ├── ocr_service.py
│       │   │   ├── voice_service.py
│       │   │   ├── stock_predictor.py
│       │   │   ├── anomaly_detector.py
│       │   │   └── demand_forecaster.py
│       │   ├── models/          # ML models
│       │   ├── utils/           # Helpers
│       │   └── config.py
│       ├── requirements.txt
│       ├── Dockerfile
│       └── tests/
│
├── packages/
│   ├── shared/                  # Tipos y utils compartidos
│   │   ├── types/               # TypeScript types (TS/Python)
│   │   ├── constants/           # Constantes compartidas
│   │   └── validators/          # Validaciones compartidas
│   └── config/                  # Configuración compartida
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── docker/
│   ├── docker-compose.yml       # Dev environment
│   ├── docker-compose.prod.yml  # Production
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── Dockerfile.ai
│
├── docs/                        # Documentación (estos archivos)
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # CI pipeline
│       ├── deploy-web.yml       # Deploy frontend
│       ├── deploy-api.yml       # Deploy backend
│       └── deploy-ai.yml       # Deploy AI service
│
├── turbo.json                   # Turborepo config
├── package.json                 # Root package.json
├── pnpm-workspace.yaml          # PNPM workspace
└── README.md
```

---

## 4. Environments

### 4.1 Variables de Entorno

```env
# ═══ App ═══
NODE_ENV=production
APP_NAME=Nova
APP_URL=https://app.nova.ar

# ═══ Database ═══
DATABASE_URL=postgresql://user:pass@host:5432/nova?schema=public
DATABASE_POOL_SIZE=20

# ═══ Redis ═══
REDIS_URL=redis://default:pass@host:6379

# ═══ Auth ═══
JWT_SECRET=super-secret-key-min-256-bits
JWT_EXPIRES_IN=3600
JWT_REFRESH_EXPIRES_IN=604800

# ═══ Storage ═══
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=sa-east-1
AWS_S3_BUCKET=nova-storage

# ═══ OpenAI ═══
OPENAI_API_KEY=sk-...
OPENAI_MODEL_VISION=gpt-4o
OPENAI_MODEL_CHAT=gpt-4o-mini
OPENAI_MODEL_WHISPER=whisper-1

# ═══ Email ═══
SENDGRID_API_KEY=SG...
EMAIL_FROM=notificaciones@nova.ar

# ═══ SMS ═══
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+541...

# ═══ Push Notifications ═══
FIREBASE_PROJECT_ID=nova-app
FIREBASE_PRIVATE_KEY=...

# ═══ AI Service ═══
AI_SERVICE_URL=http://ai:8000
AI_SERVICE_API_KEY=internal-key

# ═══ Monitoring ═══
SENTRY_DSN=https://...@sentry.io/...
POSTHOG_KEY=phc_...
```

---

## 5. Performance Requirements

### 5.1 Tiempos de Respuesta

| Endpoint | Target | Máximo |
|---|---|---|
| Lectura simple (GET) | < 100ms | 300ms |
| Listado con paginación | < 200ms | 500ms |
| Escritura simple (POST/PUT) | < 200ms | 500ms |
| Dashboard (aggregated) | < 500ms | 1500ms |
| OCR procesamiento | < 5s | 15s |
| Voice procesamiento | < 3s | 10s |
| Reportes complejos | < 2s | 5s |
| Exportación PDF/Excel | < 5s | 30s |
| WebSocket event delivery | < 100ms | 500ms |

### 5.2 Capacidad

| Métrica | Valor Esperado | Escalable A |
|---|---|---|
| Usuarios concurrentes | 50 | 500 |
| Requests/segundo | 100 | 1000 |
| WebSocket connections | 50 | 500 |
| Productos en catálogo | 500 | 10,000 |
| Movimientos de stock/día | 1,000 | 50,000 |
| Órdenes/día | 200 | 5,000 |
| Archivos/mes | 500 | 10,000 |
| Tamaño DB (1 año) | 5 GB | 50 GB |

### 5.3 Disponibilidad

| Servicio | SLA Target | Strategy |
|---|---|---|
| API Principal | 99.9% | Multi-region, health checks |
| Frontend | 99.95% | Edge (Vercel), CDN |
| Base de Datos | 99.99% | Managed, backups |
| AI Service | 99% | Graceful degradation |
| WebSocket | 99% | Reconexión automática |

---

## 6. Seguridad

### 6.1 Autenticación

```
- JWT con RS256 (asymmetric keys)
- Access Token: 1 hora
- Refresh Token: 7 días
- Refresh Token rotation (one-time use)
- Device binding (optional)
- Rate limiting en login (5 intentos / 15 min)
- 2FA con TOTP (opcional, recomendado para admin)
```

### 6.2 Autorización

```
- RBAC (Role-Based Access Control)
- Row-Level Security en PostgreSQL
- Middleware de tenant isolation
- Permission matrix por endpoint
- Audit log de acciones sensibles
```

### 6.3 Protección de Datos

```
- HTTPS everywhere (TLS 1.3)
- Encryption at rest (DB, S3)
- Password hashing: bcrypt (12 rounds)
- PII masking en logs
- CORS restrictivo
- CSP headers
- SQL injection prevention (Prisma ORM)
- XSS prevention (React + CSP)
- CSRF tokens para formularios
- Rate limiting por IP y usuario
- Input validation (Zod/class-validator)
- File upload validation (tipo, tamaño, contenido)
```

### 6.4 Backup y Recovery

```
- Database: Backup automático cada 6 horas
- Point-in-time recovery: 7 días
- S3: Versionado habilitado
- Redis: Snapshot cada hora
- Disaster Recovery Plan:
  - RTO (Recovery Time Objective): 1 hora
  - RPO (Recovery Point Objective): 6 horas
```

---

## 7. DevOps y CI/CD

### 7.1 Pipeline CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint:
    - ESLint (frontend + backend)
    - Prettier check
    - TypeScript compilation
    
  test:
    - Unit tests (Jest)
    - Integration tests (Supertest + TestContainers)
    - AI service tests (pytest)
    
  build:
    - Next.js build
    - NestJS build
    - Docker images build
    
  security:
    - npm audit
    - Snyk scan
    - Secret scanning
```

### 7.2 Pipeline CD

```
main branch → Production deploy
develop branch → Staging deploy

Deploy order:
1. Run migrations (prisma migrate deploy)
2. Deploy AI service (if changed)
3. Deploy API (rolling update)
4. Deploy Frontend (Vercel auto)
5. Run smoke tests
6. Notify team
```

### 7.3 Docker Compose (Development)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nova
      POSTGRES_USER: nova
      POSTGRES_PASSWORD: nova_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://nova:nova_dev@postgres:5432/nova
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  ai:
    build:
      context: .
      dockerfile: docker/Dockerfile.ai
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://nova:nova_dev@postgres:5432/nova
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    depends_on:
      - api

volumes:
  postgres_data:
```

---

## 8. Estimación de Costos Mensuales

### 8.1 Infraestructura (Producción)

| Servicio | Provider | Plan | Costo USD/mes |
|---|---|---|---|
| Frontend | Vercel | Pro | $20 |
| API Backend | Railway | Pro | $20 |
| AI Service | Railway | Pro (GPU) | $30 |
| PostgreSQL | Neon | Pro | $19 |
| Redis | Upstash | Pro | $10 |
| S3 Storage | AWS | Pay-as-use | $5 |
| CDN | Cloudflare | Free/Pro | $0-20 |
| Email | SendGrid | Free (100/day) | $0 |
| Push | Firebase | Free (spark) | $0 |
| Monitoring | Sentry | Team | $26 |
| Domain + SSL | Cloudflare | — | $15/año |
| **OpenAI API** | OpenAI | Pay-as-use | ~$50 |
| **TOTAL ESTIMADO** | | | **~$200/mes** |

### 8.2 Costos Escalados (Crecimiento)

| Escenario | Locales | Usuarios | Costo Estimado |
|---|---|---|---|
| Starter | 1-3 | 10-20 | $150-200/mes |
| Growth | 4-10 | 20-50 | $300-500/mes |
| Scale | 10-25 | 50-100 | $800-1500/mes |
| Enterprise | 25+ | 100+ | Custom |

---

## 9. Roadmap Técnico

### Fase 1: MVP (8-10 semanas)
- [ ] Setup monorepo + CI/CD
- [ ] Auth + Users + Roles
- [ ] Products + Categories + Stock
- [ ] Goods Receipts (manual)
- [ ] Dashboard básico
- [ ] Stock semáforo + alertas básicas

### Fase 2: Core Operations (6-8 semanas)
- [ ] Production + Recipes
- [ ] Shipments (envíos básicos)
- [ ] Location management
- [ ] Stock corrections
- [ ] Reportes básicos (ventas, stock)

### Fase 3: POS + Comandas (6-8 semanas)
- [ ] Mapa de mesas
- [ ] Toma de pedidos (manual)
- [ ] Monitor de cocina/barra
- [ ] Cash register (apertura/cierre)
- [ ] Cobro (efectivo + tarjeta)

### Fase 4: IA Integration (4-6 semanas)
- [ ] OCR de facturas
- [ ] Predicción de stock
- [ ] Sugerencias de compra
- [ ] Detección de anomalías
- [ ] Sugerencias de producción

### Fase 5: Advanced (4-6 semanas)
- [ ] Pedidos por voz
- [ ] QR scanning para envíos
- [ ] Reportes avanzados + exportación
- [ ] Integración MercadoPago QR
- [ ] Push notifications
- [ ] Modo offline (locales)

### Fase 6: Polish (2-4 semanas)
- [ ] Performance optimization
- [ ] Mobile responsive polish
- [ ] Accessibility audit
- [ ] Security audit
- [ ] Documentation
- [ ] User onboarding
