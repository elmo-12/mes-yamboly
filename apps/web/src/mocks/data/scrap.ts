import type { Merma, RegistroVelocidad, TipoMermaCodigo } from '@mes/types';
import {
  causasMermaHoja,
  clasificacionDeMerma,
  productoPorId,
  SABORES,
  tipoDeMerma,
} from './catalogs';
import { maquinistaPorLinea } from './users';
import { ordenes } from './orders';
import { HOY, iso, pad4, redondear, rng, sumarMinutos } from './seed';

/**
 * ~92 mermas deterministas sobre el árbol de causas de merma **real**: se
 * registra siempre una hoja (`nivel: 'causa'`) y se guardan su clasificación y
 * su tipo raíz. Las 2 de la OF-2026-0815 son las de la spec 05.C.
 */

export const MERMAS_REFERENCIA: Merma[] = [
  {
    id: 'MER-0815-01',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    tipo: 'EP',
    cantidadKg: 3.2,
    sabor: 'Vainilla',
    tipoCausaId: 'CME-MP-01',
    clasificacionId: 'CME-MP-01-A',
    causaId: 'CME-MP-01-01',
    responsableId: 'USR-07',
    enviarPasteurizacion: true,
    codigoBalde: 'BLD-2026-0417',
    registradaEn: iso(HOY, '11:05'),
    tiempoRegistroSeg: 63,
  },
  {
    id: 'MER-0815-02',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-LLEN-A1',
    tipo: 'PT',
    cantidadKg: 1.8,
    sabor: 'Vainilla',
    tipoCausaId: 'CME-MP-02',
    clasificacionId: 'CME-MP-02-A',
    causaId: 'CME-MP-02-01',
    responsableId: 'USR-04',
    enviarPasteurizacion: false,
    codigoBalde: 'BLD-2026-0418',
    registradaEn: iso(HOY, '12:52'),
    tiempoRegistroSeg: 71,
    observacion: 'Bobina empalmada a media corrida; se descartó el tramo impreso fuera de registro',
  },
];

const TIPOS: TipoMermaCodigo[] = ['MP', 'EP', 'PT'];

/** Comentario por clasificación, para las causas con `requiereComentario`. */
const COMENTARIOS: Record<string, string> = {
  'CME-MP-01-D': 'Producto retenido en la tolva durante la parada de producción',
  'CME-MP-01-E': 'Descarte recogido de la faja durante la corrida',
  'CME-MP-02-A': 'Desvío del proceso detectado por el operario en la corrida',
  'CME-MP-03-A': 'Producto perdido durante la parada por falla operativa',
  'CME-MP-03-B': 'Producto no conforme separado en línea',
  'CME-MP-04-A': 'Descarte generado mientras mantenimiento intervenía el equipo',
  'CME-MP-04-B': 'Producto perdido durante la parada de mantenimiento',
  'CME-MP-05-A': 'Producto perdido por corte de servicio externo',
};

function comentario(clasificacionId: string | null): string {
  return (
    (clasificacionId ? COMENTARIOS[clasificacionId] : undefined) ??
    'Merma verificada y pesada por el encargado de turno'
  );
}

