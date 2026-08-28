import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'jefe@yamboly.lat', description: 'Correo corporativo o DNI' })
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu correo o DNI' })
  email!: string;

  @ApiProperty({ example: 'Yamboly2026', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  recordarme?: boolean;
}
