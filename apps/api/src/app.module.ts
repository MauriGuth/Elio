import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { StockModule } from './stock/stock.module';
import { StockReconciliationsModule } from './stock-reconciliations/stock-reconciliations.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { ProductionModule } from './production/production.module';
import { RecipesModule } from './recipes/recipes.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { LocationsModule } from './locations/locations.module';
import { OrdersModule } from './orders/orders.module';
import { TablesModule } from './tables/tables.module';
import { CashRegistersModule } from './cash-registers/cash-registers.module';
import { CustomersModule } from './customers/customers.module';
import { CashMovementsModule } from './cash-movements/cash-movements.module';
import { AlertsModule } from './alerts/alerts.module';
import { AIEventsModule } from './ai-events/ai-events.module';
import { AuditModule } from './audit/audit.module';
import { WasteRecordsModule } from './waste-records/waste-records.module';
import { PaymentOrdersModule } from './payment-orders/payment-orders.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { IncidentsModule } from './incidents/incidents.module';
import { GoogleMapsModule } from './google-maps/google-maps.module';
import { AuditorChatModule } from './auditor-chat/auditor-chat.module';
import { ArcaModule } from './arca/arca.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GoogleMapsModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    StockModule,
    StockReconciliationsModule,
    SuppliersModule,
    GoodsReceiptsModule,
    ProductionModule,
    RecipesModule,
    ShipmentsModule,
    LocationsModule,
    OrdersModule,
    TablesModule,
    CashRegistersModule,
    CustomersModule,
    CashMovementsModule,
    AlertsModule,
    AIEventsModule,
    AuditModule,
    WasteRecordsModule,
    PaymentOrdersModule,
    PurchaseOrdersModule,
    IncidentsModule,
    AuditorChatModule,
    ArcaModule,
  ],
})
export class AppModule {}
