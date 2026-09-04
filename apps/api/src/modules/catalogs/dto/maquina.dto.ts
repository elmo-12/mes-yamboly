import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ESTADOS_MAQUINA, type EstadoMaquina } from '@mes/types';

export class CreateMaquinaDto {
  @ApiProperty({ example: 'MQ-LLENM2-01', description: 'Formato MQ-<línea>-<nn>' })
  @IsString()
  @Matches(/^MQ-[A-Z0-9]{2,6}-\d{2}$/, { message: 'Formato esperado MQ-LLENM2-01' })
  codigo!: string;

  @ApiProperty({ example: 'Envolvedora' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ example: 'Envolvedora' })
  @IsString()
  @MinLength(3, { message: 'El tipo es obligatorio' })
  tipo!: string;

  @ApiProperty({ example: 'LIN-LLEN-M2' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiPropertyOptional({ enum: ESTADOS_MAQUINA, default: 'operativa' })
  @IsOptional()
  @IsIn(ESTADOS_MAQUINA)
  estado?: EstadoMaquina;
}

export class UpdateMaquinaDto extends PartialType(CreateMaquinaDto) {}

export class MaquinaQueryDto {
  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;

  @ApiPropertyOptional({ enum: ESTADOS_MAQUINA, isArray: true })
  @IsOptional()
  estado?: string | string[];
}
