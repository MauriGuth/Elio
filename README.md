# ELIO — Sistema de Gestión Integral Gastronómica

**Plataforma de Stock, Logística, Producción y Operaciones Multi-Local con Inteligencia Artificial**

---

## Descripción

Nova es una plataforma integral diseñada para redes de cafeterías, restaurantes y depósitos de producción. Centraliza el control de stock, la planificación de producción, la logística entre locales, el punto de venta y la inteligencia artificial en un solo sistema.

## Documentación del Sistema

La documentación completa se encuentra en la carpeta `docs/`:

| Documento | Descripción | Contenido |
|---|---|---|
| [SYSTEM_SPEC.md](docs/SYSTEM_SPEC.md) | Especificación del Sistema | Módulos, pantallas, flujos funcionales, KPIs, alertas, textos, roles de usuario |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Modelo de Datos | 19 entidades SQL, relaciones, triggers, vistas materializadas, RLS, índices |
| [API_SPEC.md](docs/API_SPEC.md) | Especificación de APIs | 80+ endpoints REST, WebSocket events, autenticación, paginación, errores |
| [AI_INTEGRATION.md](docs/AI_INTEGRATION.md) | Integración con IA | OCR, voice-to-order, predicciones, anomalías, sugerencias, pipelines |
| [STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Guía de Estilo Visual | Paleta de colores, tipografía, iconografía, componentes UI, layout, animaciones |
| [UX_FLOWS.md](docs/UX_FLOWS.md) | Flujos UX y Navegación | Mapa de navegación, flujos por rol, wireframes, estados, responsive, accesibilidad |
| [TECH_REQUIREMENTS.md](docs/TECH_REQUIREMENTS.md) | Requerimientos Técnicos | Stack tecnológico, arquitectura, estructura monorepo, infraestructura, CI/CD, costos |

## Módulos del Sistema

| Módulo | Descripción |
|---|---|
| **Dashboard** | Panel de control con KPIs, estado de locales, alertas IA, actividad reciente |
| **Stock & Productos** | Gestión de productos con semáforo de stock por ubicación |
| **Ingresos de Mercadería** | Carga manual y OCR inteligente de facturas |
| **Producción** | Órdenes de producción con recetas versionadas y costeo automático |
| **Logística** | Envíos entre depósito y locales con QR y validación |
| **Locales** | Dashboard por sucursal, stock local, correcciones |
| **Comandas & Mesas** | Punto de venta con mapa de mesas y pedidos por voz |
| **Reportes** | Analítica de ventas, pérdidas, costos y proyecciones |
| **IA** | OCR, predicciones, detección de anomalías, sugerencias automáticas |

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15+, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS 10+, TypeScript, Prisma ORM |
| Base de Datos | PostgreSQL 16+, Redis 7+ |
| IA | Python FastAPI, OpenAI GPT-4, Whisper, Prophet |
| Infraestructura | Vercel, Railway, Neon, S3 |

## Inicio Rápido

```bash
# Clonar repositorio
git clone https://github.com/tu-org/elio.git
cd elio

# Instalar dependencias
pnpm install

# Levantar servicios (PostgreSQL, Redis)
docker compose up -d

# Correr migraciones
pnpm --filter api prisma migrate dev

# Seed de datos iniciales
pnpm --filter api prisma db seed

# Iniciar desarrollo
pnpm dev
```

## Estructura del Proyecto

```
elio/
├── apps/
│   ├── web/          # Frontend (Next.js)
│   ├── api/          # Backend (NestJS)
│   └── ai/           # Servicio IA (Python/FastAPI)
├── packages/
│   ├── shared/       # Tipos y utilidades compartidas
│   └── config/       # Configuración (ESLint, TS, Tailwind)
├── docker/           # Docker configs
├── docs/             # Documentación completa
└── .github/          # CI/CD workflows
```

## Roadmap

- **Fase 1 (8-10 sem):** Auth, Stock, Ingresos, Dashboard
- **Fase 2 (6-8 sem):** Producción, Logística, Locales
- **Fase 3 (6-8 sem):** Comandas, Mesas, POS
- **Fase 4 (4-6 sem):** IA (OCR, predicciones, anomalías)
- **Fase 5 (4-6 sem):** Voz, QR, Reportes avanzados, MercadoPago
- **Fase 6 (2-4 sem):** Performance, accesibilidad, auditoría

## Licencia

Propietario — Todos los derechos reservados.
