import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CausaParada,
  Linea,
  OrdenFabricacion,
  Parada,
  Producto,
  User,
} from '../../src/database/entities';

/** Línea y turno del patrón plantado: `LLEN-M2` en Noche siempre para. */
export const LINEA_PLANTADA = 'LIN-LLEN-M2';
export const TURNO_PLANTADO = 'N';

/** Días del patrón; se sitúan **antes** del corpus sembrado para no pisarlo. */
export const DIAS_PLANTADOS = 30;
const PRIMER_DIA = '2026-07-01';

/** Minutos de la parada plantada: muy por encima de cualquier mediana del corpus. */
const MINUTOS_PARADA = 150;

function fechaMas(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PatronPlantado {
  lineaCodigo: string;
  turnos: number;
  minutosPorTurno: number;
}

/**
 * Siembra un patrón conocido y determinista: durante 30 días la línea `LLEN-M2`
 * para siempre en turno Noche (150 min de causa imprevista) y nunca en turno
 * Día. Es la prueba fuerte del pipeline: no se comprueba que devuelva *algo*,
 * sino que **descubra** una regularidad que sabemos que está.
 */
export async function plantarPatron(app: INestApplication): Promise<PatronPlantado> {
  const ds = app.get(DataSource);
  const linea = await ds.getRepository(Linea).findOneOrFail({ where: { id: LINEA_PLANTADA } });
  const producto = await ds.getRepository(Producto).findOneOrFail({ where: {}, order: { id: 'ASC' } });
  const usuario = await ds.getRepository(User).findOneOrFail({ where: {}, order: { id: 'ASC' } });

  const causas = await ds.getRepository(CausaParada).find();
  const porId = new Map(causas.map((c) => [c.id, c]));
  const tipo = causas.find((c) => c.nivel === 'tipo' && c.clasificacion === 'imprevista' && c.afectaOee);
  if (!tipo) throw new Error('El maestro no tiene ninguna causa raíz imprevista');
  const hoja =
    causas.find((c) => c.nivel === 'especifica' && raiz(c, porId) === tipo.id) ?? tipo;

  const ordenes: OrdenFabricacion[] = [];
  const paradas: Parada[] = [];
  const repoOrden = ds.getRepository(OrdenFabricacion);
  const repoParada = ds.getRepository(Parada);

  for (let i = 0; i < DIAS_PLANTADOS; i += 1) {
    const fecha = fechaMas(PRIMER_DIA, i);
    for (const turno of ['D', 'N'] as const) {
      const id = `OF-FIX-${String(i).padStart(2, '0')}-${turno}`;
      ordenes.push(
        repoOrden.create({
          id,
          codigo: id,
          fecha,
          lineaId: linea.id,
          productoId: producto.id,
          turno,
          lote: `L-FIX-${i}`,
          vencimiento: fechaMas(fecha, 180),
          planificado: 20_000,
          producido: turno === 'N' ? 15_000 : 19_000,
          conteoCodificadora: turno === 'N' ? 15_000 : 19_000,
          velocidadEstandar: 50,
          velocidadEstandarId: null,
          estado: 'cerrada',
          maquinistaId: usuario.id,
          supervisorId: usuario.id,
          operarios: 2,
          colaboradores: [],
          oee:
            turno === 'N'
              ? { oee: 55, disponibilidad: 79, desempeno: 72, calidad: 98 }
              : { oee: 88, disponibilidad: 100, desempeno: 90, calidad: 98 },
          paradasCount: turno === 'N' ? 1 : 0,
          mermasKg: 0,
          inicio: `${fecha}T${turno === 'D' ? '06' : '18'}:00:00`,
          fin: turno === 'D' ? `${fecha}T18:00:00` : `${fechaMas(fecha, 1)}T06:00:00`,
        }),
      );
      if (turno !== TURNO_PLANTADO) continue;
      paradas.push(
        repoParada.create({
          id: `PAR-FIX-${String(i).padStart(2, '0')}`,
          ordenId: id,
          lineaId: linea.id,
          causaId: hoja.id,
          tipoCausaId: tipo.id,
          inicio: `${fecha}T20:00:00`,
          fin: `${fecha}T22:30:00`,
          duracionMin: MINUTOS_PARADA,
          accionTomada: 'Patrón plantado por el fixture de analítica',
          afectaOee: true,
          responsableId: usuario.id,
          origen: 'manual',
          tiempoRegistroSeg: 30,
        }),
      );
    }
  }

  await repoOrden.save(ordenes, { chunk: 50 });
  await repoParada.save(paradas, { chunk: 50 });
  return {
    lineaCodigo: linea.codigo,
    turnos: ordenes.length,
    minutosPorTurno: MINUTOS_PARADA,
  };
}

/** Sube por `parentId` hasta la causa raíz (`nivel = 'tipo'`). */
function raiz(causa: CausaParada, porId: Map<string, CausaParada>): string {
  let actual: CausaParada | undefined = causa;
  const vistos = new Set<string>();
  while (actual && actual.nivel !== 'tipo' && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return actual?.id ?? causa.id;
}
