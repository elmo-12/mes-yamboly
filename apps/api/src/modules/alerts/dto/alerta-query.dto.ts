import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ESTADOS_ALERTA, SEVERIDADES_ALERTA, TIPOS_ALERTA } from '@mes/types';
import type { EstadoAlerta, SeveridadAlerta, TipoAlerta } from '@mes/types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class AlertaQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TIPOS_ALERTA, isArray: true, description: 'Repetible o separado por comas' })
  @IsOptional()
  tipo?: TipoAlerta | TipoAlerta[];

  @ApiPropertyOptional({ enum: SEVERIDADES_ALERTA, isArray: true })
  @IsOptional()
  severidad?: SeveridadAlerta | SeveridadAlerta[];

  @ApiPropertyOptional({ example: 'LIN-02' })
  @IsOptional()
  lineaId?: string | string[];

  @ApiPropertyOptional({ enum: ESTADOS_ALERTA, isArray: true })
  @IsOptional()
  estado?: EstadoAlerta | EstadoAlerta[];

  @ApiPropertyOptional({ description: 'Busca en la predicción, la línea y la máquina' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2026-08-21' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-28' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;
}
