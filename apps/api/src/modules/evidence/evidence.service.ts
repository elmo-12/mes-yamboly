import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  METAS_TESIS,
  calcCfsOpcional,
  calcEpOpcional,
  calcTri,
  calcTriOpcional,
  calcTriReduccion,
  calcTsp,
  estadoCfs,
  estadoEp,
  estadoTri,
  estadoTsp,
  formatNumber,
  segundosAMinutos,
} from '@mes/shared';
import type {
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTRI,
  EvidenciaTSP,
  InvitacionTSP,
  ItemEncuesta,
  KpiTesis,
  RegistroEP,
  RegistroTRI,
  VerificacionCFS,
} from '@mes/types';
import type { EnvVars } from '../../config/env.validation';
import { NoEncontradoException } from '../../common/exceptions';
import { ahoraIso, hoyIso, redondear } from '../../common/utils';
import {
  EncuestaRespuesta,
  EncuestaSesion,
  RegistroEp,
  RegistroTiempo,
  VerificacionFuncional,
} from '../../database/entities';
import { ITEMS_TSP } from '../../database/seeds/thesis-evidence.seed';
import { EvidenceValidationService } from './evidence-validation.service';
import type { CargarPretestDto, CrearInvitacionDto, VerificacionCfsDto } from './dto/evidence.dto';

