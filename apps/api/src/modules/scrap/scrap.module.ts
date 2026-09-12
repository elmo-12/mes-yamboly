import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merma } from '../../database/entities';
import { AdjuntosModule } from '../attachments/adjuntos.module';
import { OrdersModule } from '../orders/orders.module';
import { ScrapController } from './scrap.controller';
import { ScrapService } from './scrap.service';

@Module({
  imports: [TypeOrmModule.forFeature([Merma]), OrdersModule, AdjuntosModule],
  controllers: [ScrapController],
  providers: [ScrapService],
  exports: [ScrapService],
})
export class ScrapModule {}
