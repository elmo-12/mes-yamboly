import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { LoginResponse, User as UserDto } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { Public } from '../../common/decorators/public';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { AuthService } from './auth.service';
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
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto);
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
  @ApiOperation({ summary: 'Cierra la sesión (el cliente descarta el token)' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  logout(): void {
    /* JWT sin estado: el cliente descarta el token. */
  }
}
