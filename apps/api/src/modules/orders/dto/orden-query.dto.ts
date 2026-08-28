import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ESTADOS_ORDEN, PERIODOS, TURNOS, type Periodo } from '@mes/types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class OrdenQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PERIODOS })
  @IsOptional()
  @IsIn(PERIODOS)
  periodo?: Periodo;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-28' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;

  @ApiPropertyOptional({ description: 'Repetible o separado por comas', example: 'LIN-02' })
  @IsOptional()
  lineaId?: string | string[];

  @ApiPropertyOptional({ enum: TURNOS, isArray: true })
  @IsOptional()
  turno?: string | string[];

  @ApiPropertyOptional({ enum: ESTADOS_ORDEN, isArray: true })
  @IsOptional()
  estado?: string | string[];

  @ApiPropertyOptional({ description: 'Código, lote o nombre de producto' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['fecha', 'codigo', 'oee', 'producido'], default: 'fecha' })
  @IsOptional()
  @IsIn(['fecha', 'codigo', 'oee', 'producido'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  orden?: 'asc' | 'desc';
}
