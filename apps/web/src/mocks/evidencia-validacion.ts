import { METAS_TESIS, calcTci, esRegistroValidoTci, estadoTci } from '@mes/shared';
import { CRITERIO_TCI_LABEL, TIPOS_REGISTRO_TCI } from '@mes/types';
import type {
  ClaveCriterioTci,
  CriterioTCI,
  EstadoLecturaSensor,
  EvaluacionTCI,
  EvidenciaTCI,
  ResumenPorTipoTCI,
  ResumenTCI,
  TipoRegistroTci,
  Turno,
} from '@mes/types';
import type { EvaluacionCalidadMock, SolicitudExternaMock, TransferenciaSapMock } from './store';
import { getStore } from './store';
import { fechaCorta } from './evidencia-tabla';
import { resumenFuentes, ultimaImportacion } from './evidencia-fuentes';

/**
 * Motor de validación de la calidad de la información (Anexo 03) del modo mock.
 * Espejo literal de `evidence.rules.ts` + `EvidenceValidationService` de la API:
 * mismos criterios, mismas tolerancias, mismos textos de detalle y la misma
 * forma de conservar los overrides entre corridas.
 *
 * Criterios por tipo de registro:
 * - **parada** → `completo` · `sensor` · `solicitud`
 * - **merma** → `completo` · `sap` · `solicitud`
 * - **velocidad** → `completo` · `sensor`
 */

/** Tolerancias configurables en Configuración › Umbrales › Validación de calidad. */
export interface ToleranciasTci {
  minutos: number;
  pct: number;
  diasSap: number;
}

export const TOLERANCIAS_POR_DEFECTO: ToleranciasTci = { minutos: 5, pct: 5, diasSap: 1 };

/** Tramo continuo de una línea en un mismo estado, derivado de las lecturas. */
export interface TramoSensor {
  estado: EstadoLecturaSensor;
  desde: string;
  hasta: string;
  /** `true` cuando no hay lectura posterior: el fin del tramo se desconoce. */
  abierto: boolean;
}

export interface LecturaSensorPlana {
  fechaHora: string;
  estado: EstadoLecturaSensor;
  velocidadUnidMin: number | null;
}

/** Criterios que evalúa cada tipo de registro, en el orden de la ficha. */
export const CRITERIOS_POR_TIPO: Record<TipoRegistroTci, ClaveCriterioTci[]> = {
  parada: ['completo', 'sensor', 'solicitud'],
  merma: ['completo', 'sap', 'solicitud'],
  velocidad: ['completo', 'sensor'],
};

/* ------------------------------------------------------------------ */
/* Utilidades de tiempo y formato                                      */
/* ------------------------------------------------------------------ */

