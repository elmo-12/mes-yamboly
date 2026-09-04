import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { from, interval, map, mergeMap, startWith, type Observable } from 'rxjs';
import type { LineaTimeline, RealtimeStreamEvent, TiempoRealResumen, TvResumen } from '@mes/types';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { ahoraIso, toList } from '../../common/utils/query';
import { RealtimeService } from './realtime.service';

/** Cadencia del snapshot SSE del tablero. */
const INTERVALO_STREAM_MS = 5000;

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('tiempo-real')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Get('lineas')
  @ApiOperation({ summary: 'Estado calculado de cada línea del turno' })
  @ApiQuery({ name: 'lineaId', required: false })
  @ApiQuery({ name: 'estado', required: false, description: 'produciendo|parada|sin_orden|alerta|sugerida' })
  lineas(
    @Query('lineaId') lineaId?: string | string[],
    @Query('estado') estado?: string | string[],
  ): Promise<TiempoRealResumen> {
    return this.realtime.resumen(toList(lineaId), toList(estado));
  }

  @Get('lineas/:id/timeline')
  @ApiOperation({ summary: 'Cronología del turno para el drawer de línea' })
  @ApiResponse({ status: 404, description: 'Línea no encontrada', type: ApiErrorDto })
  timeline(@Param('id') id: string): Promise<LineaTimeline> {
    return this.realtime.timeline(id);
  }

  @Get('tv')
  @ApiOperation({ summary: 'Tablero para el modo TV' })
  tv(): Promise<TvResumen> {
    return this.realtime.tv();
  }

  @Sse('stream')
  @ApiOperation({ summary: 'SSE: snapshot del tablero cada 5 s (evento `estado`)' })
  stream(): Observable<{ type: string; data: RealtimeStreamEvent }> {
    return interval(INTERVALO_STREAM_MS).pipe(
      startWith(0),
      mergeMap(() => from(this.realtime.resumen())),
      map((payload) => ({
        type: 'estado',
        data: { tipo: 'estado' as const, emitidoEn: ahoraIso(), payload },
      })),
    );
  }
}
