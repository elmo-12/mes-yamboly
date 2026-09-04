import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UmbralesDto {
  @ApiProperty({ minimum: 1, maximum: 50, example: 5, description: '% bajo el estándar que dispara la alerta' })
  @Type(() => Number)
  @IsNumber({}, { message: 'velocidadBajoEstandarPct debe ser numérico' })
  @Min(1, { message: 'Mínimo 1 %' })
  @Max(50, { message: 'Máximo 50 %' })
  velocidadBajoEstandarPct!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 75 })
  @Type(() => Number)
  @IsNumber({}, { message: 'oeeMinimo debe ser numérico' })
  @Min(1, { message: 'Mínimo 1 %' })
  @Max(100, { message: 'Máximo 100 %' })
  oeeMinimo!: number;

  @ApiProperty({ minimum: 50, maximum: 99, example: 70 })
  @Type(() => Number)
  @IsNumber({}, { message: 'probabilidadMinima debe ser numérico' })
  @Min(50, { message: 'Mínimo 50 %' })
  @Max(99, { message: 'Máximo 99 %' })
  probabilidadMinima!: number;

  @ApiProperty({ example: true, description: 'Enviar la alerta al webhook de n8n' })
  @IsBoolean({ message: 'notificarN8n debe ser booleano' })
  notificarN8n!: boolean;

  @ApiProperty({ example: true, description: 'Mostrar la alerta en el Modo TV' })
  @IsBoolean({ message: 'mostrarTv debe ser booleano' })
  mostrarTv!: boolean;

  /* --- Validación de calidad (TCI) · sección 10.C ------------------- */

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 60,
    example: 5,
    description: 'Tolerancia en minutos entre horas registradas y lecturas de sensor',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tciToleranciaMin debe ser numérico' })
  @Min(0, { message: 'Mínimo 0 min' })
  @Max(60, { message: 'Máximo 60 min' })
  tciToleranciaMin?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 50,
    example: 5,
    description: 'Tolerancia porcentual en cantidades (kg vs SAP) y velocidades',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tciToleranciaPct debe ser numérico' })
  @Min(0, { message: 'Mínimo 0 %' })
  @Max(50, { message: 'Máximo 50 %' })
  tciToleranciaPct?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 15,
    example: 1,
    description: 'Días de holgura entre la merma y su transferencia SAP',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tciToleranciaDiasSap debe ser un número entero de días' })
  @Min(0, { message: 'Mínimo 0 días' })
  @Max(15, { message: 'Máximo 15 días' })
  tciToleranciaDiasSap?: number;
}
