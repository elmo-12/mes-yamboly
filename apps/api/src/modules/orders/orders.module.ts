import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Merma,
  OrdenFabricacion,
  OrdenSap,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';
import { AdjuntosModule } from '../attachments/adjuntos.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenFabricacion, OrdenSap, Parada, Merma, RegistroVelocidad]), AdjuntosModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