function generarMermas(): Merma[] {
  const r = rng(303);
  const out: Merma[] = [];
  const conMermas = ordenes.filter((o) => o.mermasKg > 0 && o.id !== 'ORD-0815');

  for (const orden of conMermas) {
    const cantidadRegistros = r.int(4, 5);
    const producto = productoPorId.get(orden.productoId);
    const causasLinea = causasMermaHoja.filter(
      (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(orden.lineaId)
    );
    /* Se reparte el total de la orden entre los registros con una holgura fija. */
    const pesos = Array.from({ length: cantidadRegistros }, () => r.float(0.7, 1.3, 2));
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    let cursor = sumarMinutos(orden.inicio, 55);

    for (let i = 0; i < cantidadRegistros; i += 1) {
      const cantidadKg = Math.max(0.4, redondear((orden.mermasKg * pesos[i]!) / sumaPesos));
      const tipo = TIPOS[r.int(0, 2)]!;
      const candidatas = causasLinea.filter((c) => c.aplicaA.includes(tipo));
      const causa = candidatas[r.int(0, candidatas.length - 1)]!;
      const clasificacionId = clasificacionDeMerma(causa.id)?.id ?? null;
      const tipoCausaId = tipoDeMerma(causa.id)?.id ?? causa.id;
      out.push({
        id: `MER-${orden.id.slice(4)}-${pad4(i + 1).slice(2)}`,
        ordenId: orden.id,
        lineaId: orden.lineaId,
        tipo,
        cantidadKg,
        sabor: producto?.sabor || SABORES[r.int(0, SABORES.length - 1)]!,
        tipoCausaId,
        clasificacionId,
        causaId: causa.id,
        numeroSolicitud: causa.requiereSolicitud ? `SM-2026-${pad4(r.int(200, 599))}` : null,
        responsableId: r.bool(0.4) ? 'USR-04' : (maquinistaPorLinea[orden.lineaId] ?? 'USR-07'),
        codigoBalde: tipo !== 'MP' ? `BLD-2026-${pad4(r.int(100, 899))}` : undefined,
        enviarPasteurizacion: tipo === 'EP' && r.bool(0.7),
        registradaEn: cursor,
        tiempoRegistroSeg: r.int(48, 118),
        observacion: causa.requiereComentario ? comentario(clasificacionId) : undefined,
      });
      cursor = sumarMinutos(cursor, r.int(45, 110));
    }
  }
  return out;
}

export const mermas: Merma[] = [...MERMAS_REFERENCIA, ...generarMermas()];
export const mermaPorId = new Map(mermas.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ */
/* Registros de velocidad                                              */
/* ------------------------------------------------------------------ */

export const VELOCIDAD_REFERENCIA: RegistroVelocidad = {
  id: 'VEL-0815-01',
  ordenId: 'ORD-0815',
  lineaId: 'LIN-LLEN-A1',
  registradaEn: iso(HOY, '09:10'),
  velocidadReal: 131,
  velocidadEstandar: 133.3,
  desvioPct: -1.7,
  responsableId: 'USR-07',
  tiempoRegistroSeg: 41,
};

function generarVelocidades(): RegistroVelocidad[] {
  const r = rng(404);
  const out: RegistroVelocidad[] = [];
  const MOTIVOS = [
    'Mezcla fría, se redujo el ritmo de dosificación',
    'Ajuste de sellado en curso',
    'Operario en capacitación',
    'Cambio de bobina reciente',
  ];

  for (const orden of ordenes) {
    if (orden.id === 'ORD-0815') continue;
    const registros = r.int(2, 4);
    let cursor = sumarMinutos(orden.inicio, 70);
    for (let i = 0; i < registros; i += 1) {
      const velocidadReal = redondear(orden.velocidadEstandar * r.float(0.88, 1.05, 3));
      const desvioPct = redondear(
        ((velocidadReal - orden.velocidadEstandar) / orden.velocidadEstandar) * 100
      );
      out.push({
        id: `VEL-${orden.id.slice(4)}-${pad4(i + 1).slice(2)}`,
        ordenId: orden.id,
        lineaId: orden.lineaId,
        registradaEn: cursor,
        velocidadReal,
        velocidadEstandar: orden.velocidadEstandar,
        desvioPct,
        motivo: desvioPct < -4 ? MOTIVOS[r.int(0, MOTIVOS.length - 1)] : undefined,
        responsableId: maquinistaPorLinea[orden.lineaId] ?? 'USR-07',
        tiempoRegistroSeg: r.int(28, 74),
      });
      cursor = sumarMinutos(cursor, r.int(90, 160));
    }
  }
  return out;
}

export const velocidades: RegistroVelocidad[] = [VELOCIDAD_REFERENCIA, ...generarVelocidades()];
