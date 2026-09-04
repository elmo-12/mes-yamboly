import type {
  Alerta,
  AuditEvent,
  CausaMerma,
  CausaParada,
  ClaveCriterioTci,
  CriterioTCI,
  DeteccionIoT,
  EstadoLecturaSensor,
  ExportJob,
  InvitacionTSP,
  Linea,
  LineaEstado,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  RegistroEP,
  RegistroTRI,
  RegistroVelocidad,
  Sabor,
  TipoFuenteExterna,
  TipoMermaCodigo,
  TipoRegistroTci,
  Turno,
  Umbrales,
  User,
  VelocidadEstandar,
  VerificacionCFS,
} from '@mes/types';
import { TIPO_ALERTA_LABEL } from '@mes/types';
import {
  calcEp,
  calcEpOpcional,
  calcPromedioLikert,
  calcTci,
  calcTri,
  calcTriOpcional,
  calcTsp,
} from '@mes/shared';
import * as data from './data';
import { redondear } from './data/seed';
import type { UsuarioSeed } from './data/users';

/**
 * Store en memoria del mock. Se clona a partir de los datasets deterministas
 * la primera vez que se importa, de modo que las mutaciones de un flujo
 * (registrar parada, atender alerta, responder la encuesta) se reflejan en el
 * resto de endpoints durante la sesión, sin tocar los datos semilla.
 */

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/** `YYYY-MM-DD` del reloj local (espejo de `hoyIso()` de la API). */
function hoyLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Fuentes externas importadas (espejo de las entidades de la API)     */
/* ------------------------------------------------------------------ */

/** Espejo de `ImportacionFuente`: bitácora de un archivo XLSX/CSV importado. */
export interface ImportacionFuenteMock {
  id: string;
  tipo: TipoFuenteExterna;
  archivo: string;
  importadoEn: string;
  importadoPor: string;
  filasOk: number;
  filasRechazadas: number;
  filasDuplicadas: number;
  desde: string | null;
  hasta: string | null;
}

/** Espejo de `LecturaSensor`. */
export interface LecturaSensorMock {
  id: string;
  importacionId: string;
  lineaId: string;
  /** ISO-8601 local `YYYY-MM-DDTHH:mm:ss`. */
  fechaHora: string;
  estado: EstadoLecturaSensor;
  velocidadUnidMin: number | null;
}

/** Espejo de `SolicitudExterna`. */
export interface SolicitudExternaMock {
  id: string;
  importacionId: string;
  numero: string;
  fecha: string;
  lineaId: string | null;
  tipo: string;
  estado: string;
  descripcion: string;
}

/** Espejo de `TransferenciaSap`. */
export interface TransferenciaSapMock {
  id: string;
  importacionId: string;
  documento: string;
  fecha: string;
  lineaId: string;
  productoCodigo: string;
  cantidadKg: number;
  tipoMerma: TipoMermaCodigo | null;
  motivo: string;
}

/**
 * Espejo de `EvaluacionCalidad`: los `criterios` guardan el resultado **de las
 * reglas**, sin los overrides aplicados, para poder quitarlos y recuperar el
 * valor calculado.
 */
export interface EvaluacionCalidadMock {
  id: string;
  n: number;
  fecha: string;
  turno: Turno;
  tipoRegistro: TipoRegistroTci;
  registroId: string;
  lineaId: string;
  lineaCodigo: string;
  referencia: string;
  criterios: CriterioTCI[];
  overrides: Partial<Record<ClaveCriterioTci, boolean>> | null;
  valido: boolean;
  validadoEn: string;
  desde: string;
  hasta: string;
  observacion: string;
}

/** Espejo de `EncuestaRespuesta`: una fila por invitación respondida. */
export interface RespuestaTspMock {
  id: string;
  token: string;
  respuestas: number[];
  comentario: string | null;
  fecha: string;
}

export interface FuentesExternasMock {
  lecturasSensor: LecturaSensorMock[];
  solicitudes: SolicitudExternaMock[];
  transferenciasSap: TransferenciaSapMock[];
}

