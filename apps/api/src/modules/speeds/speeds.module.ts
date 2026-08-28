import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistroVelocidad } from '../../database/entities';
import { OrdersModule } from '../orders/orders.module';
import { SpeedsController } from './speeds.controller';
import { SpeedsService } from './speeds.service';

@Module({
  imports: [TypeOrmModule.forFeature([RegistroVelocidad]), OrdersModule],
  controllers: [SpeedsController],
  providers: [SpeedsService],
  exports: [SpeedsService],
})
export class SpeedsModule {}
