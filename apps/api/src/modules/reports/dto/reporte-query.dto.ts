import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Turno } from '@mes/types';

/** Periodos aceptados: los del contrato y los alias cortos de la UI. */
export const PERIODOS_REPORTE = [
  'hoy',
  'semana',
  '7d',
  'mes',
  'trimestre',
  'personalizado',
  'custom',
] as const;
export type PeriodoReporte = (typeof PERIODOS_REPORTE)[number];

export const COMPARACIONES = ['periodo_anterior', 'anio_anterior'] as const;
export type Comparacion = (typeof COMPARACIONES)[number];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ReporteQueryDto {
  @ApiPropertyOptional({ enum: PERIODOS_REPORTE, default: 'semana' })
  @IsOptional()
  @IsIn(PERIODOS_REPORTE, { message: 'periodo no reconocido' })
  periodo: PeriodoReporte = 'semana';

  @ApiPropertyOptional({ example: '2026-08-22', description: 'Requerido con periodo personalizado' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-28' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;

  @ApiPropertyOptional({ description: 'Repetible o separado por comas', example: 'LIN-LLEN-M2,LIN-EXTR-2' })
  @IsOptional()
  lineaId?: string | string[];

  @ApiPropertyOptional({ description: 'M · T · N', example: 'M,T' })
  @IsOptional()
  turno?: Turno | Turno[];

  @ApiPropertyOptional({ enum: COMPARACIONES, default: 'periodo_anterior' })
  @IsOptional()
  @IsIn(COMPARACIONES, { message: 'comparar debe ser periodo_anterior o anio_anterior' })
  comparar: Comparacion = 'periodo_anterior';

  @ApiPropertyOptional({ description: 'Sólo mock: fuerza un error simulado' })
  @IsOptional()
  @IsString()
  __error?: string;
}
