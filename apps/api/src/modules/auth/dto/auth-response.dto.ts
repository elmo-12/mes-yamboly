import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '@mes/types';

export class UserDto {
  @ApiProperty({ example: 'USR-01' }) id!: string;
  @ApiProperty({ example: 'Carlos Mendoza' }) nombre!: string;
  @ApiProperty({ example: 'jefe@yamboly.lat' }) email!: string;
  @ApiProperty({ example: '41285630' }) dni!: string;
  @ApiProperty({ enum: ROLES, example: 'jefe' }) rol!: Role;
  @ApiProperty({ example: 'Jefe de producción' }) cargo!: string;
  @ApiProperty({ required: false, example: 'LIN-LLEN-M2' }) lineaId?: string;
  @ApiProperty({ example: 'CM' }) iniciales!: string;
  @ApiProperty({ required: false }) avatarUrl?: string;
  @ApiProperty({ example: true }) activo!: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT firmado con {sub, rol, lineaId}' })
  accessToken!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
