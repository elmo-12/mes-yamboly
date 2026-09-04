import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  ESTADOS_CATALOGO,
  TIPOS_PROCESO_LINEA,
  type EstadoCatalogo,
  type TipoProcesoLinea,
} from '@mes/types';

export class SaborQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}

export class LineaQueryDto {
  @ApiPropertyOptional({ example: 'SED-LIMA' })
  @IsOptional()
  @IsString()
  sedeId?: string;

  @ApiPropertyOptional({ enum: TIPOS_PROCESO_LINEA })
  @IsOptional()
  @IsIn(TIPOS_PROCESO_LINEA)
  tipoProceso?: TipoProcesoLinea;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}
