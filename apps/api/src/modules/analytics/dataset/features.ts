/**
 * Definición declarativa del *feature store* de analítica (§4.2 del plan de IA).
 *
 * El catálogo es la única fuente del **orden** del vector que consume la
 * regresión logística: `muestra_analitica.features` es un diccionario nombrado
 * precisamente para que añadir o quitar una feature no invalide los pesos ya
 * persistidos — al puntuar se re-vectoriza usando los nombres guardados en
 * `modelo_version.coeficientes.nombres`.
 */

export type GrupoFeature =
  | 'calendario'
  | 'linea'
  | 'producto'
  | 'plan'
  | 'historico7d'
  | 'historico30d'
  | 'causas'
  | 'merma'
  | 'arranque'
  | 'personas'
  | 'turno_previo'
  | 'turno_actual';

/**
 * `anticipada`: se conoce antes de que arranque el turno objetivo, así que es
 * desplegable. `retrospectiva`: describe el propio turno (OEE, velocidad real,
 * producido) y sólo puede usarse para medir el techo del modelo — usarla en
 * producción sería fuga de datos (R4).
 */
export type Disponibilidad = 'anticipada' | 'retrospectiva';

export interface DefinicionFeature {
  nombre: string;
  grupo: GrupoFeature;
  disponibilidad: Disponibilidad;
  /** Etiqueta legible que la UI muestra en «Variables de entrada». */
  etiqueta: string;
}

/** Etiqueta de cada grupo para la tabla `VariableEntrada[]` de la pestaña Modelo. */
export const ETIQUETA_GRUPO: Record<GrupoFeature, string> = {
  calendario: 'Calendario',
  linea: 'Línea',
  producto: 'Producto',
  plan: 'Plan del turno',
  historico7d: 'Eventos históricos 7 d',
  historico30d: 'Eventos históricos 30 d',
  causas: 'Causas de parada',
  merma: 'Merma',
  arranque: 'Arranque y CIP',
  personas: 'Personas',
  turno_previo: 'Turno anterior',
  turno_actual: 'Turno en curso',
};

/**
 * Familias de producto. Los 201 productos del maestro no se codifican uno a uno
 * (sería un one-hot de 201 columnas sobre pocos cientos de muestras): se agrupan
 * por los tres sabores que concentran el grueso de las órdenes y un cajón `otros`.
 */
export const FAMILIAS_PRODUCTO = ['vainilla', 'chocolate', 'trisabor', 'otros'] as const;
export type FamiliaProducto = (typeof FAMILIAS_PRODUCTO)[number];

