import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RiesgoLinea, Turno } from '@mes/types';
import { hoyIso } from '../../../common/utils';
import {
  Alerta,
  CausaParada,
  Linea,
  ModeloVersion,
  OrdenFabricacion,
  Parada,
  Prediccion,
} from '../../../database/entities';
import {
  PREDICTION_PROVIDER,
  type PredictionContext,
  type PredictionProvider,
} from '../../alerts/prediction';
import { AlertsEngineService, type SenalLinea } from '../../alerts/alerts-engine.service';
import { DatasetBuilderService, finDeTurno, inicioDeTurno } from '../dataset';

/** Suavizado de Laplace de la tabla de frecuencias de causa. */
const ALFA_LAPLACE = 1;

export interface TurnoObjetivo {
  fecha: string;
  turno: Turno;
  inicio: string;
  fin: string;
}

export interface ResultadoCiclo {
  objetivo: TurnoObjetivo;
  riesgos: RiesgoLinea[];
  predicciones: number;
  alertas: number;
  vencidas: number;
  proveedor: string;
}

/**
 * Puntúa las 9 líneas para el turno siguiente y deja el resultado en
 * `prediccion` (§7.3 del plan de IA). Es el único sitio del sistema que llama a
 * `AlertsEngineService.evaluar()`: hasta ahora el motor de alertas existía pero
 * nadie lo disparaba, y la promesa de la UI («se recalculan cada 15 minutos»)
 * no correspondía a ningún proceso.
 */
@Injectable()
export class RiesgoService {
  private readonly logger = new Logger(RiesgoService.name);

  constructor(
    private readonly dataset: DatasetBuilderService,
    private readonly motor: AlertsEngineService,
    @Inject(PREDICTION_PROVIDER) private readonly proveedor: PredictionProvider,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(CausaParada) private readonly causas: Repository<CausaParada>,
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
  ) {}

  /** Turno siguiente al que corre ahora: Día 06–18, Noche 18–06. */
  turnoObjetivo(ahora = new Date()): TurnoObjetivo {
    const hora = ahora.getHours();
    const esDia = hora >= 6 && hora < 18;
    const turno: Turno = esDia ? 'N' : 'D';
    /* Entre medianoche y las 06:00 corre el turno Noche del día anterior, así
     * que el Día objetivo es el de hoy; a partir de las 18:00, el de mañana. */
    const fecha = new Date(ahora);
    if (!esDia && hora >= 18) fecha.setDate(fecha.getDate() + 1);
    const dia = hoyIso(fecha);
    return { fecha: dia, turno, inicio: inicioDeTurno(dia, turno), fin: finDeTurno(dia, turno) };
  }

