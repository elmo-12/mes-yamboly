import type { DataSource } from 'typeorm';
import { RegistroTiempo, VerificacionFuncional } from '../entities';
import { fechaMenos, hoy, pad } from './thesis-seed.util';
import type { Seeder } from './seeder.interface';

/**
 * Evidencia de tesis (spec 09, Anexos 02–06) — **sólo la línea base**.
 *
 * Desde la fase 3 no se siembra ningún dato hipotético del postest: los cinco
 * instrumentos arrancan vacíos y se llenan con el uso real del sistema.
 *
 * | Instrumento | Estado inicial | Cómo se llena |
 * | ----------- | -------------- | ------------- |
 * | TRI (02) | 10 filas de **pretest** (2,9 min) | cada captura real emite `evidence.tri.registro` |
 * | TCI (03) | sin evaluaciones | `POST /evidencia/tci/validar` contra las fuentes importadas |
 * | TSP (04) | sin invitaciones ni respuestas | `POST /evidencia/tsp/invitaciones` → `/encuesta/:token` |
 * | CFS (05) | 9 funcionalidades en `cumple: false` | el investigador marca la lista en la web |
 * | EP (06) | sin registros | se crea al confirmar una alerta en Alertas |
 */

/* ------------------------------------------------------------------ */
/* Anexo 02 — TRI (pretest, medición manual en hoja de cálculo)        */
/* ------------------------------------------------------------------ */

const EVENTOS_PRETEST = [
  'Parada PP-01-10 · LLEN-A1 Llenadora A1',
  'Merma EP 3,2 kg · LLEN-A1 Llenadora A1',
  'Velocidad 131 u/min · LLEN-A1 Llenadora A1',
  'Parada PN-04-01 · LLEN-A1 Llenadora A1',
  'Parada PN-02-01 · LLEN-A1 Llenadora A1',
  'Merma PT 1,8 kg · LLEN-A1 Llenadora A1',
  'Parada PN-04-14 · LLEN-A1 Llenadora A1',
  'Inicio de orden OF-2026-0814 · LLEN-M2 Llenadora M2',
  'Parada PN-02-02 · MOLD-A3 Moldeadora A3',
  'Merma EP 2,4 kg · EXTR-2 Extrusora 2',
];
const TIPOS_PRETEST = ['parada', 'merma', 'velocidad', 'parada', 'parada', 'merma', 'parada', 'orden', 'parada', 'merma'];
const HORAS_PRETEST = ['07:45:00', '11:12:00', '09:18:00', '09:31:00', '11:26:00', '13:02:00', '12:49:00', '06:09:00', '13:56:00', '10:40:00'];
/** Segundos cronometrados a mano: media 174 s = **2,9 min** (línea base). */
const SEGUNDOS_PRETEST = [168, 186, 162, 204, 156, 180, 174, 150, 192, 168];

/* ------------------------------------------------------------------ */
/* Anexo 04 — TSP (enunciados del cuestionario, sin respuestas)        */
/* ------------------------------------------------------------------ */

export const ITEMS_TSP = [
  'El sistema me permite registrar la producción en menos tiempo que antes.',
  'Los formularios de registro de paradas son claros y fáciles de completar.',
  'La información de mermas que registro queda correctamente clasificada.',
  'El tablero de tiempo real me muestra el estado de mi línea sin buscar en otro lado.',
  'Los indicadores del sistema me ayudan a tomar decisiones durante el turno.',
  'Las alertas del sistema llegan con suficiente anticipación para actuar.',
  'Confío en que los datos que muestra el sistema reflejan lo que ocurre en planta.',
  'Recomendaría seguir usando el sistema en mi área de trabajo.',
];

/* ------------------------------------------------------------------ */
/* Anexo 05 — CFS (lista de cotejo, toda sin verificar)                */
/* ------------------------------------------------------------------ */

const VERIFICACIONES_CFS = [
  { rf: 'RF1', funcionalidad: 'Captura de datos productivos', ruta: '/tiempo-real' },
  { rf: 'RF2', funcionalidad: 'Registro de producción', ruta: '/ordenes' },
  { rf: 'RF3', funcionalidad: 'Registro de paradas', ruta: '/ordenes/ORD-0815' },
  { rf: 'RF4', funcionalidad: 'Registro de mermas', ruta: '/ordenes/ORD-0815' },
  { rf: 'RF5', funcionalidad: 'Repositorio centralizado', ruta: '/ordenes' },
  { rf: 'RF6', funcionalidad: 'Dashboard en tiempo real', ruta: '/tiempo-real' },
  { rf: 'RF7', funcionalidad: 'Indicadores', ruta: '/reportes' },
  { rf: 'RF8', funcionalidad: 'Analítica con IA', ruta: '/analitica' },
  { rf: 'RF9', funcionalidad: 'Alertas', ruta: '/alertas' },
];

export class ThesisEvidenceSeeder implements Seeder {
  readonly name = 'evidencia de tesis (Anexo 02 pretest + Anexo 05 lista de cotejo)';

  async run(dataSource: DataSource): Promise<void> {
    await this.seedPretestTri(dataSource);
    await this.seedCfs(dataSource);
  }

  /** Única evidencia sembrada: la hoja de pretest medida a mano. */
  private async seedPretestTri(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(RegistroTiempo);
    if (await repo.count()) return;
    await repo.save(
      SEGUNDOS_PRETEST.map((segundos, i) =>
        repo.create({
          id: `TRI-PR-${pad(i + 1)}`,
          n: i + 1,
          fecha: fechaMenos(30 + i),
          eventoRegistrado: EVENTOS_PRETEST[i]!,
          horaInicioRegistro: HORAS_PRETEST[i]!,
          segundos,
          etapa: 'pretest' as const,
          tipo: TIPOS_PRETEST[i]!,
          observacion: 'Registro manual en hoja de cálculo',
        }),
      ),
    );
  }

  /** Las 9 funcionalidades arrancan sin verificar: el CFS es 0 / 9. */
  private async seedCfs(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(VerificacionFuncional);
    if (await repo.count()) return;
    await repo.save(
      VERIFICACIONES_CFS.map((v, i) =>
        repo.create({ id: `CFS-${i + 1}`, n: i + 1, cumple: false, observacion: '', ...v }),
      ),
    );
  }
}

/** Fecha de hoy usada por los registros TRI creados en caliente. */
export const fechaHoy = hoy;
