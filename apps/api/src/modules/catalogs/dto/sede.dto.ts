import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Alta de sede (`POST /sedes`) — espejo de `sedeSchema`. */
export class CreateSedeDto {
  @ApiProperty({ example: 'AREQ', description: '3 o 4 letras mayúsculas' })
  @IsString()
  @Matches(/^[A-Z]{3,4}$/, { message: 'Formato esperado AREQ (3 o 4 letras mayúsculas)' })
  codigo!: string;

  @ApiProperty({ example: 'Arequipa' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ example: 'Arequipa' })
  @IsString()
  @MinLength(3, { message: 'La ciudad es obligatoria' })
  ciudad!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  activa?: boolean;
}

/** Edición parcial (`PATCH /sedes/:id`). */
export class UpdateSedeDto extends PartialType(CreateSedeDto) {}
