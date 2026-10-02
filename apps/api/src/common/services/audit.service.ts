import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuditEvent as AuditEventDto, TipoAuditoria } from '@mes/types';
import { AuditEvent } from '../../database/entities';
import type { AuthUser } from '../decorators/current-user';
import { insertarConIdSecuencial } from '../utils/ids';
import { ahoraIso } from '../utils/query';

export interface RegistrarAuditoria {
  ordenId: string;
  tipo: TipoAuditoria;
  texto: string;
  usuario?: AuthUser | null;
  fecha?: string;
}

/**
 * Bitácora RF12: toda mutación de negocio deja una fila trazable
 * («quién · cuándo · qué»). Disponible globalmente vía `CommonModule`.
 */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditEvent) private readonly eventos: Repository<AuditEvent>) {}

  async registrar(entrada: RegistrarAuditoria): Promise<AuditEventDto> {
    const marca = Date.now().toString(36).toUpperCase();
    const evento = this.eventos.create({
      id: '',
      ordenId: entrada.ordenId,
      fecha: entrada.fecha ?? ahoraIso(),
      usuario: entrada.usuario?.nombre ?? 'Sistema',
      usuarioIniciales: entrada.usuario?.iniciales ?? 'SY',
      tipo: entrada.tipo,
      texto: entrada.texto,
    });
    /* Mismo formato `AUD-<marca>-<n>`, sin la carrera de `count() + 1`: dos
     * capturas simultáneas ya no chocan (500) al escribir su bitácora. */
    return insertarConIdSecuencial(this.eventos, evento, (n) => `AUD-${marca}-${n}`);
  }

  /** Bitácora de una orden, descendente por fecha. */
  async porOrden(ordenId: string, tipos: string[] = []): Promise<AuditEventDto[]> {
    const filas = await this.eventos.find({ where: { ordenId } });
    return filas
      .filter((e) => (tipos.length > 0 ? tipos.includes(e.tipo) : true))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}
