import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { EncuestaPublica } from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions';
import { hoyIso, redondear } from '../../common/utils';
import { EncuestaRespuesta, EncuestaSesion } from '../../database/entities';
import { ITEMS_TSP } from '../../database/seeds/thesis-evidence.seed';
import type { EncuestaRespuestaDto } from './dto/evidence.dto';

const TITULO = 'Encuesta de satisfacción · MES Yamboly';
const DESCRIPCION =
  'Ocho preguntas sobre tu experiencia registrando la producción con el sistema. Responde del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo). Es anónima y toma menos de 3 minutos.';

/** Encuesta pública del Anexo 04: cada token sirve para una sola respuesta. */
@Injectable()
export class EvidenceSurveyService {
  constructor(
    @InjectRepository(EncuestaSesion) private readonly sesiones: Repository<EncuestaSesion>,
    @InjectRepository(EncuestaRespuesta) private readonly respuestas: Repository<EncuestaRespuesta>,
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

  async responder(
    token: string,
    dto: EncuestaRespuestaDto,
  ): Promise<{ recibido: boolean; respuestas: number; pctAcuerdo: number }> {
    const sesion = await this.buscar(token);
    if (sesion.respondida) {
      throw new ConflictoException('Este enlace de encuesta ya fue utilizado');
    }

    await this.respuestas.save(
      this.respuestas.create({
        id: `TSP-${token}`,
        token,
        respuestas: dto.respuestas,
        comentario: dto.comentario ?? null,
        fecha: hoyIso(),
      }),
    );
    sesion.respondida = true;
    sesion.respondidaEn = hoyIso();
    await this.sesiones.save(sesion);

    const filas = await this.respuestas.find();
    let deAcuerdo = 0;
    let total = 0;
    for (const fila of filas) {
      for (const valor of fila.respuestas) {
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
