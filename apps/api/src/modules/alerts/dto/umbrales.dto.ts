import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, Max, Min } from 'class-validator';

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
}
