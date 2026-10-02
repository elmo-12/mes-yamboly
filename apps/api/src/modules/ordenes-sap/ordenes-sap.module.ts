import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdenSap } from '../../database/entities';
import { OrdenesSapController } from './ordenes-sap.controller';
import { OrdenesSapService } from './ordenes-sap.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenSap])],
  controllers: [OrdenesSapController],
  providers: [OrdenesSapService],
  exports: [OrdenesSapService],
})
export class OrdenesSapModule {}