/** `2026-08-28T07:42:00` → `07:42`. */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** Minutos entre dos ISO (con signo: positivo si `b` es posterior a `a`). */
export function minutosEntre(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/** Días completos entre dos fechas `YYYY-MM-DD` (con signo). */
export function diasEntre(a: string, b: string): number {
  const ms =
    new Date(`${b.slice(0, 10)}T00:00:00`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00`).getTime();
  return Math.round(ms / 86400000);
}

/** Número con coma decimal, sin separador de miles: `3.2` → `3,2`. */
export function num(valor: number, decimales = 1): string {
  return valor.toFixed(decimales).replace('.', ',');
}

/** Turno real de una marca de tiempo: `D` (06:00–17:59) y `N` (18:00–05:59). */
export function turnoDe(iso: string): Turno {
  const hora = Number(iso.slice(11, 13));
  return hora >= 6 && hora < 18 ? 'D' : 'N';
}

/* ------------------------------------------------------------------ */
/* Tramos de sensor                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convierte las lecturas puntuales de una línea en tramos continuos: cada tramo
 * va desde una lectura hasta la siguiente y las lecturas consecutivas con el
 * mismo estado se fusionan.
 */
export function construirTramos(lecturas: LecturaSensorPlana[]): TramoSensor[] {
  const ordenadas = [...lecturas].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  const tramos: TramoSensor[] = [];
  for (let i = 0; i < ordenadas.length; i += 1) {
    const actual = ordenadas[i]!;
    const anterior = tramos[tramos.length - 1];
    if (anterior && anterior.estado === actual.estado) {
      anterior.hasta = actual.fechaHora;
      anterior.abierto = true;
      continue;
    }
    if (anterior) {
      anterior.hasta = actual.fechaHora;
      anterior.abierto = false;
    }
    tramos.push({ estado: actual.estado, desde: actual.fechaHora, hasta: actual.fechaHora, abierto: true });
  }
  return tramos;
}

function criterio(clave: ClaveCriterioTci, cumple: boolean, detalle: string): CriterioTCI {
  return { clave, label: CRITERIO_TCI_LABEL[clave], cumple, detalle };
}

/* ------------------------------------------------------------------ */
/* Criterio «completo»                                                 */
/* ------------------------------------------------------------------ */

/** Campos obligatorios presentes; el detalle nombra exactamente lo que falta. */
export function criterioCompleto(campos: [string, boolean][]): CriterioTCI {
  const faltantes = campos.filter(([, presente]) => !presente).map(([etiqueta]) => etiqueta);
  return criterio(
    'completo',
    faltantes.length === 0,
    faltantes.length === 0
      ? `Los ${campos.length} campos obligatorios están completos`
      : `Faltan ${faltantes.length} campos obligatorios: ${faltantes.join(', ')}`
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sensor» — paradas                                         */
/* ------------------------------------------------------------------ */

export interface ParadaValidable {
  inicio: string;
  fin: string | null;
  lineaCodigo: string;
}

/**
 * Los tiempos de la parada coinciden con un tramo PARADA del sensor de la línea
 * dentro de ±`tolerancia.minutos`.
 */
export function criterioSensorParada(
  parada: ParadaValidable,
  tramos: TramoSensor[],
  tolerancia: ToleranciasTci
): CriterioTCI {
  const candidatos = tramos.filter((t) => t.estado === 'PARADA');
  if (candidatos.length === 0) {
    return criterio(
      'sensor',
      false,
      `Sin lecturas de sensor de ${parada.lineaCodigo} para el ${fechaCorta(parada.inicio)}`
    );
  }

  const mejor = candidatos.reduce((a, b) =>
    Math.abs(minutosEntre(a.desde, parada.inicio)) <= Math.abs(minutosEntre(b.desde, parada.inicio)) ? a : b
  );
  const deltaInicio = minutosEntre(mejor.desde, parada.inicio);
  const rangoSensor = mejor.abierto ? `${hhmm(mejor.desde)}–…` : `${hhmm(mejor.desde)}–${hhmm(mejor.hasta)}`;
  const rangoRegistro = parada.fin ? `${hhmm(parada.inicio)}–${hhmm(parada.fin)}` : `${hhmm(parada.inicio)}–…`;

  if (Math.abs(deltaInicio) > tolerancia.minutos) {
    return criterio(
      'sensor',
      false,
      `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ inicio ${num(Math.abs(deltaInicio), 0)} min > ${num(tolerancia.minutos, 0)} min)`
    );
  }

  if (parada.fin && !mejor.abierto) {
    const deltaFin = minutosEntre(mejor.hasta, parada.fin);
    if (Math.abs(deltaFin) > tolerancia.minutos) {
      return criterio(
        'sensor',
        false,
        `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ fin ${num(Math.abs(deltaFin), 0)} min > ${num(tolerancia.minutos, 0)} min)`
      );
    }
  }

  return criterio(
    'sensor',
    true,
    `Sensor: parada detectada ${rangoSensor}, registro ${rangoRegistro} (Δ inicio ${num(Math.abs(deltaInicio), 0)} min)`
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sensor» — velocidades                                     */
/* ------------------------------------------------------------------ */

/**
 * La velocidad registrada difiere ≤ `tolerancia.pct` de la lectura de sensor
 * más cercana (±`tolerancia.minutos`) de esa línea.
 */
export function criterioSensorVelocidad(
  registro: { registradaEn: string; velocidadReal: number; lineaCodigo: string },
  lecturas: LecturaSensorPlana[],
  tolerancia: ToleranciasTci
): CriterioTCI {
  const conVelocidad = lecturas.filter(
    (l) =>
      l.velocidadUnidMin !== null &&
      l.velocidadUnidMin > 0 &&
      Math.abs(minutosEntre(l.fechaHora, registro.registradaEn)) <= tolerancia.minutos
  );
  if (conVelocidad.length === 0) {
    return criterio(
      'sensor',
      false,
      `Sin lecturas de velocidad de ${registro.lineaCodigo} entre las ${hhmm(registro.registradaEn)} ± ${num(tolerancia.minutos, 0)} min`
    );
  }

  const cercana = conVelocidad.reduce((a, b) =>
    Math.abs(minutosEntre(a.fechaHora, registro.registradaEn)) <=
    Math.abs(minutosEntre(b.fechaHora, registro.registradaEn))
      ? a
      : b
  );
  const sensor = cercana.velocidadUnidMin!;
  const desvioPct = Math.abs((registro.velocidadReal - sensor) / sensor) * 100;
  const base = `Sensor ${hhmm(cercana.fechaHora)}: ${num(sensor)} u/min vs ${num(registro.velocidadReal)} u/min registradas (Δ ${num(desvioPct)} %)`;
  return desvioPct <= tolerancia.pct
    ? criterio('sensor', true, base)
    : criterio('sensor', false, `${base} — supera el ${num(tolerancia.pct, 0)} %`);
}

/* ------------------------------------------------------------------ */
/* Criterio «solicitud»                                                */
/* ------------------------------------------------------------------ */

export interface SolicitudEncontrada {
  numero: string;
  fecha: string;
}

/**
 * Si la causa exige n.º de solicitud, ese número debe existir en la
 * importación de solicitudes. Si no lo exige pero el registro trae uno, el
 * número se verifica igual: un dato anotado a mano también debe ser trazable.
 * Sólo cuando la causa no lo exige y el registro no lo trae se da por cumplido.
 */
export function criterioSolicitud(
  requiere: boolean,
  causaCodigo: string,
  numero: string | null,
  encontrada: SolicitudEncontrada | null,
  fechaUltimaImportacion: string | null
): CriterioTCI {
  if (!requiere && !numero) {
    return criterio('solicitud', true, `La causa ${causaCodigo} no exige n.º de solicitud`);
  }
  if (!numero) {
    return criterio(
      'solicitud',
      false,
      `La causa ${causaCodigo} exige n.º de solicitud y el registro no lo tiene`
    );
  }
  if (!encontrada) {
    const donde = fechaUltimaImportacion
      ? `en la importación del ${fechaCorta(fechaUltimaImportacion)}`
      : 'porque aún no se importó ninguna solicitud';
    return criterio('solicitud', false, `Solicitud ${numero} no encontrada ${donde}`);
  }
  /* Un número anotado sin que la causa lo exija sigue siendo trazable: se
     verifica igual, pero el detalle debe decir por qué se comprobó. */
  return criterio(
    'solicitud',
    true,
    requiere
      ? `Solicitud ${encontrada.numero} registrada el ${fechaCorta(encontrada.fecha)}`
      : `Solicitud ${encontrada.numero} verificada aunque la causa ${causaCodigo} no la exige (registrada el ${fechaCorta(encontrada.fecha)})`
  );
}

/* ------------------------------------------------------------------ */
/* Criterio «sap» — mermas                                             */
/* ------------------------------------------------------------------ */

export interface TransferenciaSapPlana {
  documento: string;
  fecha: string;
  productoCodigo: string;
  cantidadKg: number;
}

/**
 * Existe una transferencia SAP de la misma línea y producto, con fecha dentro
 * de ±`tolerancia.diasSap` y kilos dentro de ±`tolerancia.pct`.
 */
export function criterioSapMerma(
  merma: { fecha: string; cantidadKg: number; lineaCodigo: string },
  productoCodigo: string | null,
  candidatas: TransferenciaSapPlana[],
  tolerancia: ToleranciasTci
): CriterioTCI {
  if (!productoCodigo) {
    return criterio('sap', false, 'La orden de la merma no tiene producto con código SAP');
  }

  const delProducto = candidatas.filter(
    (t) =>
      t.productoCodigo === productoCodigo &&
      Math.abs(diasEntre(t.fecha, merma.fecha)) <= tolerancia.diasSap
  );
  if (delProducto.length === 0) {
    return criterio(
      'sap',
      false,
      `Sin transferencia SAP del producto ${productoCodigo} en ${merma.lineaCodigo} para el ${fechaCorta(merma.fecha)} (± ${tolerancia.diasSap} día${tolerancia.diasSap === 1 ? '' : 's'})`
    );
  }

  const desvio = (t: TransferenciaSapPlana): number =>
    merma.cantidadKg > 0 ? Math.abs((t.cantidadKg - merma.cantidadKg) / merma.cantidadKg) * 100 : 100;
  const mejor = delProducto.reduce((a, b) => (desvio(a) <= desvio(b) ? a : b));
  const delta = desvio(mejor);

  return delta <= tolerancia.pct
    ? criterio('sap', true, `SAP: doc ${mejor.documento} ${num(mejor.cantidadKg)} kg (Δ ${num(delta)} %)`)
    : criterio(
        'sap',
        false,
        `SAP: doc ${mejor.documento} ${num(mejor.cantidadKg)} kg vs ${num(merma.cantidadKg)} kg registrados (Δ ${num(delta)} % > ${num(tolerancia.pct, 0)} %)`
      );
}

/* ------------------------------------------------------------------ */
/* Overrides y resultado                                               */
/* ------------------------------------------------------------------ */

/**
 * Aplica los valores forzados a mano desde 09.C. El detalle de la regla se
 * conserva y se antepone la marca del override para que la ficha lo explique.
 */
export function aplicarOverrides(
  criterios: CriterioTCI[],
  overrides: Partial<Record<ClaveCriterioTci, boolean>> | null
): CriterioTCI[] {
  if (!overrides) return criterios;
  return criterios.map((c) => {
    const forzado = overrides[c.clave];
    if (forzado === undefined) return c;
    return {
      ...c,
      cumple: forzado,
      override: forzado,
      detalle: `Override manual (${forzado ? 'válido' : 'inválido'}) · ${c.detalle}`,
    };
  });
}

/** Un registro es válido si todos los criterios de su tipo se cumplen. */
export function esValido(criterios: CriterioTCI[]): boolean {
  return esRegistroValidoTci(criterios);
}

/* ------------------------------------------------------------------ */
/* Corrida del motor                                                   */
/* ------------------------------------------------------------------ */

interface ContextoValidacion {
  lecturasPorLinea: Map<string, LecturaSensorPlana[]>;
  tramosPorLinea: Map<string, TramoSensor[]>;
  /** N.º de solicitud en mayúsculas → solicitud importada. */
  solicitudes: Map<string, SolicitudExternaMock>;
  sapPorLinea: Map<string, TransferenciaSapMock[]>;
  /** ISO de la última importación de solicitudes, para el motivo del rechazo. */
  fechaImportacionSolicitudes: string | null;
}

function cargarFuentes(): ContextoValidacion {
  const { fuentes } = getStore();

  const porLinea = new Map<string, LecturaSensorPlana[]>();
  for (const l of fuentes.lecturasSensor) {
    const lista = porLinea.get(l.lineaId) ?? [];
    lista.push({ fechaHora: l.fechaHora, estado: l.estado, velocidadUnidMin: l.velocidadUnidMin });
    porLinea.set(l.lineaId, lista);
  }
  const tramosPorLinea = new Map<string, TramoSensor[]>();
  for (const [lineaId, lista] of porLinea) tramosPorLinea.set(lineaId, construirTramos(lista));

  const sapPorLinea = new Map<string, TransferenciaSapMock[]>();
  for (const t of fuentes.transferenciasSap) {
    const lista = sapPorLinea.get(t.lineaId) ?? [];
    lista.push(t);
    sapPorLinea.set(t.lineaId, lista);
  }

  return {
    lecturasPorLinea: porLinea,
    tramosPorLinea,
    solicitudes: new Map(fuentes.solicitudes.map((s) => [s.numero.trim().toUpperCase(), s])),
    sapPorLinea,
    fechaImportacionSolicitudes: ultimaImportacion('solicitudes')?.fecha ?? null,
  };
}

/** Tolerancias vigentes en `Umbrales`. */
export function tolerancias(): ToleranciasTci {
  const u = getStore().umbrales;
  return {
    minutos: u.tciToleranciaMin ?? TOLERANCIAS_POR_DEFECTO.minutos,
    pct: u.tciToleranciaPct ?? TOLERANCIAS_POR_DEFECTO.pct,
    diasSap: u.tciToleranciaDiasSap ?? TOLERANCIAS_POR_DEFECTO.diasSap,
  };
}

/** Primer día con una captura real del postest; hoy si aún no hay ninguna. */
export function primerDiaPostest(hoy: string): string {
  const fechas = getStore()
    .triPostest.map((r) => r.fecha)
    .sort();
  return fechas[0] ?? hoy;
}

function nuevaFila(
  datos: Omit<
    EvaluacionCalidadMock,
    'id' | 'n' | 'valido' | 'validadoEn' | 'desde' | 'hasta' | 'overrides' | 'observacion'
  >
): EvaluacionCalidadMock {
  return {
    ...datos,
    id: `TCI-${datos.registroId}`,
    n: 0,
    valido: false,
    validadoEn: '',
    desde: '',
    hasta: '',
    overrides: null,
    observacion: '',
  };
}

function evaluarParadas(
  desde: string,
  hasta: string,
  ctx: ContextoValidacion,
  tol: ToleranciasTci
): EvaluacionCalidadMock[] {
  const store = getStore();
  return store.paradas
    .filter((p) => p.inicio >= `${desde}T00:00:00` && p.inicio <= `${hasta}T23:59:59`)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((p) => {
      const linea = store.lineas.find((l) => l.id === p.lineaId);
      const causa = store.causasParada.find((c) => c.id === p.causaId);
      const dia = p.inicio.slice(0, 10);
      const lineaCodigo = linea?.codigo ?? p.lineaId;

      const completo = criterioCompleto([
        ['orden', Boolean(p.ordenId)],
        ['línea', Boolean(p.lineaId)],
        ['causa de último nivel', causa?.nivel === 'especifica'],
        ['acción tomada', (p.accionTomada ?? '').trim().length > 0],
        ['responsable', Boolean(p.responsableId)],
        ['duración mayor que 0', p.duracionMin > 0],
      ]);

      const tramosDelDia = (ctx.tramosPorLinea.get(p.lineaId) ?? []).filter(
        (t) => t.desde.slice(0, 10) === dia || t.hasta.slice(0, 10) === dia
      );
      const sensor = criterioSensorParada({ inicio: p.inicio, fin: p.fin, lineaCodigo }, tramosDelDia, tol);

      const numero = p.numeroSolicitud?.trim() || null;
      const encontrada = numero ? (ctx.solicitudes.get(numero.toUpperCase()) ?? null) : null;
      const solicitud = criterioSolicitud(
        Boolean(causa?.requiereSolicitud),
        causa?.codigo ?? p.causaId,
        numero,
        encontrada,
        ctx.fechaImportacionSolicitudes
      );

      const rango = p.fin
        ? `${p.inicio.slice(11, 16)}–${p.fin.slice(11, 16)}`
        : `${p.inicio.slice(11, 16)}–abierta`;
      return nuevaFila({
        registroId: p.id,
        tipoRegistro: 'parada',
        fecha: dia,
        turno: turnoDe(p.inicio),
        lineaId: p.lineaId,
        lineaCodigo,
        referencia: `${rango} · ${causa?.codigo ?? p.causaId} · ${p.duracionMin} min`,
        criterios: [completo, sensor, solicitud],
      });
    });
}

function evaluarMermas(
  desde: string,
  hasta: string,
  ctx: ContextoValidacion,
  tol: ToleranciasTci
): EvaluacionCalidadMock[] {
  const store = getStore();
  return store.mermas
    .filter((m) => m.registradaEn >= `${desde}T00:00:00` && m.registradaEn <= `${hasta}T23:59:59`)
    .sort((a, b) => a.registradaEn.localeCompare(b.registradaEn))
    .map((m) => {
      const linea = store.lineas.find((l) => l.id === m.lineaId);
      const causa = store.causasMerma.find((c) => c.id === m.causaId);
      const dia = m.registradaEn.slice(0, 10);
      const lineaCodigo = linea?.codigo ?? m.lineaId;
      const orden = store.ordenes.find((o) => o.id === m.ordenId);
      const productoCodigo = orden
        ? (store.productos.find((p) => p.id === orden.productoId)?.codigo ?? null)
        : null;

      const completo = criterioCompleto([
        ['orden', Boolean(m.ordenId)],
        ['línea', Boolean(m.lineaId)],
        ['tipo de merma', Boolean(m.tipo)],
        ['causa de último nivel', causa?.nivel === 'causa'],
        ['cantidad mayor que 0', m.cantidadKg > 0],
        ['responsable', Boolean(m.responsableId)],
        ...(causa?.requiereComentario
          ? ([['observación', (m.observacion ?? '').trim().length > 0]] as [string, boolean][])
          : []),
      ]);

      const sap = criterioSapMerma(
        { fecha: dia, cantidadKg: m.cantidadKg, lineaCodigo },
        productoCodigo,
        ctx.sapPorLinea.get(m.lineaId) ?? [],
        tol
      );

      const numero = m.numeroSolicitud?.trim() || null;
      const encontrada = numero ? (ctx.solicitudes.get(numero.toUpperCase()) ?? null) : null;
      const solicitud = criterioSolicitud(
        Boolean(causa?.requiereSolicitud),
        causa?.codigo ?? m.causaId,
        numero,
        encontrada,
        ctx.fechaImportacionSolicitudes
      );

      return nuevaFila({
        registroId: m.id,
        tipoRegistro: 'merma',
        fecha: dia,
        turno: turnoDe(m.registradaEn),
        lineaId: m.lineaId,
        lineaCodigo,
        referencia: `${m.tipo} ${num(m.cantidadKg)} kg · ${causa?.codigo ?? m.causaId}`,
        criterios: [completo, sap, solicitud],
      });
    });
}

function evaluarVelocidades(
  desde: string,
  hasta: string,
  ctx: ContextoValidacion,
  tol: ToleranciasTci
): EvaluacionCalidadMock[] {
  const store = getStore();
  return store.velocidades
    .filter((v) => v.registradaEn >= `${desde}T00:00:00` && v.registradaEn <= `${hasta}T23:59:59`)
    .sort((a, b) => a.registradaEn.localeCompare(b.registradaEn))
    .map((v) => {
      const linea = store.lineas.find((l) => l.id === v.lineaId);
      const lineaCodigo = linea?.codigo ?? v.lineaId;

      const completo = criterioCompleto([
        ['orden', Boolean(v.ordenId)],
        ['línea', Boolean(v.lineaId)],
        ['velocidad real mayor que 0', v.velocidadReal > 0],
        ['velocidad estándar', v.velocidadEstandar > 0],
        ['responsable', Boolean(v.responsableId)],
      ]);

      const sensor = criterioSensorVelocidad(
        { registradaEn: v.registradaEn, velocidadReal: v.velocidadReal, lineaCodigo },
        ctx.lecturasPorLinea.get(v.lineaId) ?? [],
        tol
      );

      return nuevaFila({
        registroId: v.id,
        tipoRegistro: 'velocidad',
        fecha: v.registradaEn.slice(0, 10),
        turno: turnoDe(v.registradaEn),
        lineaId: v.lineaId,
        lineaCodigo,
        referencia: `${num(v.velocidadReal)} u/min (estándar ${num(v.velocidadEstandar)})`,
        criterios: [completo, sensor],
      });
    });
}

/** Renumera `n` por fecha e id para que la ficha del Anexo 03 sea estable. */
function renumerar(): void {
  const filas = getStore().evaluacionesTci;
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  filas.forEach((f, i) => {
    f.n = i + 1;
  });
}

/**
 * Reevalúa el rango indicado y reemplaza sus filas del Anexo 03, conservando
 * los overrides y la observación que el usuario haya puesto por registro.
 */
export function validarTci(input: {
  tipos?: TipoRegistroTci[];
  desde?: string;
  hasta?: string;
  hoy: string;
  validadoEn: string;
}): EvidenciaTCI {
  const store = getStore();
  const tipos = input.tipos?.length ? input.tipos : [...TIPOS_REGISTRO_TCI];
  const desde = input.desde ?? primerDiaPostest(input.hoy);
  const hasta = input.hasta ?? input.hoy;

  const tol = tolerancias();
  const ctx = cargarFuentes();
  const previas = store.evaluacionesTci;
  const overridesPrevios = new Map(previas.map((p) => [p.id, p.overrides]));
  const observacionesPrevias = new Map(previas.map((p) => [p.id, p.observacion]));

  const nuevas: EvaluacionCalidadMock[] = [];
  if (tipos.includes('parada')) nuevas.push(...evaluarParadas(desde, hasta, ctx, tol));
  if (tipos.includes('merma')) nuevas.push(...evaluarMermas(desde, hasta, ctx, tol));
  if (tipos.includes('velocidad')) nuevas.push(...evaluarVelocidades(desde, hasta, ctx, tol));

  for (const fila of nuevas) {
    fila.desde = desde;
    fila.hasta = hasta;
    fila.validadoEn = input.validadoEn;
    fila.overrides = overridesPrevios.get(fila.id) ?? null;
    fila.observacion = observacionesPrevias.get(fila.id) ?? '';
    fila.valido = esValido(aplicarOverrides(fila.criterios, fila.overrides));
  }

  /* Se reemplazan sólo las evaluaciones del rango y de los tipos pedidos. */
  const conservadas = previas.filter(
    (p) => !(tipos.includes(p.tipoRegistro) && p.fecha >= desde && p.fecha <= hasta)
  );
  store.evaluacionesTci = [...conservadas, ...nuevas];
  renumerar();

  return evidenciaTci();
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export function aEvaluacion(f: EvaluacionCalidadMock): EvaluacionTCI {
  const criterios = aplicarOverrides(f.criterios, f.overrides);
  return {
    id: f.id,
    n: f.n,
    fecha: f.fecha,
    turno: f.turno,
    tipoRegistro: f.tipoRegistro,
    registroId: f.registroId,
    lineaId: f.lineaId,
    lineaCodigo: f.lineaCodigo,
    referencia: f.referencia,
    criterios: criterios.filter((c) => CRITERIOS_POR_TIPO[f.tipoRegistro].includes(c.clave)),
    valido: esValido(criterios),
    ...(f.observacion ? { observacion: f.observacion } : {}),
    validadoEn: f.validadoEn,
    ...(f.overrides ? { overrides: f.overrides } : {}),
  };
}

/** Cabecera del KPI: totales, desglose por tipo, última corrida y fuentes. */
export function resumenTci(filas?: EvaluacionCalidadMock[]): ResumenTCI {
  const todas = filas ?? getStore().evaluacionesTci;
  const evaluadas = todas.map((f) => ({
    tipo: f.tipoRegistro,
    valido: esValido(aplicarOverrides(f.criterios, f.overrides)),
  }));

  const porTipo = Object.fromEntries(
    TIPOS_REGISTRO_TCI.map((tipo): [TipoRegistroTci, ResumenPorTipoTCI] => {
      const delTipo = evaluadas.filter((e) => e.tipo === tipo);
      return [tipo, { correctos: delTipo.filter((e) => e.valido).length, totales: delTipo.length }];
    })
  ) as Record<TipoRegistroTci, ResumenPorTipoTCI>;

  const registrosCorrectos = evaluadas.filter((e) => e.valido).length;
  const porcentaje = calcTci(registrosCorrectos, evaluadas.length);

  const ultima = todas.reduce<EvaluacionCalidadMock | null>(
    (mejor, f) => (!mejor || f.validadoEn > mejor.validadoEn ? f : mejor),
    null
  );

  return {
    registrosCorrectos,
    registrosTotales: evaluadas.length,
    porcentaje,
    meta: `≥ ${METAS_TESIS.TCI_PCT} %`,
    estado: estadoTci(porcentaje),
    porTipo,
    ...(ultima && ultima.validadoEn
      ? {
          ultimaValidacion: {
            fecha: ultima.validadoEn,
            desde: ultima.desde,
            hasta: ultima.hasta,
            evaluados: todas.filter((f) => f.validadoEn === ultima.validadoEn).length,
          },
        }
      : {}),
    fuentes: resumenFuentes(),
  };
}

/** Evidencia completa del Anexo 03 (todas las evaluaciones). */
export function evidenciaTci(): EvidenciaTCI {
  const filas = [...getStore().evaluacionesTci].sort((a, b) => a.n - b.n);
  return { ...resumenTci(filas), registros: filas.map(aEvaluacion) };
}

/** Aplica un override por criterio (`null` devuelve el control a la regla). */
export function aplicarOverrideManual(
  fila: EvaluacionCalidadMock,
  cambios: Partial<Record<ClaveCriterioTci, boolean | null>>,
  observacion?: string
): void {
  const overrides: Partial<Record<ClaveCriterioTci, boolean>> = { ...(fila.overrides ?? {}) };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null || valor === undefined) delete overrides[clave as ClaveCriterioTci];
    else overrides[clave as ClaveCriterioTci] = valor;
  }
  fila.overrides = Object.keys(overrides).length > 0 ? overrides : null;
  if (observacion !== undefined) fila.observacion = observacion;
  fila.valido = esValido(aplicarOverrides(fila.criterios, fila.overrides));
}
