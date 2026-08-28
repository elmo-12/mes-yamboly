import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Parada,
  Producto,
  Turno,
} from '../../database/entities';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Turno, Linea, Producto, Maquina, CausaParada, CausaMerma, Parada]),
  ],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
