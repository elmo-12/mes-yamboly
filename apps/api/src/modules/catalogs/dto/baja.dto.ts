import { ApiProperty } from '@nestjs/swagger';

/**
 * Respuesta única de toda baja lógica de catálogo (`DELETE /productos/:id`,
 * `/velocidades-estandar/:id`, `/causas-merma/:id`, `/lineas/:id`,
 * `/causas-parada/:id`). Nunca hay borrado físico cuando existe histórico.
 */
export class BajaLogicaResponseDto {
  @ApiProperty({ example: 'CME-MP-01-01' }) id!: string;
  @ApiProperty({ example: 'MP-01-01' }) codigo!: string;
  @ApiProperty({ enum: ['inactivo', 'baja'], example: 'inactivo' })
  estado!: 'inactivo' | 'baja';

  @ApiProperty({ example: 14, description: 'Registros históricos que conservan el código' })
  conservados!: number;

  @ApiProperty({ example: 'mermas', description: 'Etiqueta en plural para el modal Danger' })
  etiquetaConservados!: string;

  @ApiProperty() mensaje!: string;
}

/**
 * Baja de causa de parada: el genérico más el alias histórico
 * `paradasConservadas`, que web y e2e aún consumen.
 */
export class BajaCausaParadaResponseDto extends BajaLogicaResponseDto {
  @ApiProperty({ example: 14, description: 'Alias de `conservados` (compatibilidad)' })
  paradasConservadas!: number;
}
