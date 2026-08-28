import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/app.config';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DatabaseModule } from './database/database.module';
/* Módulos B1 */
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DowntimesModule } from './modules/downtimes/downtimes.module';
import { ScrapModule } from './modules/scrap/scrap.module';
import { SpeedsModule } from './modules/speeds/speeds.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
/* Módulos B2 */
import { ReportsModule } from './modules/reports/reports.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EvidenceModule } from './modules/evidence/evidence.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CatalogsModule,
    OrdersModule,
    DowntimesModule,
    ScrapModule,
    SpeedsModule,
    RealtimeModule,
    ReportsModule,
    AlertsModule,
    AnalyticsModule,
    EvidenceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