export interface MockStore {
  ordenes: OrdenFabricacion[];
  paradas: Parada[];
  mermas: Merma[];
  velocidades: RegistroVelocidad[];
  alertas: Alerta[];
  detecciones: DeteccionIoT[];
  bitacora: AuditEvent[];
  /** Editable desde Configuración → Productos y velocidades (spec 10). */
  productos: Producto[];
  /** Pares producto × línea: la velocidad estándar vive aquí, no en el producto. */
  velocidadesEstandar: VelocidadEstandar[];
  /** Catálogo de sabores del maestro real (solo lectura por ahora). */
  sabores: Sabor[];
  /** Líneas editables desde Configuración → Líneas (la línea es la máquina física). */
  lineas: Linea[];
  /** Usuarios editables (alta, edición, estado y restablecer contraseña). */
  usuarios: UsuarioSeed[];
  causasParada: CausaParada[];
  causasMerma: CausaMerma[];
  umbrales: Umbrales;
  exportaciones: ExportJob[];
  verificacionesCfs: VerificacionCFS[];
  /** Postest del Anexo 02: arranca vacío y crece con cada captura cronometrada. */
  triPostest: RegistroTRI[];
  /** Pretest del Anexo 02: 10 filas medidas a mano, editables desde 09.B. */
  triPretest: RegistroTRI[];
  lineaEstados: LineaEstado[];
  /** Fuentes externas acumuladas por importación (XLSX/CSV). */
  fuentes: FuentesExternasMock;
  /** Bitácora de importaciones, la más reciente primero. */
  importaciones: ImportacionFuenteMock[];
  /** Evaluaciones del Anexo 03; las produce `POST /evidencia/tci/validar`. */
  evaluacionesTci: EvaluacionCalidadMock[];
  /** Invitaciones nominales a la encuesta TSP (un token por persona). */
  invitacionesTsp: InvitacionTSP[];
  /** Respuestas recibidas en la encuesta TSP (arranca vacío). */
  respuestasTsp: RespuestaTspMock[];
  /** Anexo 06: una fila por alerta confirmada (arranca vacío). */
  registrosEp: RegistroEP[];
  /** Secuencia para ids nuevos. */
  seq: number;
}

function crearStore(): MockStore {
  return {
    ordenes: clonar(data.ordenes),
    paradas: clonar(data.paradas),
    mermas: clonar(data.mermas),
    velocidades: clonar(data.velocidades),
    alertas: clonar(data.alertas),
    detecciones: clonar(data.detecciones),
    bitacora: clonar(data.bitacora),
    productos: clonar(data.productos),
    velocidadesEstandar: clonar(data.velocidadesEstandar),
    sabores: clonar(data.sabores),
    lineas: clonar(data.lineas),
    usuarios: clonar(data.usuarios),
    causasParada: clonar(data.causasParada),
    causasMerma: clonar(data.causasMerma),
    umbrales: clonar(data.umbralesIniciales),
    exportaciones: clonar(data.exportacionesIniciales) as unknown as ExportJob[],
    verificacionesCfs: clonar(data.verificacionesCfs),
    triPostest: [],
    triPretest: clonar(data.evidenciaTri.pretest),
    lineaEstados: clonar(data.lineaEstadosBase),
    fuentes: { lecturasSensor: [], solicitudes: [], transferenciasSap: [] },
    importaciones: [],
    evaluacionesTci: [],
    invitacionesTsp: [],
    respuestasTsp: [],
    registrosEp: [],
    seq: 1000,
  };
}

let store: MockStore = crearStore();

export function getStore(): MockStore {
  return store;
}

/** Vuelve al estado semilla (útil en tests). */
export function resetStore(): void {
  store = crearStore();
}

export function nextId(prefijo: string): string {
  store.seq += 1;
  return `${prefijo}-${store.seq}`;
}

/* ------------------------------------------------------------------ */
/* Lookups sobre los catálogos mutables del store                      */
/* ------------------------------------------------------------------ */

/** Espejo de `LookupsService.parActivo`: par producto × línea vigente. */
export function parActivo(productoId: string, lineaId: string): VelocidadEstandar | undefined {
  return store.velocidadesEstandar.find(
    (v) => v.productoId === productoId && v.lineaId === lineaId && v.estado === 'activo'
  );
}

