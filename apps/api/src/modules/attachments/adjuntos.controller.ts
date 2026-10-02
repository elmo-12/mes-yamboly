import {
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { catchError, type Observable, throwError } from 'rxjs';
import { ROLES_SUBIR_EVIDENCIA } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { Roles } from '../../common/decorators/roles';
import { MAX_BYTES_IMAGEN, OPCIONES_SUBIDA_IMAGEN, type ArchivoSubido } from '../../common/utils';
import { AdjuntosService, type EvidenciaGuardada } from './adjuntos.service';

/**
 * Multer responde «File too large» (inglés, `INTERNAL_ERROR`). Se traduce a un
 * 413 en español con detalle por campo para que el asistente lo muestre tal cual.
 */
@Injectable()
class LimiteFotoInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof PayloadTooLargeException
            ? new HttpException(
                {
                  code: 'PAYLOAD_TOO_LARGE',
                  message: `La foto supera el máximo de ${MAX_BYTES_IMAGEN / 1024 / 1024} MB`,
                  details: { archivo: `Máximo ${MAX_BYTES_IMAGEN / 1024 / 1024} MB por foto` },
                },
                HttpStatus.PAYLOAD_TOO_LARGE,
              )
            : error,
        ),
      ),
    );
  }
}

@ApiTags('evidencias')
@Controller('evidencias')
export class AdjuntosController {
  constructor(private readonly adjuntos: AdjuntosService) {}

  @Post()
  @HttpCode(201)
  @Roles(...ROLES_SUBIR_EVIDENCIA)
  @UseInterceptors(LimiteFotoInterceptor, FileInterceptor('archivo', OPCIONES_SUBIDA_IMAGEN))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { archivo: { type: 'string', format: 'binary' } },
      required: ['archivo'],
    },
  })
  @ApiOperation({ summary: 'Sube la foto de evidencia de una parada o merma (≤ 8 MB)' })
  @ApiOkResponse({ description: 'Ruta con la que la parada o la merma referencia la foto' })
  subir(
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @CurrentUser() user: AuthUser,
  ): EvidenciaGuardada {
    return this.adjuntos.guardar(archivo, user.id);
  }

  @Get(':archivo')
  @ApiOperation({ summary: 'Descarga una foto de evidencia por su nombre' })
  descargar(
    @Param('archivo') archivo: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const foto = this.adjuntos.abrir(archivo);
    res.set({
      'Content-Type': foto.tipo,
      'Content-Length': String(foto.bytes),
      'Content-Disposition': `inline; filename="${foto.nombre}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(foto.stream);
  }
}