  /**
   * Ciclo completo de inferencia: construye la muestra `anticipado` de cada
   * línea, la puntúa con la cascada, hace *upsert* idempotente en `prediccion`
   * y deja que el motor de alertas decida si procede una alerta.
   */
  async ejecutarCiclo(
    opciones: { generarAlertas?: boolean; persistir?: boolean } = {},
  ): Promise<ResultadoCiclo> {
    const generarAlertas = opciones.generarAlertas ?? true;
    const persistir = opciones.persistir ?? true;
    const objetivo = this.turnoObjetivo();
    const lineas = await this.lineas.find({ where: { estado: 'activo' }, order: { codigo: 'ASC' } });
    const version = await this.versiones.findOne({ where: { estado: 'vigente' } });
    const muestras = await this.dataset.construirVivoLote(
      lineas.map((l) => l.id),
      objetivo.fecha,
      objetivo.turno,
    );
    const causas = await this.tablaDeCausas(objetivo.turno);
    const activas = await this.alertas.find({ where: { estado: 'activa' } });
    const conAlertaViva = new Set(activas.map((a) => a.lineaId));

    const riesgos: RiesgoLinea[] = [];
    const filas: Prediccion[] = [];
    let nivelPuntuacion = this.proveedor.nombre;
    let alertasCreadas = 0;

    for (const linea of lineas) {
      const muestra = muestras.get(linea.id);
      const features = muestra?.features ?? {};
      const ctxPrediccion: PredictionContext = {
        tipo: 'parada_prevista',
        lineaId: linea.id,
        lineaCodigo: linea.codigo,
        turno: objetivo.turno,
        eventos7d: features.paradasImprev7d ?? 0,
        eventos30d: features.paradasImprev30d ?? 0,
        desvioVelocidadPct: features.desvioVelocidadTurnoPrevio ?? 0,
        oeeActual: features.oeeTurnoPrevio ?? 0,
        minutosDesdeCambio: 0,
        features: muestra?.features,
      };
      const resultado = await this.proveedor.predict(ctxPrediccion);
      /* El nivel que importa es el que puntuó **el riesgo de parada**, no el de
       * la última llamada del ciclo: el motor de alertas evalúa después
       * `velocidad_baja` y `oee_bajo`, tipos que Python rechaza con 422 por
       * contrato, así que `proveedor.nombre` acababa diciendo siempre
       * «cascada:reglas» aunque las 9 líneas las hubiera puntuado Python. */
      nivelPuntuacion = this.proveedor.nombre;
      const { probabilidad } = resultado;
      /*
       * Incoherencia D5: este mismo ciclo llama más abajo a `motor.evaluar()`,
       * que —si dispara `parada_prevista`— vuelve a pedirle una probabilidad al
       * mismo PREDICTION_PROVIDER, pero con un `PredictionContext` más estrecho
       * (`AlertsEngineService.evaluar()` no tiene el vector `features`, sólo el
       * contexto que cabe en `SenalLinea`). Con Python activo eso puede vectorizar
       * distinto y devolver una probabilidad distinta para la misma línea/turno.
       * No podemos ampliar `SenalLinea`/`AlertsEngineService` con `features` sin
       * tocar ese servicio (fuera de los archivos de este bloque), así que en su
       * lugar dejamos precargada la respuesta ya calculada arriba: si el
       * proveedor la soporta (la cascada sí, vía `precalcular()`), la reutiliza
       * en la próxima llamada con el mismo tipo/línea/turno en vez de recalcular.
       */
      this.proveedor.precalcular?.(ctxPrediccion, resultado);
      const causa = causas.get(linea.id) ?? causas.get('*');

      riesgos.push({
        lineaId: linea.id,
        lineaCodigo: linea.codigo,
        lineaNombre: linea.nombre,
        riesgo: Math.round(probabilidad),
        turnoObjetivo: objetivo.turno,
        causaProbable: causa?.texto ?? 'Sin causa dominante registrada',
        probabilidadCausa: causa ? Math.round(causa.probabilidad * 100) : undefined,
        ventana: `${objetivo.inicio.slice(11, 16)}–${objetivo.fin.slice(11, 16)}`,
      });

      filas.push(
        this.predicciones.create({
          /* Clave idempotente: un segundo ciclo del mismo turno actualiza la
           * fila en vez de duplicarla (R8: cron en varias instancias). */
          id: `PRD-${linea.codigo}-${objetivo.fecha}-${objetivo.turno}`,
          fecha: objetivo.fecha,
          lineaId: linea.id,
          lineaCodigo: linea.codigo,
          turnoObjetivo: objetivo.turno,
          tipo: 'Parada prevista',
          prediccion: `Parada imprevista probable en ${linea.codigo} · ${causa?.texto ?? 'causa por determinar'}`,
          probabilidad: Math.round(probabilidad * 10) / 10,
          eventoReal: 'Pendiente de cierre del turno',
          acierto: null,
          modeloVersion: version?.version ?? 'sin-modelo',
          ventanaInicio: objetivo.inicio,
          ventanaFin: objetivo.fin,
          features: muestra?.features ?? null,
          origen: 'vivo' as const,
        }),
      );

      if (!generarAlertas || conAlertaViva.has(linea.id)) continue;
      const creadas = await this.motor.evaluar(this.senal(linea, objetivo.turno, features));
      if (creadas.length) {
        alertasCreadas += creadas.length;
        const ultima = filas[filas.length - 1]!;
        ultima.alertaId = creadas[0]!.id;
      }
    }

    if (persistir) await this.predicciones.save(filas, { chunk: 50 });
    const vencidas = generarAlertas ? await this.motor.vencerCaducadas() : 0;

    this.logger.log(
      `Ciclo ${objetivo.fecha}/${objetivo.turno}: ${filas.length} predicciones · ` +
        `${alertasCreadas} alerta(s) · ${vencidas} vencida(s) · ${nivelPuntuacion}`,
    );
    return {
      objetivo,
      riesgos,
      predicciones: filas.length,
      alertas: alertasCreadas,
      vencidas,
      proveedor: nivelPuntuacion,
    };
  }

