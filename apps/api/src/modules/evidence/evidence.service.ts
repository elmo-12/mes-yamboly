import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  METAS_TESIS,
  calcCfs,
  calcEp,
  calcTci,
  calcTri,
  calcTriReduccion,
  calcTsp,
  estadoCfs,
  estadoEp,
  estadoTci,
  estadoTri,
  estadoTsp,
  segundosAMinutos,
} from '@mes/shared';
import type {
  EncuestaTSP,
  EstadoKpi,
  EvaluacionTCI,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTCI,
  EvidenciaTRI,
  ItemEncuesta,
  KpiTesis,
  RegistroEP,
  RegistroTRI,
  VerificacionCFS,
} from '@mes/types';
import { NoEncontradoException } from '../../common/exceptions';
import { hoyIso, redondear } from '../../common/utils';
import {
  EncuestaRespuesta,
  EncuestaSesion,
  EvaluacionCalidad,
  RegistroEp,
  RegistroTiempo,
  VerificacionFuncional,
} from '../../database/entities';
import { ITEMS_TSP } from '../../database/seeds/thesis-evidence.seed';
import { evaluarCriterios } from './evidence.rules';
import type { CargarPretestDto, OverrideTciDto, VerificacionCfsDto } from './dto/evidence.dto';

/** Ventanas de medición declaradas en la tesis (spec 09.A). */
export const PERIODOS_TESIS = {
  pretestDesde: '2026-08-24',
  pretestHasta: '2026-09-21',
  postestDesde: '2026-10-20',
  postestHasta: '2026-12-19',
} as const;

