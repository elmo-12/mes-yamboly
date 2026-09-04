import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ROLES, type Role } from '@mes/types';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Campos comunes al alta y a la edición de usuario (sin contraseña). */
export class UsuarioBaseDto {
  @ApiProperty({ example: 'Ana Quispe' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ example: 'ana.quispe@yamboly.lat' })
  @IsEmail({}, { message: 'Correo inválido' })
  email!: string;

  @ApiProperty({ example: '45871203', description: '8 dígitos' })
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni!: string;

  @ApiProperty({ enum: ROLES, example: 'maquinista' })
  @IsIn(ROLES, { message: 'Selecciona un rol' })
  rol!: Role;

  @ApiProperty({ example: 'Maquinista de línea' })
  @IsString()
  @MinLength(2, { message: 'El cargo es obligatorio' })
  cargo!: string;

  @ApiProperty({ example: 'SED-LIMA' })
  @IsString()
  @MinLength(1, { message: 'Selecciona una sede' })
  sedeId!: string;

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2', nullable: true })
  @IsOptional()
  @IsString()
  lineaId?: string | null;
}

/**
 * Alta de usuario (`POST /usuarios`) — espejo de `crearUsuarioSchema` sin
 * `confirmacion`: la coincidencia de contraseñas la valida el formulario.
 */
export class CreateUsuarioDto extends UsuarioBaseDto {
  @ApiProperty({ example: 'Yamboly2026', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;
}

/**
 * Edición de usuario (`PATCH /usuarios/:id`): mismos campos, sin contraseña
 * (un `password` en el cuerpo se descarta por `whitelist`; para cambiarla se
 * usa `POST /usuarios/:id/restablecer-password`).
 */
export class UpdateUsuarioDto extends PartialType(UsuarioBaseDto) {}

/** Activar/desactivar usuario (`POST /usuarios/:id/estado`). */
export class CambiarEstadoUsuarioDto {
  @ApiProperty({ example: false })
  @Transform(BOOLEANO)
  @IsBoolean({ message: 'Indica si el usuario queda activo' })
  activo!: boolean;
}

/** Restablecer contraseña (`POST /usuarios/:id/restablecer-password`). */
export class RestablecerPasswordDto {
  @ApiProperty({ example: 'Yamboly2026', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;
}

export class UsuarioQueryDto {
  @ApiPropertyOptional({ description: 'Repetible o separado por comas' })
  @IsOptional()
  rol?: string | string[];

  @ApiPropertyOptional({ example: 'SED-LIMA' })
  @IsOptional()
  @IsString()
  sedeId?: string;

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;

  @ApiPropertyOptional({ description: '`true` sólo activos, `false` sólo inactivos' })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  activo?: boolean;
}
