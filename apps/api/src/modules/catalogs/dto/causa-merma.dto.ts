import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  ESTADOS_CATALOGO,
  NIVELES_CAUSA_MERMA,
  TIPOS_MERMA,
  type EstadoCatalogo,
  type NivelCausaMerma,
  type TipoMermaCodigo,
} from '@mes/types';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Alta de causa de merma (`POST /causas-merma`) — espejo de `causaMermaSchema`. */
export class CreateCausaMermaDto {
  @ApiProperty({ example: 'MP-01-01', description: 'MP-01, MP-01-A o MP-01-01' })
  @IsString()
  @Matches(/^M[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, {
    message: 'Formato esperado MP-01, MP-01-A o MP-01-01',
  })
  codigo!: string;

  @ApiProperty({ example: 'Derrame de mezcla' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ enum: NIVELES_CAUSA_MERMA })
  @IsIn(NIVELES_CAUSA_MERMA)
  nivel!: NivelCausaMerma;

  @ApiPropertyOptional({ example: 'CME-MP-01-A', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ enum: TIPOS_MERMA, isArray: true, default: [] })
  @IsOptional()
  @IsArray()
  @IsIn(TIPOS_MERMA, { each: true })
  aplicaA?: TipoMermaCodigo[];

  @ApiPropertyOptional({ type: [String], default: [], description: 'Vacío = todas las líneas' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lineasAplicables?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  requiereEvidencia?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Obliga a `observacion` en el wizard' })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  requiereComentario?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Obliga a `numeroSolicitud` en el wizard' })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  requiereSolicitud?: boolean;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO, default: 'activo' })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}

/** Edición parcial (`PATCH /causas-merma/:id`). */
export class UpdateCausaMermaDto extends PartialType(CreateCausaMermaDto) {}

export class CausaMermaQueryDto {
  @ApiPropertyOptional({ enum: ['arbol', 'plano'], default: 'arbol' })
  @IsOptional()
  @IsIn(['arbol', 'plano'])
  formato?: 'arbol' | 'plano';

  @ApiPropertyOptional({ enum: NIVELES_CAUSA_MERMA })
  @IsOptional()
  @IsIn(NIVELES_CAUSA_MERMA)
  nivel?: NivelCausaMerma;

  @ApiPropertyOptional({ enum: TIPOS_MERMA })
  @IsOptional()
  @IsIn(TIPOS_MERMA)
  tipo?: TipoMermaCodigo;

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;
}
