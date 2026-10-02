import type { OrdenSap, Turno } from '@mes/types';
import { HOY, fechaMas, pad2 } from './seed';

/**
 * Órdenes SAP **pendientes** de demostración: lo que el integrador de SAP deja
 * en `orden_fabricacion_dbs` del sistema legado y el wizard «Iniciar orden»
 * ofrece en su paso 1. Cuatro por línea en las 9 líneas reales, con productos
 * que tienen par activo en su línea, más tres casos borde:
 *
 * - `SAPD-090` · producto sin par en la línea pero con velocidad en el texto
 *   SAP (`7200 u/h`): la orden nace con 120 u/min tomadas de SAP;
 * - `SAPD-091` · el mismo caso con el texto SAP vacío (`' u/h'`): no hay
 *   velocidad estándar y la orden no puede iniciarse (422);
 * - `SAPD-092` · código de producto que no está en el maestro del MES: se
 *   guarda, pero no se lista como seleccionable.
 *
 * Fechas: una fila por línea en el día congelado de los mocks (`HOY`) y tres en
 * el día **real** del reloj, para que el selector tenga pendientes también
 * cuando la API corre contra datos reales sin origen SAP configurado. Los ids
 * usan el prefijo `SAPD-`, que la sincronización con el origen (`SAP-<id>`)
 * nunca toca.
 *
 * El número SAP no es único: `SAPD-035` repite el de `SAPD-034` (un parcial del
 * mismo número en el turno siguiente). Cada **fila** se consume una sola vez.
 */

/** `YYYY-MM-DD` del reloj local (el día real, no el congelado de la demo). */
function hoyReal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface ProductoPlan {
  codigo: string;
  /** Descripción tal como la manda SAP. */
  nombre: string;
  cajas: number;
  /** Texto SAP de velocidad (`'22000 u/h'`; `' u/h'` = vacío). */
  velocidad: string;
}

/** Dos productos con par activo por línea, en el orden del maestro de líneas. */
const PLAN_POR_LINEA: { lineaId: string; productos: [ProductoPlan, ProductoPlan] }[] = [
  {
    lineaId: 'LIN-EXTR-2',
    productos: [
      { codigo: '1120001', nombre: 'BOMBOM VAINILLA 30X54ML', cajas: 1200, velocidad: '22000 u/h' },
      { codigo: '1120060', nombre: 'MAGNETO VAI SAUCO 20X92ML', cajas: 1500, velocidad: '4800 u/h' },
    ],
  },
  {
    lineaId: 'LIN-EXTR-3',
    productos: [
      { codigo: '1120003', nombre: 'SANDWICH VAI-LUC 30X67ML', cajas: 3200, velocidad: '15300 u/h' },
      { codigo: '1120062', nombre: 'CONO BOLA 30X105ML', cajas: 3000, velocidad: ' u/h' },
    ],
  },
  {
    lineaId: 'LIN-LLEN-A1',
    productos: [
      { codigo: '1120072', nombre: 'BAKANAZO VAI CHOC SP 18X200ML', cajas: 3500, velocidad: '9500 u/h' },
      { codigo: '1120002', nombre: 'CORNELLO VAI 12X120ML', cajas: 5000, velocidad: '8000 u/h' },
    ],
  },
  {
    lineaId: 'LIN-LLEN-A2',
    productos: [
      { codigo: '1120055', nombre: 'MINI TRISABOR 30X95ML', cajas: 4000, velocidad: '19200 u/h' },
      { codigo: '1120103', nombre: 'COPAMIX TRISABOR 30X95ML', cajas: 3600, velocidad: '19200 u/h' },
    ],
  },
  {
    lineaId: 'LIN-LLEN-M1',
    productos: [
      { codigo: '1110001', nombre: 'CUB-YAM-CAPUCCINO 1X5L', cajas: 500, velocidad: '720 u/h' },
      { codigo: '1110006', nombre: 'CUB-YAM-LUCUMA 1X5L', cajas: 600, velocidad: ' u/h' },
    ],
  },
  {
    lineaId: 'LIN-LLEN-M2',
    productos: [
      { codigo: '1110004', nombre: 'CUB-YAM-COCO CHIPS 1X5L', cajas: 400, velocidad: '480 u/h' },
      { codigo: '1110007', nombre: 'CUB-YAM-LUCUM CHIPS1X5L', cajas: 350, velocidad: '480 u/h' },
    ],
  },
  {
    lineaId: 'LIN-MOLD-A2',
    productos: [
      { codigo: '1120024', nombre: 'YAMBITO CHOCOLATE 40X54ML', cajas: 3000, velocidad: '18000 u/h' },
      { codigo: '1120028', nombre: 'CHOCO VAI 40X61 ML', cajas: 2800, velocidad: '18000 u/h' },
    ],
  },
  {
    lineaId: 'LIN-MOLD-A3',
    productos: [
      { codigo: '1120023', nombre: 'YAMBITO VAI-LUC 40X54ML', cajas: 4000, velocidad: '21000 u/h' },
      { codigo: '1120025', nombre: 'YAMBITO FRESA 40X54ML', cajas: 3500, velocidad: '21000 u/h' },
    ],
  },
  {
    lineaId: 'LIN-MOLD-A4',
    productos: [
      { codigo: '1120074', nombre: 'MAXI GOLD VAI LUC 36X78ML', cajas: 4500, velocidad: '27500 u/h' },
      { codigo: '1120079', nombre: 'PRAIA-FRESA 40X70ML', cajas: 4800, velocidad: '24400 u/h' },
    ],
  },
];

