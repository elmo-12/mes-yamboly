import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  Sabor,
  Turno,
  VelocidadEstandar,
} from '../../database/entities';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Turno,
      Linea,
      Sabor,
      Producto,
      VelocidadEstandar,
      CausaParada,
      CausaMerma,
      Parada,
      Merma,
      OrdenFabricacion,
    ]),
  ],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
