import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merma, Parada } from '../../database/entities';
import { AdjuntosController } from './adjuntos.controller';
import { AdjuntosService } from './adjuntos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Parada, Merma])],
  controllers: [AdjuntosController],
  providers: [AdjuntosService],
  exports: [AdjuntosService],
})
export class AdjuntosModule {}