/** Hueco de cada fila de una línea: `[fecha, turno, índice de producto]`. */
function huecos(): [string, Turno, 0 | 1][] {
  const real = hoyReal();
  return [
    [HOY, 'N', 0],
    [real, 'D', 1],
    [real, 'N', 0],
    [fechaMas(1, real), 'D', 1],
  ];
}

/** `'22000 u/h'` → `22000`; vacío o `0` → `null` (espejo de `velocidadSapUnidHora`). */
function unidHora(texto: string): number | null {
  const digitos = texto.replace(/[^0-9]/g, '');
  const valor = digitos ? Number(digitos) : 0;
  return valor > 0 ? valor : null;
}

const SINCRONIZADA_EN = `${HOY}T05:30:00`;
const NUMERO_BASE = 95101700;

function fila(
  n: number,
  datos: Omit<OrdenSap, 'id' | 'numero' | 'tipoProduccion' | 'ordenId' | 'sincronizadaEn' | 'velocidadUnidHora'> & {
    velocidad: string;
    numero?: string;
  },
): OrdenSap {
  const { velocidad, numero, ...resto } = datos;
  return {
    id: `SAPD-${String(n).padStart(3, '0')}`,
    numero: numero ?? String(NUMERO_BASE + n),
    ...resto,
    velocidadUnidHora: unidHora(velocidad),
    tipoProduccion: 'Produccion',
    ordenId: null,
    sincronizadaEn: SINCRONIZADA_EN,
  };
}

function construir(): OrdenSap[] {
  const filas: OrdenSap[] = [];
  PLAN_POR_LINEA.forEach(({ lineaId, productos }, iLinea) => {
    huecos().forEach(([fecha, turno, iProducto], iHueco) => {
      const n = iLinea * 4 + iHueco + 1;
      const producto = productos[iProducto];
      filas.push(
        fila(n, {
          fecha,
          turno,
          lineaId,
          productoId: `PRD-${producto.codigo}`,
          codigoProducto: producto.codigo,
          productoNombre: producto.nombre,
          /* Las filas siguientes de la misma línea planifican un poco menos. */
          planificadoCajas: producto.cajas - iHueco * 100,
          velocidad: producto.velocidad,
        }),
      );
    });
  });

  /* Parcial: SAPD-035 repite el número SAP de SAPD-034 en el turno siguiente. */
  const parcial = filas.find((f) => f.id === 'SAPD-035');
  const original = filas.find((f) => f.id === 'SAPD-034');
  if (parcial && original) parcial.numero = original.numero;

  const real = hoyReal();
  filas.push(
    fila(90, {
      fecha: real,
      turno: 'D',
      lineaId: 'LIN-EXTR-2',
      productoId: 'PRD-1120002',
      codigoProducto: '1120002',
      productoNombre: 'CORNELLO VAI 12X120ML',
      planificadoCajas: 800,
      velocidad: '7200 u/h',
    }),
    fila(91, {
      fecha: real,
      turno: 'N',
      lineaId: 'LIN-EXTR-2',
      productoId: 'PRD-1120002',
      codigoProducto: '1120002',
      productoNombre: 'CORNELLO VAI 12X120ML',
      planificadoCajas: 600,
      velocidad: ' u/h',
    }),
    fila(92, {
      fecha: real,
      turno: 'D',
      lineaId: 'LIN-EXTR-2',
      productoId: null,
      codigoProducto: '1199999',
      productoNombre: 'PRODUCTO NUEVO SIN FICHA 24X90ML',
      planificadoCajas: 1000,
      velocidad: '15000 u/h',
    }),
  );
  return filas;
}

export const ordenesSap: OrdenSap[] = construir();
