/**
 * Hoja de observación del TRI (Anexo 02) a partir de los eventos sincronizados.
 *
 * `EvidenceService.tri()` lee `registro_tiempo`, no las tablas transaccionales:
 * sin filas ahí, la pestaña TRI de «Evidencia de tesis» queda vacía aunque haya
 * miles de paradas y mermas importadas. Este módulo las genera.
 *
 * **Desactivado por defecto** (`--tiempos-tri` lo activa). El TRI de la tesis
 * compara el registro manual en papel (pretest, 2,90 min medidos con hoja de
 * observación) contra el formulario del MES (postest). Volcar aquí los eventos
 * importados atribuye al MES la latencia del sistema anterior —220,8 min de
 * media sobre las 668 paradas de la última ventana— y convierte una reducción
 * del 86,2 % en un «no cumple». El indicador se puebla usando el MES.
 *
 * **Qué mide exactamente este tiempo.** El MES cronometra el formulario
 * (RF14: marca la apertura y el guardado), pero el sistema del que venimos no
 * guarda esa instrumentación: sólo tiene la hora declarada del evento y el
 * `created_at` de la fila. Lo que se puede medir, por tanto, es el **intervalo
 * entre el evento y su registro en el sistema**, que es una cota superior del
 * tiempo de registro, no el mismo indicador. Cada fila lo dice en su
 * `observacion` para que no se confunda con las capturas cronometradas por el
 * MES, y por eso se separan por `tipo`.
 *
 * **Por qué sólo paradas.** De los tres tipos de evento importados, es el único
 * con señal: la merma la graba la app del origen con `hora = ahora`, así que el
 * intervalo es siempre 0, y la lectura de velocidad da 1–2 s, que es la latencia
 * de escritura en la base, no un tiempo de registro. Meterlos rebajaría la media
 * con ceros y haría el indicador irreconocible.
 *
 * Las filas del **pretest** (la hoja física digitalizada que sube el
 * investigador) no se tocan nunca: son el instrumento de referencia.
 */
import type { DataSource } from 'typeorm';
import {
  CausaParada,
  Linea,
  OrdenFabricacion,
  Parada,
  RegistroTiempo,
} from '../../src/database/entities';

/** Prefijo de las filas que crea la sincronización; las demás se respetan. */
const PREFIJO = 'TRI-PO-SYNC-';

const OBSERVACION =
  'Importado del sistema anterior: intervalo entre el evento y su registro ' +
  '(ese sistema no cronometra el formulario)';

interface Evento {
  fecha: string;
  hora: string;
  descripcion: string;
  segundos: number;
  usuarioId: string | null;
}

function horaDe(iso: string): string {
  const hora = iso.slice(11, 19);
  return hora.length === 8 ? hora : `${hora || '00:00'}:00`.slice(0, 8);
}

export interface ResumenTiempos {
  filas: number;
  mediaMin: number;
  medianaMin: number;
}

export async function regenerarHojaTri(destino: DataSource): Promise<ResumenTiempos> {
  const lineas = new Map(
    (await destino.getRepository(Linea).find()).map((l) => [l.id, `${l.codigo} ${l.nombre}`]),
  );
  const causasParada = new Map(
    (await destino.getRepository(CausaParada).find()).map((c) => [c.id, `${c.codigo} ${c.nombre}`]),
  );
  /* La fecha operativa vive en la orden: el turno Noche cruza la medianoche y
   * `parada.inicio` daría el día siguiente. */
  const fechaDeOrden = new Map(
    (await destino.getRepository(OrdenFabricacion).find({ select: { id: true, fecha: true } })).map(
      (o) => [o.id, o.fecha],
    ),
  );

  const eventos: Evento[] = [];

  for (const parada of await destino.getRepository(Parada).find()) {
    eventos.push({
      fecha: fechaDeOrden.get(parada.ordenId) ?? parada.inicio.slice(0, 10),
      hora: horaDe(parada.fin ?? parada.inicio),
      descripcion: `Parada ${causasParada.get(parada.causaId) ?? parada.causaId} · ${lineas.get(parada.lineaId) ?? parada.lineaId}`,
      segundos: parada.tiempoRegistroSeg,
      usuarioId: parada.responsableId,
    });
  }

  /* Sólo entran las paradas con un intervalo medido. */
  const medidos = eventos
    .filter((e) => e.segundos > 0)
    .sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));

  const repo = destino.getRepository(RegistroTiempo);
  const filas = medidos.map((evento, indice) =>
    repo.create({
      id: `${PREFIJO}${String(indice + 1).padStart(5, '0')}`,
      n: indice + 1,
      fecha: evento.fecha,
      eventoRegistrado: evento.descripcion,
      horaInicioRegistro: evento.hora,
      segundos: evento.segundos,
      etapa: 'postest' as const,
      tipo: 'parada',
      usuarioId: evento.usuarioId,
      observacion: OBSERVACION,
    }),
  );

  await destino.transaction(async (gestor) => {
    const tiempos = gestor.getRepository(RegistroTiempo);
    await tiempos
      .createQueryBuilder()
      .delete()
      .where('id LIKE :prefijo', { prefijo: `${PREFIJO}%` })
      .execute();
    for (let i = 0; i < filas.length; i += 500) {
      await tiempos.insert(filas.slice(i, i + 500));
    }
    /* Las capturas cronometradas por el propio MES (`TRI-PO-AUTO-*`) se
     * conservan y se renumeran a continuación para que la hoja quede ordenada. */
    const propias = await tiempos.find({ where: { etapa: 'postest' }, order: { id: 'ASC' } });
    let siguiente = filas.length;
    for (const fila of propias) {
      if (fila.id.startsWith(PREFIJO)) continue;
      siguiente += 1;
      await tiempos.update({ id: fila.id }, { n: siguiente });
    }
  });

  const minutos = filas.map((f) => f.segundos / 60).sort((a, b) => a - b);
  const media = minutos.length ? minutos.reduce((a, b) => a + b, 0) / minutos.length : 0;
  const mediana = minutos.length ? minutos[Math.floor(minutos.length / 2)] : 0;
  return {
    filas: filas.length,
    mediaMin: Math.round(media * 10) / 10,
    medianaMin: Math.round(mediana * 10) / 10,
  };
}
