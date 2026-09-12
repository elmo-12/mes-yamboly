import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { OPCIONES_SUBIDA_IMAGEN, type ArchivoSubido } from '../../common/utils';
import { AdjuntosService, type EvidenciaGuardada } from './adjuntos.service';

@ApiTags('evidencias')
@Controller('evidencias')
export class AdjuntosController {
  constructor(private readonly adjuntos: AdjuntosService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('archivo', OPCIONES_SUBIDA_IMAGEN))
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
  subir(@UploadedFile() archivo: ArchivoSubido | undefined): EvidenciaGuardada {
    return this.adjuntos.guardar(archivo);
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
    });
    return new StreamableFile(foto.stream);
  }
}
