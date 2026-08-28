import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import { EvidenceService } from './evidence.service';

/**
 * Puente B1 → B2 del KPI TRI. Cada parada, merma, velocidad u orden registrada
 * emite `evidence.tri.registro` con el cronómetro del formulario; aquí se
 * convierte en una fila del postest del Anexo 02.
 */
@Injectable()
export class EvidenceTriListener {
  private readonly logger = new Logger(EvidenceTriListener.name);

  constructor(private readonly evidencia: EvidenceService) {}

  @OnEvent(TRI_REGISTRO_EVENT, { async: true })
  async onRegistro(evento: TriRegistroEvent): Promise<void> {
    try {
      await this.evidencia.registrarTiempoPostest({
        tipo: evento.tipo,
        segundos: evento.segundos,
        usuarioId: evento.usuarioId,
        fecha: evento.fecha,
        descripcion: evento.descripcion,
        referenciaId: evento.referenciaId,
      });
    } catch (error: unknown) {
      /* El TRI nunca debe tumbar el registro operativo que lo originó. */
      this.logger.warn(`No se pudo registrar el TRI de ${evento.tipo}: ${(error as Error).message}`);
    }
  }
}