/** Ventanas de medición declaradas en la tesis (spec 09.A). */
export const PERIODOS_TESIS = {
  pretestDesde: '2026-08-24',
  pretestHasta: '2026-09-21',
  postestDesde: '2026-10-20',
  postestHasta: '2026-12-19',
} as const;

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(RegistroTiempo) private readonly tiempos: Repository<RegistroTiempo>,
    @InjectRepository(EncuestaRespuesta) private readonly encuestas: Repository<EncuestaRespuesta>,
    @InjectRepository(EncuestaSesion) private readonly sesiones: Repository<EncuestaSesion>,
    @InjectRepository(VerificacionFuncional) private readonly verificaciones: Repository<VerificacionFuncional>,
    @InjectRepository(RegistroEp) private readonly registrosEp: Repository<RegistroEp>,
    private readonly validacion: EvidenceValidationService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 09.A — Resumen de los 5 KPI                                       */
  /* ---------------------------------------------------------------- */

  async resumen(): Promise<EvidenciaResumen> {
    const [tri, tci, tsp, cfs, ep] = await Promise.all([
      this.tri(),
      this.validacion.resumen(),
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
        detalle:
          tri.promedioPostest === null || tri.reduccionPct === null
            ? `Se calcula con cada captura real del sistema; el pretest está en ${formatNumber(tri.promedioPretest, 1)} min`
            : `${formatNumber(tri.promedioPostest, 1)} min frente a ${formatNumber(tri.promedioPretest, 1)} min del pretest (${formatNumber(tri.reduccionPct, 1)} %)`,
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
        detalle:
          tci.registrosTotales === 0
            ? 'Se calcula al validar las capturas contra las fuentes externas importadas (sensores, solicitudes y SAP)'
            : `${tci.registrosCorrectos} de ${tci.registrosTotales} registros cumplen todos sus criterios`,
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
        detalle:
          tsp.respuestas > 0
            ? `${tsp.respuestas} de ${tsp.invitados} encuestados · promedio ${formatNumber(tsp.promedio ?? 0, 1)}`
            : tsp.invitados === 0
              ? 'Se calcula con las respuestas de la encuesta; todavía no se ha emitido ninguna invitación'
              : `Se calcula con las respuestas de la encuesta; ${tsp.invitados === 1 ? '1 invitación emitida' : `${tsp.invitados} invitaciones emitidas`} sin responder`,
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
        detalle:
          cfs.verificadas === 0
            ? 'Se calcula al marcar cada funcionalidad en la lista de cotejo del Anexo 05'
            : `${cfs.cumplidas} de ${cfs.totales} funcionalidades cumplen · ${cfs.verificadas} verificadas`,
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
        detalle:
          ep.prediccionesTotales === 0
            ? 'Se calcula al confirmar el evento real de cada alerta en la bandeja de Alertas'
            : `${ep.prediccionesCorrectas} de ${ep.prediccionesTotales} predicciones confirmadas`,
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

    const promedioPostest = calcTriOpcional(postest.map((r) => r.tiempoMin));
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
  /* 09.D — TSP (Anexo 04)                                             */
  /* ---------------------------------------------------------------- */

  async tsp(): Promise<EvidenciaTSP> {
    const [filas, sesiones] = await Promise.all([this.encuestas.find(), this.sesiones.find()]);
    const matriz = filas.map((f) => f.respuestas);

    const items: ItemEncuesta[] = ITEMS_TSP.map((texto, j) => {
      const columna = matriz.map((fila) => fila[j] ?? 0).filter((v) => v > 0);
      const deAcuerdo = columna.filter((v) => v >= 4).length;
      const suma = columna.reduce((a, b) => a + b, 0);
      return {
        n: j + 1,
        texto,
        promedio: columna.length ? Math.round((suma / columna.length) * 100) / 100 : null,
        pctAcuerdo: columna.length ? redondear((deAcuerdo / columna.length) * 100) : null,
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

    const invitaciones = sesiones
      .map((s) => this.aInvitacion(s))
      .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn) || a.token.localeCompare(b.token));

    return {
      items,
      invitaciones,
      respuestas: matriz.length,
      invitados: sesiones.length,
      promedio: total ? Math.round((suma / total) * 100) / 100 : null,
      pctAcuerdo,
      meta: `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`,
      estado: estadoTsp(pctAcuerdo),
      enlace: invitaciones.length ? invitaciones[invitaciones.length - 1]!.url : '',
    };
  }

  /**
   * Crea una invitación nominal con token de un solo uso y devuelve su enlace
   * público (`{WEB_URL ?? CORS_ORIGIN}/encuesta/<token>`).
   */
  async crearInvitacion(dto: CrearInvitacionDto): Promise<{ invitacion: InvitacionTSP; resumen: EvidenciaTSP }> {
    const anio = new Date().getFullYear();
    const prefijo = `tsp-${anio}-`;
    const existentes = await this.sesiones.find();
    const usados = existentes
      .filter((s) => s.token.startsWith(prefijo))
      .map((s) => Number(s.token.slice(prefijo.length)))
      .filter((n) => Number.isFinite(n));
    const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;

    const sesion = await this.sesiones.save(
      this.sesiones.create({
        token: `${prefijo}${String(siguiente).padStart(2, '0')}`,
        invitado: dto.invitado,
        rol: dto.rol ?? null,
        respondida: false,
        respondidaEn: null,
        creadaEn: ahoraIso(),
      }),
    );

    return { invitacion: this.aInvitacion(sesion), resumen: await this.tsp() };
  }

  private aInvitacion(s: EncuestaSesion): InvitacionTSP {
    return {
      token: s.token,
      invitado: s.invitado,
      ...(s.rol ? { rol: s.rol } : {}),
      url: `${this.baseWeb()}/encuesta/${s.token}`,
      respondida: s.respondida,
      ...(s.respondidaEn ? { respondidaEn: s.respondidaEn } : {}),
      creadaEn: s.creadaEn || '',
    };
  }

  /** Origen público de la web: `WEB_URL` y, si no está definida, `CORS_ORIGIN`. */
  private baseWeb(): string {
    const web = this.config.get('WEB_URL', { infer: true });
    const origen = web && web.length > 0 ? web : this.config.get('CORS_ORIGIN', { infer: true });
    return String(origen).split(',')[0]!.replace(/\/+$/, '');
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
      verificadaEn: f.verificadaEn ?? null,
    }));
    const cumplidas = items.filter((i) => i.cumple).length;
    const verificadas = items.filter((i) => i.verificadaEn).length;
    const totales = items.length || METAS_TESIS.CFS_TOTAL;
    /* El instrumento fija FT = 9; sólo si la lista creciera se recalcula a mano. */
    const porcentaje = calcCfsOpcional(cumplidas, verificadas, totales);
    return {
      items,
      cumplidas,
      totales: items.length,
      verificadas,
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
    /* Marcarla desde la ficha ya cuenta como verificada, cumpla o no. */
    fila.verificadaEn = ahoraIso();
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
    const porcentaje = calcEpOpcional(prediccionesCorrectas, registros.length);
    return {
      registros,
      prediccionesCorrectas,
      prediccionesTotales: registros.length,
      porcentaje,
      meta: `≥ ${METAS_TESIS.EP_PCT} %`,
      estado: estadoEp(porcentaje),
    };
  }
}