export function buscarCausaMerma(id: string): CausaMerma | undefined {
  return store.causasMerma.find((c) => c.id === id);
}

/**
 * Cadena de ascendencia de una causa de merma: `causa` (hoja) →
 * `clasificacion` (intermedio, opcional) → `tipo` (raíz). Espejo de
 * `cadenaCausaMerma` de `apps/api/src/common/mappers/enrich.ts`.
 */
export function cadenaCausaMerma(causaId: string): {
  causa?: CausaMerma;
  clasificacion?: CausaMerma;
  tipo?: CausaMerma;
} {
  const causa = buscarCausaMerma(causaId);
  const padre = causa?.parentId ? buscarCausaMerma(causa.parentId) : undefined;
  const abuelo = padre?.parentId ? buscarCausaMerma(padre.parentId) : undefined;
  if (abuelo) return { causa, clasificacion: padre, tipo: abuelo };
  if (padre) return { causa, clasificacion: undefined, tipo: padre };
  return { causa, clasificacion: undefined, tipo: causa };
}

export function usuarioPorId(id: string): UsuarioSeed | undefined {
  return store.usuarios.find((u) => u.id === id);
}

/**
 * Vista pública de un usuario: sin contraseña y sin `null` en los opcionales,
 * igual que `toUserDto` de la API.
 */
export function toUser(u: UsuarioSeed): User {
  const { password: _password, ...user } = u;
  return {
    ...user,
    lineaId: user.lineaId ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    ultimoAcceso: user.ultimoAcceso ?? undefined,
  };
}

export function nombreUsuario(id: string): string {
  return usuarioPorId(id)?.nombre ?? 'Sistema';
}

export function inicialesUsuario(id: string): string {
  return usuarioPorId(id)?.iniciales ?? 'SY';
}

/* ------------------------------------------------------------------ */
/* Derivaciones                                                        */
/* ------------------------------------------------------------------ */

export function registrarBitacora(evento: Omit<AuditEvent, 'id'>): AuditEvent {
  const nuevo: AuditEvent = { id: nextId('AUD'), ...evento };
  store.bitacora.unshift(nuevo);
  return nuevo;
}

/** Recalcula contadores agregados de una orden tras una mutación. */
export function recalcularOrden(ordenId: string): void {
  const orden = store.ordenes.find((o) => o.id === ordenId);
  if (!orden) return;
  const paradasOrden = store.paradas.filter((p) => p.ordenId === ordenId);
  orden.paradasCount = paradasOrden.length;
  orden.mermasKg = redondear(
    store.mermas.filter((m) => m.ordenId === ordenId).reduce((acc, m) => acc + m.cantidadKg, 0)
  );
}

/** Refleja una parada nueva/cerrada en el tablero de tiempo real. */
export function sincronizarTiempoReal(parada: Parada): void {
  const linea = store.lineaEstados.find((l) => l.lineaId === parada.lineaId);
  if (!linea) return;
  const causa = store.causasParada.find((c) => c.id === parada.causaId);
  const tipo = store.causasParada.find((c) => c.id === parada.tipoCausaId);
  if (!parada.fin) {
    linea.estado = 'parada';
    linea.velocidad = 0;
    linea.tiempoEnEstadoMin = parada.duracionMin;
  } else if (linea.estado === 'parada' || linea.estado === 'sugerida') {
    linea.estado = linea.alerta ? 'alerta' : 'produciendo';
    linea.velocidad = linea.velocidadEstandar;
    linea.tiempoEnEstadoMin = 0;
  }
  linea.ultimaParada = {
    causaCodigo: causa?.codigo ?? tipo?.codigo ?? '—',
    causaNombre: causa?.nombre ?? tipo?.nombre ?? 'Parada',
    inicio: parada.inicio,
    duracionMin: parada.duracionMin,
    enCurso: parada.fin === null,
  };
}

/** TRI actual (ΣTR/n) del postest; `null` mientras no haya ninguna captura. */
export function triActual(): number | null {
  return calcTriOpcional(store.triPostest.map((r) => r.tiempoMin));
}

