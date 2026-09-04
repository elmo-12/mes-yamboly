import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditEvent,
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  OrdenFabricacion,
  Producto,
  Sabor,
  User,
  VelocidadEstandar,
} from '../database/entities';
import { LookupsService } from './mappers/lookups.service';
import { AuditService } from './services/audit.service';

/** Utilidades transversales disponibles en toda la app (también para B2). */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Linea,
      Producto,
      Sabor,
      VelocidadEstandar,
      Maquina,
      CausaParada,
      CausaMerma,
      User,
      OrdenFabricacion,
      AuditEvent,
    ]),
  ],
  providers: [LookupsService, AuditService],
  exports: [LookupsService, AuditService],
})
export class CommonModule {}
