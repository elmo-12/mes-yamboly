import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AlertaLinea,
  EstadoLinea,
  LineaEstado,
  LineaTimeline,
  TiempoRealResumen,
  TimelineEvento,
  TvResumen,
  TvRow,
} from '@mes/types';
import { ESTADO_LINEA_LABEL } from '@mes/types';
import { turnoInfo, turnoPorFecha, turnoRango } from '@mes/shared';
import { NoEncontradoException } from '../../common/exceptions/business.exception';
import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { ALERTS_LOOKUP, type AlertsLookup } from '../../common/services/alerts-lookup';
import {
  ahoraIso,
  diaOperativo,
  hoyIso,
  minutosEntreIso,
  redondear,
  toList,
} from '../../common/utils/query';
import {
  DeteccionIoT,
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';

interface ContextoLinea {
  orden: OrdenFabricacion | null;
  ordenEnCurso: OrdenFabricacion | null;
  paradaAbierta: Parada | null;
  ultimaParada: Parada | null;
  deteccion: DeteccionIoT | null;
  alerta: AlertaLinea | null;
  ultimaVelocidad: RegistroVelocidad | null;
}

@Injectable()
export class RealtimeService {
  constructor(
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(RegistroVelocidad) private readonly velocidades: Repository<RegistroVelocidad>,
    @InjectRepository(DeteccionIoT) private readonly detecciones: Repository<DeteccionIoT>,
    private readonly lookups: LookupsService,
    @Inject(ALERTS_LOOKUP) private readonly alerts: AlertsLookup,
  ) {}

  async resumen(
    sedeId = 'SED-LIMA',
    lineaIds: string[] = [],
    estados: string[] = [],
  ): Promise<TiempoRealResumen> {
    const lookups = await this.lookups.load();
    const ahora = new Date();
    const turno = turnoPorFecha(ahora);

    let lineas = [...lookups.lineas.values()]
      .filter((l) => l.sedeId === sedeId)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (lineaIds.length > 0) lineas = lineas.filter((l) => lineaIds.includes(l.id));

    const dia = await this.diaOperativoActual();
    const ahoraOp = await this.ahoraOperativo(dia);
    const estadoLineas: LineaEstado[] = [];
    for (const linea of lineas) {
      estadoLineas.push(await this.estadoDeLinea(linea.id, lookups, dia, ahoraOp));
    }

    return {
      actualizadoEn: ahoraIso(ahora),
      diaOperativo: dia,
      turno,
      turnoLabel: turnoInfo(turno).label,
      turnoRango: turnoRango(turno),
      sedeId,
      lineas:
        estados.length > 0 ? estadoLineas.filter((l) => estados.includes(l.estado)) : estadoLineas,
    };
  }

  async tv(): Promise<TvResumen> {
    const base = await this.resumen();
    const filas: TvRow[] = base.lineas.map((l) => ({
      lineaId: l.lineaId,
      lineaCodigo: l.lineaCodigo,
      lineaNombre: l.lineaNombre,
      estado: l.estado,
      estadoLabel: ESTADO_LINEA_LABEL[l.estado],
      producido: l.producido,
      plan: l.plan,
      avancePct: l.plan > 0 ? redondear((l.producido / l.plan) * 100) : 0,
      velocidad: l.velocidad,
      velocidadEstandar: l.velocidadEstandar,
      tiempoEnEstadoMin: l.tiempoEnEstadoMin,
      detalle: l.ultimaParada
        ? `${l.ultimaParada.causaCodigo} ${l.ultimaParada.causaNombre}`
        : l.alerta?.texto,
    }));
    return { actualizadoEn: base.actualizadoEn, turnoLabel: base.turnoLabel, filas };
  }

  async timeline(lineaId: string): Promise<LineaTimeline> {
    const lookups = await this.lookups.load();
    const linea = lookups.lineas.get(lineaId);
    if (!linea) throw new NoEncontradoException('Línea');

    const dia = await this.diaOperativoActual();
    const contexto = await this.contexto(lineaId, lookups, dia);
    const eventos: TimelineEvento[] = [];
    const orden = contexto.orden;

    if (orden) {
      const producto = lookups.productos.get(orden.productoId);
      eventos.push({
        id: `EV-${orden.id}-inicio`,
        hora: orden.inicio.slice(11, 16),
        tipo: 'inicio_of',
        titulo: `Inicio ${orden.codigo}`,
        detalle: `${producto?.nombre ?? ''} · ${orden.planificado} unidades planificadas`,
      });

      for (const parada of await this.paradas.find({ where: { ordenId: orden.id } })) {
        const causa = lookups.causasParada.get(parada.causaId);
        const tipo = lookups.causasParada.get(parada.tipoCausaId);
        eventos.push({
          id: `EV-${parada.id}`,
          hora: parada.inicio.slice(11, 16),
          tipo: 'parada',
          titulo: `Parada ${tipo?.codigo ?? causa?.codigo ?? ''}`,
          detalle: `${causa?.codigo ?? ''} ${causa?.nombre ?? ''} · ${parada.accionTomada}`,
          duracionMin: parada.duracionMin,
        });
      }

      for (const velocidad of await this.velocidades.find({ where: { ordenId: orden.id } })) {
        eventos.push({
          id: `EV-${velocidad.id}`,
          hora: velocidad.registradaEn.slice(11, 16),
          tipo: 'velocidad',
          titulo: `Velocidad ${velocidad.velocidadReal}`,
          detalle: `Estándar ${velocidad.velocidadEstandar} u/min · desvío ${velocidad.desvioPct} %`,
        });
      }

      for (const merma of await this.mermas.find({ where: { ordenId: orden.id } })) {
        const causa = lookups.causasMerma.get(merma.causaId);
        eventos.push({
          id: `EV-${merma.id}`,
          hora: merma.registradaEn.slice(11, 16),
          tipo: 'merma',
          titulo: `Merma ${merma.tipo} ${merma.cantidadKg} kg`,
          detalle: `${causa?.codigo ?? ''} ${causa?.nombre ?? ''} · ${merma.sabor}`,
        });
      }

      if (orden.fin) {
        eventos.push({
          id: `EV-${orden.id}-fin`,
          hora: orden.fin.slice(11, 16),
          tipo: 'fin_of',
          titulo: `Cierre ${orden.codigo}`,
          detalle: `${orden.producido} unidades · OEE ${orden.oee.oee} %`,
        });
      }
    }

    if (contexto.alerta) {
      /* La alerta se ubica por su `generadaEn`, no por el reloj del servidor:
       * con el reloj real una consulta de madrugada colocaba la alerta antes
       * del `inicio_of` de la orden del día operativo. */
      eventos.push({
        id: `EV-${contexto.alerta.id}`,
        hora: contexto.alerta.generadaEn.slice(11, 16),
        tipo: 'alerta',
        titulo: `Alerta · ${contexto.alerta.riesgo} %`,
        detalle: contexto.alerta.texto,
      });
    }

    eventos.sort((a, b) => a.hora.localeCompare(b.hora));
    return {
      lineaId,
      lineaCodigo: linea.codigo,
      lineaNombre: linea.nombre,
      ordenCodigo: orden?.codigo,
      eventos,
    };
  }

  /**
   * Fecha (`YYYY-MM-DD`) que este módulo trata como "hoy" al elegir la orden
   * vigente de cada línea. Ver {@link diaOperativo} para la regla completa:
   * evita que el estado de las líneas se congele en `sin_orden` cuando el
   * reloj real del servidor ya no coincide con el `HOY` fijo de los seeds.
   */
  private async diaOperativoActual(): Promise<string> {
    const ordenes = await this.ordenes.find({ select: { fecha: true, estado: true } });
    return diaOperativo(ordenes);
  }

  /**
   * "Ahora" del día operativo: la referencia con la que se miden los minutos
   * en estado y la duración de las paradas abiertas. Cuando el día operativo
   * es el día real se usa el reloj; cuando el juego de datos está congelado en
   * una fecha anterior se usa la última marca registrada en ese día, para que
   * una parada abierta a las 13:47 del 28-ago no se muestre con miles de
   * minutos por la distancia hasta el reloj real.
   */
  private async ahoraOperativo(dia: string): Promise<string> {
    if (dia === hoyIso()) return ahoraIso();
    const delDia = (iso: string | null): iso is string => iso !== null && iso.startsWith(dia);
    const marcas: string[] = [];
    for (const orden of await this.ordenes.find()) {
      if (orden.fecha !== dia) continue;
      if (delDia(orden.inicio)) marcas.push(orden.inicio);
      if (delDia(orden.fin)) marcas.push(orden.fin);
    }
    for (const parada of await this.paradas.find()) {
      if (delDia(parada.inicio)) marcas.push(parada.inicio);
      if (delDia(parada.fin)) marcas.push(parada.fin);
    }
    for (const deteccion of await this.detecciones.find()) {
      if (delDia(deteccion.detectadaEn)) marcas.push(deteccion.detectadaEn);
    }
    return marcas.reduce((max, m) => (m > max ? m : max), `${dia}T00:00:00`);
  }

  /** Reúne los registros vivos que determinan el estado de una línea. */
  private async contexto(lineaId: string, lookups: Lookups, dia: string): Promise<ContextoLinea> {
    const delDia = (await this.ordenes.find({ where: { lineaId } }))
      .filter((o) => o.fecha === dia)
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ordenEnCurso = delDia.find((o) => o.estado === 'en_curso') ?? null;
    const orden = ordenEnCurso ?? delDia[0] ?? null;

    const paradasLinea = orden
      ? (await this.paradas.find({ where: { ordenId: orden.id } })).sort((a, b) =>
          b.inicio.localeCompare(a.inicio),
        )
      : [];
    const paradaAbierta = paradasLinea.find((p) => p.fin === null) ?? null;

    const deteccion =
      (await this.detecciones.find({ where: { lineaId, estado: 'sugerida' } })).sort((a, b) =>
        b.detectadaEn.localeCompare(a.detectadaEn),
      )[0] ?? null;

    const alerta = (await this.alerts.activasPorLinea()).get(lineaId) ?? null;

    const ultimaVelocidad = orden
      ? ((await this.velocidades.find({ where: { ordenId: orden.id } })).sort((a, b) =>
          b.registradaEn.localeCompare(a.registradaEn),
        )[0] ?? null)
      : null;

    void lookups;
    return {
      orden,
      ordenEnCurso,
      paradaAbierta,
      ultimaParada: paradasLinea[0] ?? null,
      deteccion,
      alerta,
      ultimaVelocidad,
    };
  }

  private async estadoDeLinea(
    lineaId: string,
    lookups: Lookups,
    dia: string,
    ahora: string,
  ): Promise<LineaEstado> {
    const linea = lookups.lineas.get(lineaId)!;
    const ctx = await this.contexto(lineaId, lookups, dia);

    /* Prioridad: parada abierta → detección sugerida → sin orden → alerta → produciendo. */
    let estado: EstadoLinea;
    let desde: string;
    if (ctx.paradaAbierta) {
      estado = 'parada';
      desde = ctx.paradaAbierta.inicio;
    } else if (ctx.deteccion) {
      estado = 'sugerida';
      desde = ctx.deteccion.detectadaEn;
    } else if (!ctx.ordenEnCurso) {
      estado = 'sin_orden';
      desde = ctx.orden?.fin ?? ctx.orden?.inicio ?? ahora;
    } else if (ctx.alerta) {
      estado = 'alerta';
      desde = ctx.ordenEnCurso.inicio;
    } else {
      estado = 'produciendo';
      desde = ctx.ordenEnCurso.inicio;
    }

    const orden = ctx.orden;
    const producto = orden ? lookups.productos.get(orden.productoId) : undefined;
    /* Estándar: el congelado en la orden → el par vigente → la capacidad de la línea. */
    const parVigente = orden
      ? LookupsService.parActivo(lookups, orden.productoId, orden.lineaId)
      : undefined;
    const velocidadEstandar =
      orden?.velocidadEstandar ||
      parVigente?.velocidadUnidMin ||
      linea.capacidadUnidadesMin;
    const detenida = estado === 'parada' || estado === 'sugerida' || estado === 'sin_orden';

    const maquinista = orden
      ? lookups.usuarios.get(orden.maquinistaId)
      : [...lookups.usuarios.values()].find((u) => u.lineaId === lineaId);

    const causaUltima = ctx.ultimaParada
      ? lookups.causasParada.get(ctx.ultimaParada.causaId)
      : undefined;

    return {
      lineaId,
      lineaCodigo: linea.codigo,
      lineaNombre: linea.nombre,
      estado,
      orden: orden
        ? {
            id: orden.id,
            codigo: orden.codigo,
            productoNombre: producto?.nombre ?? '—',
            turno: orden.turno,
          }
        : undefined,
      producido: orden?.producido ?? 0,
      plan: orden?.planificado ?? 0,
      velocidad: detenida ? 0 : (ctx.ultimaVelocidad?.velocidadReal ?? velocidadEstandar),
      velocidadEstandar,
      tiempoEnEstadoMin: minutosEntreIso(desde, ahora),
      ultimaParada:
        ctx.ultimaParada && causaUltima
          ? {
              causaCodigo: causaUltima.codigo,
              causaNombre: causaUltima.nombre,
              inicio: ctx.ultimaParada.inicio,
              duracionMin: ctx.ultimaParada.fin
                ? ctx.ultimaParada.duracionMin
                : minutosEntreIso(ctx.ultimaParada.inicio, ahora),
              enCurso: ctx.ultimaParada.fin === null,
            }
          : undefined,
      alerta: ctx.alerta ?? undefined,
      deteccion: ctx.deteccion
        ? {
            ...ctx.deteccion,
            maquinaId: ctx.deteccion.maquinaId ?? undefined,
            paradaId: ctx.deteccion.paradaId ?? undefined,
          }
        : undefined,
      maquinistaNombre: maquinista?.nombre,
    };
  }

  /** Helper para el filtro `?estado=` del controlador. */
  static listaEstados(valor: string | string[] | undefined): string[] {
    return toList(valor);
  }
}