  /**
   * Riesgo por línea para la vista Resumen. Lee lo que dejó el último ciclo y,
   * si el turno objetivo aún no se ha puntuado, lo calcula al vuelo **sin**
   * generar alertas (una lectura de la UI no debe crear eventos).
   */
  async riesgoPorLinea(): Promise<RiesgoLinea[]> {
    const objetivo = this.turnoObjetivo();
    const guardadas = await this.predicciones.find({
      where: { fecha: objetivo.fecha, turnoObjetivo: objetivo.turno, origen: 'vivo' },
    });
    if (!guardadas.length) {
      /* Una lectura de la UI no puede crear eventos ni filas: se puntúa al
       * vuelo y se descarta; el cron es quien escribe. */
      const ciclo = await this.ejecutarCiclo({ generarAlertas: false, persistir: false });
      return ciclo.riesgos;
    }
    const lineas = await this.lineas.find({ where: { estado: 'activo' } });
    const porId = new Map(lineas.map((l) => [l.id, l]));
    const ventana = `${objetivo.inicio.slice(11, 16)}–${objetivo.fin.slice(11, 16)}`;
    return guardadas
      .map((p) => {
        const linea = porId.get(p.lineaId ?? '');
        return {
          lineaId: p.lineaId ?? '',
          lineaCodigo: p.lineaCodigo,
          lineaNombre: linea?.nombre ?? p.lineaCodigo,
          riesgo: Math.round(p.probabilidad),
          turnoObjetivo: objetivo.turno,
          causaProbable: p.prediccion.split(' · ')[1] ?? 'Sin causa dominante registrada',
          ventana,
        };
      })
      .sort((a, b) => b.riesgo - a.riesgo);
  }

  /**
   * Señal que el motor de alertas evalúa contra `umbrales`. Los valores vienen
   * del turno anterior (es lo único conocido antes de que el objetivo arranque),
   * de modo que las reglas deterministas de velocidad y OEE siguen operando
   * igual que antes sin duplicar lógica de umbrales en analítica.
   */
  private senal(linea: Linea, turno: Turno, features: Record<string, number>): SenalLinea {
    const estandar = features.velocidadEstandarUnidMin || linea.capacidadUnidadesMin;
    const desvio = features.desvioVelocidadTurnoPrevio ?? 0;
    return {
      lineaId: linea.id,
      lineaCodigo: linea.codigo,
      lineaNombre: linea.nombre,
      turno,
      velocidadReal: estandar * (1 + desvio / 100),
      velocidadEstandar: estandar,
      oeeActual: features.oeeTurnoPrevio ?? 0,
      eventos7d: Math.round(features.paradasImprev7d ?? 0),
      eventos30d: Math.round(features.paradasImprev30d ?? 0),
      minutosDesdeCambio: 0,
    };
  }

  /**
   * Tabla de frecuencias `P(causa | línea, turno)` con suavizado de Laplace: la
   * causa probable que se muestra en la UI sale de las paradas realmente
   * registradas, no de un literal. La clave `*` es el respaldo global para una
   * línea sin historia propia.
   */
  private async tablaDeCausas(
    turno: Turno,
  ): Promise<Map<string, { texto: string; probabilidad: number }>> {
    const [paradas, ordenes, causas] = await Promise.all([
      this.paradas.find(),
      this.ordenes.find(),
      this.causas.find(),
    ]);
    const turnoPorOrden = new Map(ordenes.map((o) => [o.id, o.turno]));
    const causaPorId = new Map(causas.map((c) => [c.id, c]));

    const conteo = new Map<string, Map<string, number>>();
    for (const p of paradas) {
      if (turnoPorOrden.get(p.ordenId) !== turno) continue;
      const tipo = causaPorId.get(p.tipoCausaId);
      if (!p.afectaOee || tipo?.clasificacion !== 'imprevista') continue;
      for (const clave of [p.lineaId, '*']) {
        const fila = conteo.get(clave) ?? new Map<string, number>();
        fila.set(p.causaId, (fila.get(p.causaId) ?? 0) + p.duracionMin);
        conteo.set(clave, fila);
      }
    }

    const salida = new Map<string, { texto: string; probabilidad: number }>();
    for (const [clave, fila] of conteo) {
      const universo = fila.size;
      const total = [...fila.values()].reduce((a, b) => a + b, 0) + ALFA_LAPLACE * universo;
      const mejor = [...fila.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!mejor || total <= 0) continue;
      const causa = causaPorId.get(mejor[0]);
      salida.set(clave, {
        texto: causa ? `${causa.codigo} ${causa.nombre}` : mejor[0],
        probabilidad: (mejor[1] + ALFA_LAPLACE) / total,
      });
    }
    return salida;
  }

  /** Resultado observado por turno, para cerrar el backtest de las predicciones vivas. */
  async observados(): Promise<Map<string, { ocurrio: boolean; minutos: number }>> {
    const { muestras } = await this.dataset.construir();
    const salida = new Map<string, { ocurrio: boolean; minutos: number }>();
    for (const m of muestras) {
      if (m.modo !== 'anticipado') continue;
      salida.set(`${m.lineaId}|${m.fecha}|${m.turno}`, {
        ocurrio: m.huboParadaImprevista === 1,
        minutos: m.minutosImprevistos,
      });
    }
    return salida;
  }
}