/** `Vainilla Light` → `vainilla`; cualquier sabor fuera del top-3 → `otros`. */
export function familiaDeSabor(sabor: string | null | undefined): FamiliaProducto {
  const limpio = (sabor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (limpio.includes('vainilla')) return 'vainilla';
  if (limpio.includes('chocolate')) return 'chocolate';
  if (limpio.includes('trisabor')) return 'trisabor';
  return 'otros';
}

/** Prefijo del one-hot de línea; el sufijo es el código real (`linea_LLEN_M2`). */
export function nombreFeatureLinea(lineaCodigo: string): string {
  return `linea_${lineaCodigo.replace(/[^A-Za-z0-9]/g, '_')}`;
}

export function nombreFeatureFamilia(familia: FamiliaProducto): string {
  return `familia_${familia}`;
}

/** Features independientes del maestro (todas menos el one-hot de línea). */
const FEATURES_BASE: DefinicionFeature[] = [
  { nombre: 'diaSemana', grupo: 'calendario', disponibilidad: 'anticipada', etiqueta: 'Día de la semana' },
  { nombre: 'esFinDeSemana', grupo: 'calendario', disponibilidad: 'anticipada', etiqueta: 'Fin de semana' },
  { nombre: 'diaDelMes', grupo: 'calendario', disponibilidad: 'anticipada', etiqueta: 'Día del mes' },
  { nombre: 'turnoEsNoche', grupo: 'calendario', disponibilidad: 'anticipada', etiqueta: 'Turno Noche' },

  { nombre: 'nOrdenesTurno', grupo: 'plan', disponibilidad: 'anticipada', etiqueta: 'Órdenes del turno' },
  { nombre: 'nCambiosProducto', grupo: 'plan', disponibilidad: 'anticipada', etiqueta: 'Cambios de producto' },
  { nombre: 'ratioPlanCapacidad', grupo: 'plan', disponibilidad: 'anticipada', etiqueta: 'Plan sobre capacidad' },
  { nombre: 'velocidadEstandarUnidMin', grupo: 'plan', disponibilidad: 'anticipada', etiqueta: 'Velocidad estándar' },

  { nombre: 'paradasImprev7d', grupo: 'historico7d', disponibilidad: 'anticipada', etiqueta: 'Paradas imprevistas 7 d' },
  { nombre: 'minParadasImprev7d', grupo: 'historico7d', disponibilidad: 'anticipada', etiqueta: 'Minutos parados 7 d' },
  { nombre: 'rachaSinParada', grupo: 'historico7d', disponibilidad: 'anticipada', etiqueta: 'Turnos sin parada' },

  { nombre: 'paradasImprev30d', grupo: 'historico30d', disponibilidad: 'anticipada', etiqueta: 'Paradas imprevistas 30 d' },
  { nombre: 'minParadasImprev30d', grupo: 'historico30d', disponibilidad: 'anticipada', etiqueta: 'Minutos parados 30 d' },
  { nombre: 'mtbfAprox', grupo: 'historico30d', disponibilidad: 'anticipada', etiqueta: 'MTBF aproximado' },

  { nombre: 'pctCausaFallas7d', grupo: 'causas', disponibilidad: 'anticipada', etiqueta: 'Peso de fallas 7 d' },
  { nombre: 'pctParadasSinCategorizar7d', grupo: 'causas', disponibilidad: 'anticipada', etiqueta: 'Paradas sin categorizar' },

  { nombre: 'mermaKg7d', grupo: 'merma', disponibilidad: 'anticipada', etiqueta: 'Merma 7 d (kg)' },
  { nombre: 'mermaKgTurnoPrevio', grupo: 'merma', disponibilidad: 'anticipada', etiqueta: 'Merma del turno anterior' },
  { nombre: 'mermaPctVsEstandar7d', grupo: 'merma', disponibilidad: 'anticipada', etiqueta: 'Merma sobre estándar 7 d' },
  { nombre: 'mermaPasteurizacionPct7d', grupo: 'merma', disponibilidad: 'anticipada', etiqueta: 'Merma a pasteurización' },

  { nombre: 'esArranqueLinea', grupo: 'arranque', disponibilidad: 'anticipada', etiqueta: 'Arranque de línea' },
  { nombre: 'minCipPrevistos', grupo: 'arranque', disponibilidad: 'anticipada', etiqueta: 'Minutos de CIP previstos' },
  { nombre: 'minArranquePrevistos', grupo: 'arranque', disponibilidad: 'anticipada', etiqueta: 'Minutos de arranque' },

  { nombre: 'maquinistaExpTurnos', grupo: 'personas', disponibilidad: 'anticipada', etiqueta: 'Experiencia del maquinista' },
  { nombre: 'cambioDeMaquinista', grupo: 'personas', disponibilidad: 'anticipada', etiqueta: 'Cambio de maquinista' },

  { nombre: 'oeeTurnoPrevio', grupo: 'turno_previo', disponibilidad: 'anticipada', etiqueta: 'OEE del turno anterior' },
  { nombre: 'desvioVelocidadTurnoPrevio', grupo: 'turno_previo', disponibilidad: 'anticipada', etiqueta: 'Desvío de velocidad anterior' },

  /* --- Sólo modo `retro`: describen el turno objetivo (fuga si se despliegan) --- */
  { nombre: 'oeeTotal', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'OEE del turno' },
  { nombre: 'oeeDisponibilidad', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Disponibilidad' },
  { nombre: 'oeeRendimiento', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Rendimiento' },
  { nombre: 'oeeCalidad', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Calidad' },
  { nombre: 'velocidadRealUnidMin', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Velocidad real' },
  { nombre: 'desvioVelocidadPct', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Desvío de velocidad' },
  { nombre: 'mermaKgTurno', grupo: 'turno_actual', disponibilidad: 'retrospectiva', etiqueta: 'Merma del turno' },
];

/**
 * Catálogo completo para un maestro de líneas concreto. El one-hot de línea se
 * genera aquí (y no se escribe a mano) para que añadir una línea al maestro no
 * exija tocar código.
 */
export function construirCatalogo(lineaCodigos: readonly string[]): DefinicionFeature[] {
  const lineas: DefinicionFeature[] = [...lineaCodigos]
    .sort()
    .map((codigo) => ({
      nombre: nombreFeatureLinea(codigo),
      grupo: 'linea' as const,
      disponibilidad: 'anticipada' as const,
      etiqueta: `Línea ${codigo}`,
    }));
  const familias: DefinicionFeature[] = FAMILIAS_PRODUCTO.map((f) => ({
    nombre: nombreFeatureFamilia(f),
    grupo: 'producto' as const,
    disponibilidad: 'anticipada' as const,
    etiqueta: `Familia ${f}`,
  }));
  return [...FEATURES_BASE, ...lineas, ...familias];
}

/** Subconjunto desplegable: todo lo que no describe el turno objetivo. */
export function catalogoAnticipado(catalogo: readonly DefinicionFeature[]): DefinicionFeature[] {
  return catalogo.filter((f) => f.disponibilidad === 'anticipada');
}

/** Nombres de las features que jamás pueden viajar en una muestra `anticipado`. */
export function nombresRetrospectivos(): string[] {
  return FEATURES_BASE.filter((f) => f.disponibilidad === 'retrospectiva').map((f) => f.nombre);
}

/** Diccionario nombrado → vector en el orden de `nombres`; lo ausente vale 0. */
export function vectorizar(
  features: Record<string, number>,
  nombres: readonly string[],
): number[] {
  return nombres.map((n) => {
    const valor = features[n];
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  });
}

/** Grupo al que pertenece cada feature, para agregar importancias por grupo. */
export function grupoPorNombre(catalogo: readonly DefinicionFeature[]): Map<string, GrupoFeature> {
  return new Map(catalogo.map((f) => [f.nombre, f.grupo]));
}

/** Mapa nombre → etiqueta de las features fijas (sin one-hot de línea). */
const ETIQUETA_BASE = new Map(FEATURES_BASE.map((f) => [f.nombre, f.etiqueta]));

/**
 * Etiqueta legible de una feature cualquiera, incluidas las generadas
 * (`linea_LLEN_M2` → `Línea LLEN-M2`). La usan los factores de la alerta, que
 * se muestran al supervisor tal cual.
 */
export function etiquetaDeFeature(nombre: string): string {
  const fija = ETIQUETA_BASE.get(nombre);
  if (fija) return fija;
  if (nombre.startsWith('linea_')) return `Línea ${nombre.slice(6).replace(/_/g, '-')}`;
  if (nombre.startsWith('familia_')) return `Familia ${nombre.slice(8)}`;
  return nombre;
}

/**
 * Vector en el orden de `nombres` donde lo ausente toma la **media de
 * entrenamiento** (z = 0) en vez de 0. Es lo que corresponde cuando el contexto
 * sólo trae parte de las features: un cero crudo se interpretaría como un valor
 * extremo, no como «no sé».
 */
export function vectorizarParcial(
  features: Record<string, number>,
  nombres: readonly string[],
  medias: readonly number[],
): number[] {
  return nombres.map((n, j) => {
    const valor = features[n];
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : (medias[j] ?? 0);
  });
}
