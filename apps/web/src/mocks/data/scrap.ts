import type { Merma, RegistroVelocidad, TipoMermaCodigo } from '@mes/types';
import { causasMerma, productoPorId, SABORES } from './catalogs';
import { maquinistaPorLinea } from './users';
import { ordenes } from './orders';
import { HOY, iso, pad4, redondear, rng, sumarMinutos } from './seed';

/** ~90 mermas deterministas. Las 2 de la OF-2026-0815 son las de la spec 05.C. */

export const MERMAS_REFERENCIA: Merma[] = [
  {
    id: 'MER-0815-01',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    tipo: 'EP',
    cantidadKg: 3.2,
    sabor: 'Vainilla',
    causaId: 'CME-MR-03',
    responsableId: 'USR-02',
    enviarPasteurizacion: true,
    codigoBalde: 'BLD-2026-0417',
    registradaEn: iso(HOY, '11:05'),
    tiempoRegistroSeg: 63,
  },
  {
    id: 'MER-0815-02',
    ordenId: 'ORD-0815',
    lineaId: 'LIN-02',
    tipo: 'PT',
    cantidadKg: 1.8,
    sabor: 'Vainilla',
    causaId: 'CME-MR-01',
    responsableId: 'USR-04',
    enviarPasteurizacion: false,
    codigoBalde: 'BLD-2026-0418',
    registradaEn: iso(HOY, '12:52'),
    tiempoRegistroSeg: 71,
  },
];

const TIPOS: TipoMermaCodigo[] = ['MP', 'EP', 'PT'];

function generarMermas(): Merma[] {
  const r = rng(303);
  const out: Merma[] = [];
  const conMermas = ordenes.filter((o) => o.mermasKg > 0 && o.id !== 'ORD-0815');

  for (const orden of conMermas) {
    const cantidadRegistros = r.int(4, 5);
    const producto = productoPorId.get(orden.productoId);
    /* Se reparte el total de la orden entre los registros con una holgura fija. */
    const pesos = Array.from({ length: cantidadRegistros }, () => r.float(0.7, 1.3, 2));
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    let cursor = sumarMinutos(orden.inicio, 55);

    for (let i = 0; i < cantidadRegistros; i += 1) {
      const cantidadKg = Math.max(0.4, redondear((orden.mermasKg * pesos[i]!) / sumaPesos));
      const tipo = TIPOS[r.int(0, 2)]!;
      const causa = causasMerma.filter((c) => c.aplicaA.includes(tipo))[
        r.int(0, causasMerma.filter((c) => c.aplicaA.includes(tipo)).length - 1)
      ]!;
      out.push({
        id: `MER-${orden.id.slice(4)}-${pad4(i + 1).slice(2)}`,
        ordenId: orden.id,
        lineaId: orden.lineaId,
        tipo,
        cantidadKg,
        sabor: producto?.sabor ?? SABORES[r.int(0, SABORES.length - 1)]!,
        causaId: causa.id,
        responsableId: r.bool(0.4) ? 'USR-04' : (maquinistaPorLinea[orden.lineaId] ?? 'USR-07'),
        codigoBalde: tipo !== 'MP' ? `BLD-2026-${pad4(r.int(100, 899))}` : undefined,
        enviarPasteurizacion: tipo === 'EP' && r.bool(0.7),
        registradaEn: cursor,
        tiempoRegistroSeg: r.int(48, 118),
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
  lineaId: 'LIN-02',
  registradaEn: iso(HOY, '09:10'),
  velocidadReal: 118,
  velocidadEstandar: 120,
  desvioPct: -1.7,
  responsableId: 'USR-02',
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
      const velocidadReal = Math.round(orden.velocidadEstandar * r.float(0.88, 1.05, 3));
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
