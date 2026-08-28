import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuditEvent as AuditEventDto, TipoAuditoria } from '@mes/types';
import { AuditEvent } from '../../database/entities';
import type { AuthUser } from '../decorators/current-user';
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
    const total = await this.eventos.count();
    const evento = this.eventos.create({
      id: `AUD-${Date.now().toString(36).toUpperCase()}-${total + 1}`,
      ordenId: entrada.ordenId,
      fecha: entrada.fecha ?? ahoraIso(),
      usuario: entrada.usuario?.nombre ?? 'Sistema',
      usuarioIniciales: entrada.usuario?.iniciales ?? 'SY',
      tipo: entrada.tipo,
      texto: entrada.texto,
    });
    return this.eventos.save(evento);
  }

  /** Bitácora de una orden, descendente por fecha. */
  async porOrden(ordenId: string, tipos: string[] = []): Promise<AuditEventDto[]> {
    const filas = await this.eventos.find({ where: { ordenId } });
    return filas
      .filter((e) => (tipos.length > 0 ? tipos.includes(e.tipo) : true))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}
