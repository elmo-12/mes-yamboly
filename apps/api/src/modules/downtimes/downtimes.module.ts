import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeteccionIoT, Parada } from '../../database/entities';
import { AdjuntosModule } from '../attachments/adjuntos.module';
import { OrdersModule } from '../orders/orders.module';
import { DowntimesController } from './downtimes.controller';
import { DowntimesService } from './downtimes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Parada, DeteccionIoT]), OrdersModule, AdjuntosModule],
  controllers: [DowntimesController],
  providers: [DowntimesService],
  exports: [DowntimesService],
})
export class DowntimesModule {}
