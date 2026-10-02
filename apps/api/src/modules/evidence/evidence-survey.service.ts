import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { EncuestaPublica } from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions';
import { hoyIso, redondear } from '../../common/utils';
import { EncuestaRespuesta, EncuestaSesion } from '../../database/entities';
import { ITEMS_TSP } from '../../database/seeds/thesis-evidence.seed';
import type { EncuestaRespuestaDto } from './dto/evidence.dto';
import { respuestasValidas } from './evidence.rules';
import { ColaSerial } from './cola-serial';

const TITULO = 'Encuesta de satisfacción · MES Yamboly';
const DESCRIPCION =
  'Ocho preguntas sobre tu experiencia registrando la producción con el sistema. Responde del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo). Es anónima y toma menos de 3 minutos.';

/** Encuesta pública del Anexo 04: cada token sirve para una sola respuesta. */
@Injectable()
export class EvidenceSurveyService {
  private readonly cola = new ColaSerial();

  constructor(
    @InjectRepository(EncuestaSesion) private readonly sesiones: Repository<EncuestaSesion>,
    @InjectRepository(EncuestaRespuesta) private readonly respuestas: Repository<EncuestaRespuesta>,
    private readonly dataSource: DataSource,
  ) {}

  async obtener(token: string): Promise<EncuestaPublica> {
    const sesion = await this.buscar(token);
    return {
      token: sesion.token,
      titulo: TITULO,
      descripcion: DESCRIPCION,
      items: ITEMS_TSP.map((texto, i) => ({ n: i + 1, texto })),
      respondida: sesion.respondida,
    };
  }

  responder(
    token: string,
    dto: EncuestaRespuestaDto,
  ): Promise<{ recibido: boolean; respuestas: number; pctAcuerdo: number }> {
    return this.cola.ejecutar(() => this.responderEnCola(token, dto));
  }

  private async responderEnCola(
    token: string,
    dto: EncuestaRespuestaDto,
  ): Promise<{ recibido: boolean; respuestas: number; pctAcuerdo: number }> {
    const sesion = await this.buscar(token);
    if (sesion.respondida) {
      throw new ConflictoException('Este enlace de encuesta ya fue utilizado');
    }

    /* Marca y guarda en una transacción con un UPDATE condicional: de dos
       envíos simultáneos sólo uno cambia `respondida`; el otro recibe 409 (no
       un 500 por clave duplicada). */
    await this.dataSource.transaction(async (manager) => {
      const marcado = await manager
        .getRepository(EncuestaSesion)
        .update({ token, respondida: false }, { respondida: true, respondidaEn: hoyIso() });
      if (!marcado.affected) {
        throw new ConflictoException('Este enlace de encuesta ya fue utilizado');
      }
      await manager.getRepository(EncuestaRespuesta).insert({
        id: `TSP-${token}`,
        token,
        respuestas: dto.respuestas,
        comentario: dto.comentario ?? null,
        fecha: hoyIso(),
      });
    });

    const filas = await this.respuestas.find();
    let deAcuerdo = 0;
    let total = 0;
    for (const fila of filas) {
      for (const valor of respuestasValidas(fila.respuestas).flat()) {
        total += 1;
        if (valor >= 4) deAcuerdo += 1;
      }
    }
    return {
      recibido: true,
      respuestas: filas.length,
      pctAcuerdo: total ? redondear((deAcuerdo / total) * 100) : 0,
    };
  }

  private async buscar(token: string): Promise<EncuestaSesion> {
    const sesion = await this.sesiones.findOne({ where: { token } });
    if (!sesion) throw new NoEncontradoException('Enlace de encuesta');
    return sesion;
  }
}
