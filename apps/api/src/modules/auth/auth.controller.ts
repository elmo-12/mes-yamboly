import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { LoginResponse, User as UserDto } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { Public } from '../../common/decorators/public';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { AuthService } from './auth.service';
import { ipCliente } from './ip-cliente';
import { LoginResponseDto, UserDto as UserSchema } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión con correo o DNI' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas', type: ApiErrorDto })
  @ApiResponse({ status: 400, description: 'Validación', type: ApiErrorDto })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos fallidos (por cuenta o por IP); `details.reintentarEnSeg`',
    type: ApiErrorDto,
  })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.login(dto, ipCliente(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión' })
  @ApiResponse({ status: 200, type: UserSchema })
  @ApiResponse({ status: 401, description: 'Sin token o token inválido', type: ApiErrorDto })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.perfil(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cierra la sesión y revoca los tokens emitidos al usuario' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.revocarSesiones(user.id);
  }
}
