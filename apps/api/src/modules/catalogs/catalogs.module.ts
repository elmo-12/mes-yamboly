import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  Sabor,
  Sede,
  Turno,
  VelocidadEstandar,
} from '../../database/entities';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Turno,
      Sede,
      Linea,
      Sabor,
      Producto,
      VelocidadEstandar,
      Maquina,
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
