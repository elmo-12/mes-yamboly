import type {
  Alerta,
  AuditEvent,
  CausaMerma,
  CausaParada,
  DeteccionIoT,
  ExportJob,
  Linea,
  LineaEstado,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  RegistroTRI,
  RegistroVelocidad,
  Sabor,
  Umbrales,
  User,
  VelocidadEstandar,
  VerificacionCFS,
} from '@mes/types';
import { calcEp, calcTci, calcTri, calcTsp } from '@mes/shared';
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
  triPostest: RegistroTRI[];
  triPretest: RegistroTRI[];
  lineaEstados: LineaEstado[];
  /** Matriz de respuestas de la encuesta TSP (19 semilla + nuevas). */
  respuestasTsp: number[][];
  /** Contadores acumulados del KPI EP (Anexo 06). */
  ep: { correctas: number; totales: number };
  /** Secuencia para ids nuevos. */
  seq: number;
}

function respuestasSemilla(): number[][] {
  /* Reconstruye una matriz 19×8 coherente con los % de acuerdo del Anexo 04. */
  const deAcuerdoPorItem = [17, 16, 15, 17, 16, 15, 16, 16];
  const filas: number[][] = [];
  for (let r = 0; r < 19; r += 1) {
    filas.push(deAcuerdoPorItem.map((deAcuerdo, i) => (r < deAcuerdo ? (i % 2 === 0 ? 5 : 4) : (i % 2 === 0 ? 3 : 2))));
  }
  return filas;
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
    triPostest: clonar(data.evidenciaTri.postest),
    triPretest: clonar(data.evidenciaTri.pretest),
    lineaEstados: clonar(data.lineaEstadosBase),
    respuestasTsp: respuestasSemilla(),
    ep: { correctas: data.EP_CORRECTAS_BASE, totales: data.EP_TOTALES_BASE },
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

/** TRI actual (ΣTR/n) sobre los registros postest del store. */
export function triActual(): number {
  return calcTri(store.triPostest.map((r) => r.tiempoMin));
}

export function triPretestPromedio(): number {
  return calcTri(store.triPretest.map((r) => r.tiempoMin));
}

/** Añade un registro TRI cuando un formulario reporta `tiempoRegistroSeg`. */
export function registrarTri(evento: string, segundos: number, fecha: string): void {
  if (segundos <= 0) return;
  store.triPostest.push({
    id: nextId('TRI-PO'),
    n: store.triPostest.length + 1,
    fecha,
    eventoRegistrado: evento,
    horaInicioRegistro: new Date().toTimeString().slice(0, 8),
    tiempoMin: redondear(segundos / 60),
    etapa: 'postest',
  });
}

/** TCI actual: registros correctos / totales del Anexo 03. */
export function tciActual(): number {
  return calcTci(data.evidenciaTci.registrosCorrectos, data.evidenciaTci.registrosTotales);
}

/** TSP actual recalculado sobre la matriz de respuestas del store. */
export function tspActual(): { pctAcuerdo: number; promedio: number; respuestas: number } {
  let deAcuerdo = 0;
  let total = 0;
  let suma = 0;
  for (const fila of store.respuestasTsp) {
    for (const valor of fila) {
      total += 1;
      suma += valor;
      if (valor >= 4) deAcuerdo += 1;
    }
  }
  return {
    pctAcuerdo: calcTsp(deAcuerdo, total),
    promedio: total > 0 ? Math.round((suma / total) * 100) / 100 : 0,
    respuestas: store.respuestasTsp.length,
  };
}

/** CFS actual: funcionalidades marcadas como cumplidas / 9. */
export function cfsActual(): { cumplidas: number; totales: number; porcentaje: number } {
  const cumplidas = store.verificacionesCfs.filter((v) => v.cumple).length;
  const totales = store.verificacionesCfs.length;
  return { cumplidas, totales, porcentaje: redondear((cumplidas / totales) * 100) };
}

/** EP actual: se recalcula cada vez que se confirma un evento real. */
export function epActual(): number {
  return calcEp(store.ep.correctas, store.ep.totales);
}

/** Registra el resultado real de una alerta y actualiza el KPI EP. */
export function confirmarAcierto(alerta: Alerta, ocurrio: boolean): void {
  const acierto = ocurrio;
  alerta.acierto = acierto;
  alerta.estado = 'confirmada';
  store.ep.totales += 1;
  if (acierto) store.ep.correctas += 1;
}
