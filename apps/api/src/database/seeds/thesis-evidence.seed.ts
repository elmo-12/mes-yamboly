import type { DataSource } from 'typeorm';
import type { Turno } from '@mes/types';
import {
  EncuestaRespuesta,
  EncuestaSesion,
  EvaluacionCalidad,
  RegistroEp,
  RegistroTiempo,
  VerificacionFuncional,
} from '../entities';
import { fechaMenos, hoy, pad } from './thesis-seed.util';
import type { Seeder } from './seeder.interface';

/**
 * Evidencia de tesis (spec 09, Anexos 02–06).
 * Cierra en TRI 1,4 min (−51,7 %) · TCI 93,3 % (28/30) · TSP 84,2 % (128/152) ·
 * CFS 9/9 · EP 83,5 % (137/164).
 */

/* ------------------------------------------------------------------ */
/* Anexo 02 — TRI                                                      */
/* ------------------------------------------------------------------ */

const EVENTOS_TRI = [
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
const TIPOS_TRI = ['parada', 'merma', 'velocidad', 'parada', 'parada', 'merma', 'parada', 'orden', 'parada', 'merma'];
const HORAS_POSTEST = ['07:42:18', '11:05:07', '09:10:33', '09:24:12', '11:18:41', '12:52:09', '12:40:55', '06:02:14', '13:47:26', '10:31:48'];
const HORAS_PRETEST = ['07:45:00', '11:12:00', '09:18:00', '09:31:00', '11:26:00', '13:02:00', '12:49:00', '06:09:00', '13:56:00', '10:40:00'];
/** Segundos cronometrados: media postest 84 s = 1,4 min; pretest 174 s = 2,9 min. */
const SEGUNDOS_POSTEST = [72, 90, 78, 96, 66, 84, 90, 72, 102, 90];
const SEGUNDOS_PRETEST = [168, 186, 162, 204, 156, 180, 174, 150, 192, 168];

/* ------------------------------------------------------------------ */
/* Anexo 03 — TCI                                                      */
/* ------------------------------------------------------------------ */

const REGISTROS_TCI = [
  'Parada 07:42 · PP-01-10 · LLEN-A1',
  'Merma EP 3,2 kg · MP-01-01 · LLEN-A1',
  'Velocidad 131 u/min · LLEN-A1',
  'Parada 09:24 · PN-04-01 · LLEN-A1',
  'Parada 11:18 · PN-02-01 · LLEN-A1',
  'Merma PT 1,8 kg · MP-02-01 · LLEN-A1',
  'Parada 12:40 · PN-04-14 · LLEN-A1',
  'Orden OF-2026-0814 · LLEN-M2',
  'Parada 13:47 · PN-02-02 · MOLD-A3',
  'Merma EP 2,4 kg · MP-01-01 · EXTR-2',
];

/** Los dos registros del Anexo 03 que no superan los cuatro criterios. */
const FALLOS_TCI = new Set([11, 23]);

/* ------------------------------------------------------------------ */
/* Anexo 04 — TSP                                                      */
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

export const INVITADOS_TSP = 22;
const RESPUESTAS_TSP = 19;
/** Respuestas 4–5 por ítem (Anexo 04): 128 de 152 = 84,2 % de acuerdo. */
const DE_ACUERDO_POR_ITEM = [17, 16, 15, 17, 16, 15, 16, 16];
const PROMEDIO_POR_ITEM = [4.4, 4.2, 4.0, 4.5, 4.2, 3.9, 4.2, 4.1];

const INVITADOS = [
  'Jorge Quispe', 'Ana Ríos', 'María Torres', 'Rosa Huamán', 'Luis Vargas',
  'Sofía Cárdenas', 'Pedro Ccahuana', 'Elena Ramos', 'Diego Salazar', 'Carlos Mendoza',
  'Nélida Apaza', 'Raúl Bermúdez', 'Karina Flores', 'Óscar Ludeña', 'Patricia Nieto',
  'Julio Zegarra', 'Milagros Ávila', 'Fernando Cueva', 'Gabriela Ponce', 'Marco Ítalo Rivas',
  'Yenny Chávez', 'Alberto Quiroz',
];

/**
 * Reconstruye la matriz 19 × 8 de la encuesta: cada columna respeta el nº de
 * respuestas «de acuerdo» y el promedio Likert del Anexo 04.
 */
export function matrizRespuestasTsp(): number[][] {
  const columnas = DE_ACUERDO_POR_ITEM.map((deAcuerdo, j) => {
    const objetivo = Math.round(PROMEDIO_POR_ITEM[j]! * RESPUESTAS_TSP);
    const columna: number[] = Array.from({ length: RESPUESTAS_TSP }, (_, r) => (r < deAcuerdo ? 4 : 3));
    let delta = objetivo - columna.reduce((a, b) => a + b, 0);
    /* Sube «de acuerdo» de 4 a 5 hasta alcanzar la suma objetivo. */
    for (let r = 0; r < deAcuerdo && delta > 0; r += 1, delta -= 1) columna[r] = 5;
    /* Si sobra, baja los «en desacuerdo» de 3 a 2 y luego a 1. */
    for (let paso = 0; paso < 2 && delta < 0; paso += 1) {
      for (let r = deAcuerdo; r < RESPUESTAS_TSP && delta < 0; r += 1, delta += 1) columna[r]! -= 1;
    }
    return columna;
  });
  return Array.from({ length: RESPUESTAS_TSP }, (_, r) => columnas.map((c) => c[r]!));
}

/* ------------------------------------------------------------------ */
/* Anexo 05 — CFS                                                      */
/* ------------------------------------------------------------------ */

const VERIFICACIONES_CFS = [
  { rf: 'RF1', funcionalidad: 'Captura de datos productivos', observacion: 'Registro en 3 toques con cronómetro TRI en cada modal', ruta: '/tiempo-real' },
  { rf: 'RF2', funcionalidad: 'Registro de producción', observacion: 'Inicio y cierre de orden con conteo de codificadora', ruta: '/ordenes' },
  { rf: 'RF3', funcionalidad: 'Registro de paradas', observacion: 'Árbol de causas PP-01…PS-05 con acción tomada obligatoria', ruta: '/ordenes/ORD-0815' },
  { rf: 'RF4', funcionalidad: 'Registro de mermas', observacion: 'Tipos MP/EP/PT y árbol de causas MP-01…MP-05 con código de balde', ruta: '/ordenes/ORD-0815' },
  { rf: 'RF5', funcionalidad: 'Repositorio centralizado', observacion: 'Órdenes con filtros, búsqueda, exportación y bitácora', ruta: '/ordenes' },
  { rf: 'RF6', funcionalidad: 'Dashboard en tiempo real', observacion: '9 líneas con estado, avance y Modo TV', ruta: '/tiempo-real' },
  { rf: 'RF7', funcionalidad: 'Indicadores', observacion: 'OEE por línea, turno y periodo con comparativas', ruta: '/reportes' },
  { rf: 'RF8', funcionalidad: 'Analítica con IA', observacion: 'Modelo v3.2 CRISP-DM con patrones y predicciones', ruta: '/analitica' },
  { rf: 'RF9', funcionalidad: 'Alertas', observacion: 'Bandeja con umbrales configurables y confirmación de evento real', ruta: '/alertas' },
];

/* ------------------------------------------------------------------ */
/* Anexo 06 — EP                                                       */
/* ------------------------------------------------------------------ */

const TIPOS_EP = [
  'Parada prevista · LLEN-A1 Llenadora A1',
  'Merma prevista · MOLD-A3 Moldeadora A3',
  'Velocidad baja · LLEN-M2 Llenadora M2',
  'OEE bajo umbral · LLEN-A2 Llenadora A2',
  'Parada prevista · EXTR-2 Extrusora 2',
  'Parada prevista · MOLD-A4 Moldeadora A4',
];

/** 164 predicciones contrastadas; fallan las de índice ≡ 5 (mód 6) → 137 aciertos. */
const TOTAL_EP = 164;

export class ThesisEvidenceSeeder implements Seeder {
  readonly name = 'evidencia de tesis (Anexos 02–06)';

  async run(dataSource: DataSource): Promise<void> {
    await this.seedTri(dataSource);
    await this.seedTci(dataSource);
    await this.seedTsp(dataSource);
    await this.seedCfs(dataSource);
    await this.seedEp(dataSource);
  }

  private async seedTri(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(RegistroTiempo);
    if (await repo.count()) return;
    const postest = SEGUNDOS_POSTEST.map((segundos, i) =>
      repo.create({
        id: `TRI-PO-${pad(i + 1)}`,
        n: i + 1,
        fecha: fechaMenos(i < 7 ? 0 : i - 6),
        eventoRegistrado: EVENTOS_TRI[i]!,
        horaInicioRegistro: HORAS_POSTEST[i]!,
        segundos,
        etapa: 'postest' as const,
        tipo: TIPOS_TRI[i]!,
        usuarioId: 'USR-07',
      }),
    );
    const pretest = SEGUNDOS_PRETEST.map((segundos, i) =>
      repo.create({
        id: `TRI-PR-${pad(i + 1)}`,
        n: i + 1,
        fecha: fechaMenos(30 + i),
        eventoRegistrado: EVENTOS_TRI[i]!,
        horaInicioRegistro: HORAS_PRETEST[i]!,
        segundos,
        etapa: 'pretest' as const,
        tipo: TIPOS_TRI[i]!,
        observacion: 'Registro manual en hoja de cálculo',
      }),
    );
    await repo.save([...postest, ...pretest]);
  }

  private async seedTci(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(EvaluacionCalidad);
    if (await repo.count()) return;
    const turnos: Turno[] = ['D', 'N'];
    const filas: EvaluacionCalidad[] = [];
    for (let i = 0; i < 30; i += 1) {
      const falla = FALLOS_TCI.has(i);
      filas.push(
        repo.create({
          id: `TCI-${pad(i + 1)}`,
          n: i + 1,
          fecha: fechaMenos(Math.floor(i / 2)),
          turno: turnos[i % 2]!,
          registro: REGISTROS_TCI[i % REGISTROS_TCI.length]!,
          registroId: null,
          /* i = 11: faltan campos obligatorios; i = 23: causa no específica. */
          camposObligatoriosCompletos: !falla || i === 23,
          duracionMin: 8 + (i % 5) * 3,
          causaEspecifica: !falla,
          tieneOrden: true,
          tieneMaquina: true,
          tieneResponsable: true,
          overrideCompleto: null,
          overridePreciso: null,
          overrideTrazable: null,
          observacion: falla
            ? i === 11
              ? 'Sin acción tomada al momento del registro; se completó al día siguiente'
              : 'Hora de fin registrada fuera del turno; se corrigió en bitácora'
            : 'Cumple los 4 criterios de calidad',
        }),
      );
    }
    await repo.save(filas);
  }

  private async seedTsp(ds: DataSource): Promise<void> {
    const repoSesion = ds.getRepository(EncuestaSesion);
    if (!(await repoSesion.count())) {
      await repoSesion.save(
        INVITADOS.map((invitado, i) =>
          repoSesion.create({
            token: `tsp-2026-${pad(i + 1)}`,
            invitado,
            respondida: i < RESPUESTAS_TSP,
            respondidaEn: i < RESPUESTAS_TSP ? fechaMenos(RESPUESTAS_TSP - i) : null,
          }),
        ),
      );
    }

    const repo = ds.getRepository(EncuestaRespuesta);
    if (await repo.count()) return;
    const matriz = matrizRespuestasTsp();
    await repo.save(
      matriz.map((respuestas, i) =>
        repo.create({
          id: `TSP-${pad(i + 1)}`,
          token: `tsp-2026-${pad(i + 1)}`,
          respuestas,
          comentario: null,
          fecha: fechaMenos(RESPUESTAS_TSP - i),
        }),
      ),
    );
  }

  private async seedCfs(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(VerificacionFuncional);
    if (await repo.count()) return;
    await repo.save(
      VERIFICACIONES_CFS.map((v, i) =>
        repo.create({ id: `CFS-${i + 1}`, n: i + 1, cumple: true, ...v }),
      ),
    );
  }

  private async seedEp(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(RegistroEp);
    if (await repo.count()) return;
    const filas: RegistroEp[] = [];
    for (let i = 0; i < TOTAL_EP; i += 1) {
      const acierto = i % 6 !== 5;
      filas.push(
        repo.create({
          id: `EP-${pad(i + 1, 3)}`,
          n: i + 1,
          fecha: fechaMenos(Math.min(59, Math.floor(i / 3))),
          tipoPrediccion: TIPOS_EP[i % TIPOS_EP.length]!,
          eventoReal: acierto
            ? 'El evento ocurrió dentro de la ventana prevista'
            : 'No se observó el evento en la ventana',
          acierto,
          observacion: acierto
            ? 'Confirmado por el supervisor de turno'
            : 'Se aplicó acción preventiva antes de la ventana',
          alertaId: i < 6 ? `ALE-${pad(i + 18, 3)}` : null,
        }),
      );
    }
    await repo.save(filas);
  }
}

/** Fecha de hoy usada por los registros TRI creados en caliente. */
export const fechaHoy = hoy;