/** Enlace público de la encuesta de satisfacción. */
const ENLACE_ENCUESTA = '/encuesta/tsp-2026-20';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(RegistroTiempo) private readonly tiempos: Repository<RegistroTiempo>,
    @InjectRepository(EvaluacionCalidad) private readonly calidad: Repository<EvaluacionCalidad>,
    @InjectRepository(EncuestaRespuesta) private readonly encuestas: Repository<EncuestaRespuesta>,
    @InjectRepository(EncuestaSesion) private readonly sesiones: Repository<EncuestaSesion>,
    @InjectRepository(VerificacionFuncional) private readonly verificaciones: Repository<VerificacionFuncional>,
    @InjectRepository(RegistroEp) private readonly registrosEp: Repository<RegistroEp>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 09.A — Resumen de los 5 KPI                                       */
  /* ---------------------------------------------------------------- */

  async resumen(): Promise<EvidenciaResumen> {
    const [tri, tci, tsp, cfs, ep] = await Promise.all([
      this.tri(),
      this.tci(),
      this.tsp(),
      this.cfs(),
      this.ep(),
    ]);

    const kpis: KpiTesis[] = [
      {
        id: 'TRI',
        nombre: 'Tiempo de registro de información',
        formula: 'ΣTR / n',
        valor: tri.promedioPostest,
        unidad: 'min',
        meta: `Reducción ≥ ${METAS_TESIS.TRI_REDUCCION_PCT} % vs pretest`,
        metaValor: METAS_TESIS.TRI_REDUCCION_PCT,
        estado: tri.estado,
        anexo: 'Anexo 02',
        detalle: `${tri.promedioPostest} min frente a ${tri.promedioPretest} min del pretest (${tri.reduccionPct} %)`,
      },
      {
        id: 'TCI',
        nombre: 'Tasa de calidad de la información',
        formula: 'RC / RT × 100',
        valor: tci.porcentaje,
        unidad: '%',
        meta: `≥ ${METAS_TESIS.TCI_PCT} %`,
        metaValor: METAS_TESIS.TCI_PCT,
        estado: tci.estado,
        anexo: 'Anexo 03',
        detalle: `${tci.registrosCorrectos} de ${tci.registrosTotales} registros cumplen los 4 criterios`,
      },
      {
        id: 'TSP',
        nombre: 'Tasa de satisfacción del personal',
        formula: 'PO / PT × 100',
        valor: tsp.pctAcuerdo,
        unidad: '%',
        meta: `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`,
        metaValor: METAS_TESIS.TSP_PCT,
        estado: tsp.estado,
        anexo: 'Anexo 04',
        detalle: `${tsp.respuestas} de ${tsp.invitados} encuestados · promedio ${tsp.promedio}`,
      },
      {
        id: 'CFS',
        nombre: 'Cumplimiento funcional del sistema',
        formula: 'FV / FT × 100',
        valor: cfs.porcentaje,
        unidad: '%',
        meta: `${METAS_TESIS.CFS_TOTAL} / ${METAS_TESIS.CFS_TOTAL} funcionalidades`,
        metaValor: 100,
        estado: cfs.estado,
        anexo: 'Anexo 05',
        detalle: `${cfs.cumplidas} de ${cfs.totales} funcionalidades verificadas`,
      },
      {
        id: 'EP',
        nombre: 'Exactitud de las predicciones',
        formula: 'PCC / PTG × 100',
        valor: ep.porcentaje,
        unidad: '%',
        meta: `≥ ${METAS_TESIS.EP_PCT} %`,
        metaValor: METAS_TESIS.EP_PCT,
        estado: ep.estado,
        anexo: 'Anexo 06',
        detalle: `${ep.prediccionesCorrectas} de ${ep.prediccionesTotales} predicciones confirmadas`,
      },
    ];

    return {
      ...PERIODOS_TESIS,
      kpis,
      comparativaTri: [
        { etapa: 'Pretest', minutos: tri.promedioPretest },
        { etapa: 'Postest', minutos: tri.promedioPostest },
      ],
    };
  }

  /* ---------------------------------------------------------------- */
  /* 09.B — TRI (Anexo 02)                                             */
  /* ---------------------------------------------------------------- */

  async tri(): Promise<EvidenciaTRI> {
    const filas = await this.tiempos.find({ order: { etapa: 'ASC', n: 'ASC' } });
    const postest = filas.filter((f) => f.etapa === 'postest').map((f) => this.aRegistroTri(f));
    const pretest = filas.filter((f) => f.etapa === 'pretest').map((f) => this.aRegistroTri(f));

    const promedioPostest = calcTri(postest.map((r) => r.tiempoMin));
    const promedioPretest = calcTri(pretest.map((r) => r.tiempoMin));
    const reduccionPct = calcTriReduccion(promedioPretest, promedioPostest);

    return {
      postest,
      pretest,
      promedioPostest,
      promedioPretest,
      reduccionPct,
      meta: `Reducción ≥ ${METAS_TESIS.TRI_REDUCCION_PCT} % vs pretest`,
      estado: estadoTri(reduccionPct),
    };
  }

  /** Carga la hoja del pretest medida a mano (Anexo 02). */
  async cargarPretest(dto: CargarPretestDto): Promise<{ data: RegistroTRI[]; promedioPretest: number }> {
    await this.tiempos.delete({ etapa: 'pretest' });
    const filas = dto.registros.map((r, i) =>
      this.tiempos.create({
        id: `TRI-PR-${String(i + 1).padStart(2, '0')}`,
        n: i + 1,
        fecha: r.fecha,
        eventoRegistrado: r.eventoRegistrado,
        horaInicioRegistro: r.horaInicioRegistro.length === 5 ? `${r.horaInicioRegistro}:00` : r.horaInicioRegistro,
        segundos: Math.round(r.tiempoMin * 60),
        etapa: 'pretest' as const,
        tipo: 'manual',
        observacion: r.observacion ?? 'Registro manual en hoja de cálculo',
      }),
    );
    const guardadas = await this.tiempos.save(filas);
    const data = guardadas.map((f) => this.aRegistroTri(f));
    return { data, promedioPretest: calcTri(data.map((r) => r.tiempoMin)) };
  }

  /** Alta automática de una fila del postest a partir del cronómetro del formulario. */
  async registrarTiempoPostest(entrada: {
    tipo: string;
    segundos: number;
    usuarioId?: string;
    fecha?: string;
    descripcion?: string;
    referenciaId?: string;
  }): Promise<RegistroTiempo | null> {
    if (entrada.segundos <= 0) return null;
    const n = (await this.tiempos.countBy({ etapa: 'postest' })) + 1;
    const ahora = new Date();
    return this.tiempos.save(
      this.tiempos.create({
        id: `TRI-PO-AUTO-${entrada.referenciaId ?? `${Date.now().toString(36)}-${n}`}`,
        n,
        fecha: entrada.fecha ?? hoyIso(),
        eventoRegistrado: entrada.descripcion ?? this.descripcionPorTipo(entrada.tipo),
        horaInicioRegistro: ahora.toTimeString().slice(0, 8),
        segundos: Math.round(entrada.segundos),
        etapa: 'postest',
        tipo: entrada.tipo,
        usuarioId: entrada.usuarioId ?? null,
      }),
    );
  }

  private descripcionPorTipo(tipo: string): string {
    const textos: Record<string, string> = {
      parada: 'Registro de parada',
      merma: 'Registro de merma',
      velocidad: 'Registro de velocidad',
      orden: 'Registro de orden de fabricación',
    };
    return textos[tipo] ?? 'Registro en el sistema';
  }

  private aRegistroTri(f: RegistroTiempo): RegistroTRI {
    return {
      id: f.id,
      n: f.n,
      fecha: f.fecha,
      eventoRegistrado: f.eventoRegistrado,
      horaInicioRegistro: f.horaInicioRegistro,
      tiempoMin: segundosAMinutos(f.segundos),
      etapa: f.etapa,
      observacion: f.observacion ?? undefined,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 09.C — TCI (Anexo 03)                                             */
  /* ---------------------------------------------------------------- */

  async tci(): Promise<EvidenciaTCI> {
    const filas = await this.calidad.find({ order: { n: 'ASC' } });
    const registros: EvaluacionTCI[] = filas.map((f) => this.aEvaluacionTci(f));
    const registrosCorrectos = registros.filter((r) => r.valido).length;
    const porcentaje = calcTci(registrosCorrectos, registros.length);
    return {
      registros,
      registrosCorrectos,
      registrosTotales: registros.length,
      porcentaje,
      meta: `≥ ${METAS_TESIS.TCI_PCT} %`,
      estado: estadoTci(porcentaje),
    };
  }

  /** Sobrescribe manualmente los criterios de una evaluación (vista 09.C). */
  async overrideTci(id: string, dto: OverrideTciDto): Promise<{ item: EvaluacionTCI; resumen: EvidenciaTCI }> {
    const fila = await this.calidad.findOne({ where: { id } });
    if (!fila) throw new NoEncontradoException('Evaluación de calidad');
    if (dto.completo !== undefined) fila.overrideCompleto = dto.completo;
    if (dto.preciso !== undefined) fila.overridePreciso = dto.preciso;
    if (dto.trazable !== undefined) fila.overrideTrazable = dto.trazable;
    if (dto.observacion !== undefined) fila.observacion = dto.observacion;
    await this.calidad.save(fila);
    return { item: this.aEvaluacionTci(fila), resumen: await this.tci() };
  }

  private aEvaluacionTci(f: EvaluacionCalidad): EvaluacionTCI {
    const criterios = evaluarCriterios(f);
    return {
      id: f.id,
      n: f.n,
      fecha: f.fecha,
      turno: f.turno,
      registro: f.registro,
      ...criterios,
      observacion: f.observacion,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 09.D — TSP (Anexo 04)                                             */
  /* ---------------------------------------------------------------- */

  async tsp(): Promise<EncuestaTSP & { invitados: number }> {
    const filas = await this.encuestas.find();
    const matriz = filas.map((f) => f.respuestas);
    const invitados = await this.contarInvitados();

    const items: ItemEncuesta[] = ITEMS_TSP.map((texto, j) => {
      const columna = matriz.map((fila) => fila[j] ?? 0).filter((v) => v > 0);
      const deAcuerdo = columna.filter((v) => v >= 4).length;
      const suma = columna.reduce((a, b) => a + b, 0);
      return {
        n: j + 1,
        texto,
        promedio: columna.length ? Math.round((suma / columna.length) * 100) / 100 : 0,
        pctAcuerdo: columna.length ? redondear((deAcuerdo / columna.length) * 100) : 0,
      };
    });

    let deAcuerdo = 0;
    let total = 0;
    let suma = 0;
    for (const fila of matriz) {
      for (const valor of fila) {
        total += 1;
        suma += valor;
        if (valor >= 4) deAcuerdo += 1;
      }
    }
    const pctAcuerdo = calcTsp(deAcuerdo, total);

    return {
      items,
      respuestas: matriz.length,
      invitados,
      promedio: total ? Math.round((suma / total) * 100) / 100 : 0,
      pctAcuerdo,
      meta: `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`,
      estado: estadoTsp(pctAcuerdo),
      enlace: ENLACE_ENCUESTA,
    };
  }

  private async contarInvitados(): Promise<number> {
    return this.sesiones.count();
  }

  /* ---------------------------------------------------------------- */
  /* 09.E — CFS (Anexo 05)                                             */
  /* ---------------------------------------------------------------- */

  async cfs(): Promise<EvidenciaCFS> {
    const filas = await this.verificaciones.find({ order: { n: 'ASC' } });
    const items: VerificacionCFS[] = filas.map((f) => ({
      id: f.id,
      n: f.n,
      rf: f.rf,
      funcionalidad: f.funcionalidad,
      cumple: f.cumple,
      observacion: f.observacion,
      ruta: f.ruta,
    }));
    const cumplidas = items.filter((i) => i.cumple).length;
    const totales = items.length || METAS_TESIS.CFS_TOTAL;
    /* El instrumento fija FT = 9; sólo si la lista creciera se recalcula a mano. */
    const porcentaje =
      totales === METAS_TESIS.CFS_TOTAL ? calcCfs(cumplidas) : redondear((cumplidas / totales) * 100);
    return {
      items,
      cumplidas,
      totales: items.length,
      porcentaje,
      meta: `${METAS_TESIS.CFS_TOTAL} / ${METAS_TESIS.CFS_TOTAL} funcionalidades`,
      estado: estadoCfs(porcentaje),
    };
  }

  async actualizarCfs(id: string, dto: VerificacionCfsDto): Promise<{ item: VerificacionCFS; resumen: EvidenciaCFS }> {
    const fila = await this.verificaciones.findOne({ where: { id } });
    if (!fila) throw new NoEncontradoException('Verificación funcional');
    fila.cumple = dto.cumple;
    fila.observacion = dto.observacion ?? fila.observacion;
    await this.verificaciones.save(fila);
    const resumen = await this.cfs();
    const item = resumen.items.find((i) => i.id === id)!;
    return { item, resumen };
  }

  /* ---------------------------------------------------------------- */
  /* 09.F — EP (Anexo 06)                                              */
  /* ---------------------------------------------------------------- */

  async ep(): Promise<EvidenciaEP> {
    const filas = await this.registrosEp.find({ order: { n: 'ASC' } });
    const registros: RegistroEP[] = filas.map((f) => ({
      id: f.id,
      n: f.n,
      fecha: f.fecha,
      tipoPrediccion: f.tipoPrediccion,
      eventoReal: f.eventoReal,
      acierto: f.acierto,
      observacion: f.observacion,
      alertaId: f.alertaId ?? undefined,
    }));
    const prediccionesCorrectas = registros.filter((r) => r.acierto).length;
    const porcentaje = calcEp(prediccionesCorrectas, registros.length);
    return {
      registros,
      prediccionesCorrectas,
      prediccionesTotales: registros.length,
      porcentaje,
      meta: `≥ ${METAS_TESIS.EP_PCT} %`,
      estado: estadoEp(porcentaje) as EstadoKpi,
    };
  }
}