/** TRI del pretest (línea base cargada a mano); `0` si aún no se cargó. */
export function triPretestPromedio(): number {
  return calcTri(store.triPretest.map((r) => r.tiempoMin));
}

/**
 * Añade un registro TRI cuando un formulario reporta `tiempoRegistroSeg`.
 * Espejo de `EvidenceService.registrarTiempoPostest`: sin cronómetro (0 s) no
 * hay fila, y el id se deriva del registro que lo originó.
 */
export function registrarTri(
  evento: string,
  segundos: number,
  fecha: string,
  referenciaId?: string
): void {
  if (segundos <= 0) return;
  store.triPostest.push({
    id: referenciaId ? `TRI-PO-AUTO-${referenciaId}` : nextId('TRI-PO'),
    n: store.triPostest.length + 1,
    fecha,
    eventoRegistrado: evento,
    horaInicioRegistro: new Date().toTimeString().slice(0, 8),
    tiempoMin: redondear(segundos / 60),
    etapa: 'postest',
  });
}

/**
 * TCI actual sobre las evaluaciones del store; `null` mientras no se haya
 * ejecutado ninguna validación (`POST /evidencia/tci/validar`).
 */
export function tciActual(): number | null {
  const totales = store.evaluacionesTci.length;
  const correctos = store.evaluacionesTci.filter((e) => e.valido).length;
  return calcTci(correctos, totales);
}

/** TSP actual recalculado sobre las respuestas recibidas; `null` sin respuestas. */
export function tspActual(): {
  pctAcuerdo: number | null;
  promedio: number | null;
  respuestas: number;
  invitados: number;
} {
  const planas = store.respuestasTsp.flatMap((r) => r.respuestas);
  const deAcuerdo = planas.filter((v) => v >= 4).length;
  return {
    pctAcuerdo: calcTsp(deAcuerdo, planas.length),
    promedio: calcPromedioLikert(planas),
    respuestas: store.respuestasTsp.length,
    invitados: store.invitacionesTsp.length,
  };
}

/** CFS actual: funcionalidades marcadas como cumplidas / 9. */
export function cfsActual(): { cumplidas: number; totales: number; porcentaje: number } {
  const cumplidas = store.verificacionesCfs.filter((v) => v.cumple).length;
  const totales = store.verificacionesCfs.length;
  return {
    cumplidas,
    totales,
    porcentaje: totales > 0 ? redondear((cumplidas / totales) * 100) : 0,
  };
}

/** EP acumulada en porcentaje: la forma que consume el header de Alertas (0 sin datos). */
export function epActual(): number {
  const { correctas, totales } = epContadores();
  return calcEp(correctas, totales);
}

/** EP del Anexo 06: `null` mientras no se haya confirmado ninguna alerta. */
export function epEvidencia(): number | null {
  const { correctas, totales } = epContadores();
  return calcEpOpcional(correctas, totales);
}

export function epContadores(): { correctas: number; totales: number } {
  return {
    correctas: store.registrosEp.filter((r) => r.acierto).length,
    totales: store.registrosEp.length,
  };
}

/**
 * Registra el resultado real de una alerta y añade su fila al Anexo 06.
 * Espejo de `AlertsService.aplicarConfirmacion`.
 */
export function confirmarAcierto(alerta: Alerta, ocurrio: boolean, observacion?: string): void {
  alerta.acierto = ocurrio;
  alerta.estado = 'confirmada';
  if (observacion) alerta.observacion = observacion;
  store.registrosEp.push({
    id: `EP-ALE-${alerta.id}`,
    n: store.registrosEp.length + 1,
    fecha: hoyLocalIso(),
    tipoPrediccion: `${TIPO_ALERTA_LABEL[alerta.tipo]} · ${alerta.lineaCodigo} ${alerta.lineaNombre}`,
    eventoReal: ocurrio
      ? 'El evento ocurrió dentro de la ventana prevista'
      : 'No se observó el evento en la ventana',
    acierto: ocurrio,
    observacion: observacion ?? '',
    alertaId: alerta.id,
  });
}
