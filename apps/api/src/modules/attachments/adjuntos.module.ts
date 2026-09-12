import { Module } from '@nestjs/common';
import { AdjuntosController } from './adjuntos.controller';
import { AdjuntosService } from './adjuntos.service';

@Module({
  controllers: [AdjuntosController],
  providers: [AdjuntosService],
  exports: [AdjuntosService],
})
export class AdjuntosModule {}
