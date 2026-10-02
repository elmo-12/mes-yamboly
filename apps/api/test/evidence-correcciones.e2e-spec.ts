import type { INestApplication } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CREDENCIALES, crearApp, login } from './app.factory';

/**
 * Regresiones de la ronda de QA de la evidencia de tesis (octubre 2026).
 * Un bloque por bug de backend corregido; el número es el del informe de QA.
 */

const CRED = {
  investigador: { email: 'investigador@yamboly.lat', password: 'Yamboly2026' },
  supervisor: { email: 'ana.rios@yamboly.lat', password: 'Yamboly2026' },
  calidad: { email: 'rosa.huaman@yamboly.lat', password: 'Yamboly2026' },
};

async function xlsx(cabeceras: string[], filas: (string | number | Date | null)[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Datos');
  hoja.addRow(cabeceras);
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const csv = (texto: string) => Buffer.from(texto, 'utf8');

describe('evidencia · correcciones de QA (e2e)', () => {
  let app: INestApplication;
  let jefe: string;
  let maquinista: string;
  let supervisor: string;
  let calidad: string;

  beforeAll(async () => {
    app = await crearApp();
    jefe = await login(app, CREDENCIALES.jefe);
    maquinista = await login(app, CREDENCIALES.maquinista);
    supervisor = await login(app, CRED.supervisor);
    calidad = await login(app, CRED.calidad);
  });

  afterAll(async () => {
    await app.close();
  });

  const como = (token: string | null) => ({
    get: (ruta: string) => {
      const r = request(app.getHttpServer()).get(`/api/v1${ruta}`);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    post: (ruta: string) => {
      const r = request(app.getHttpServer()).post(`/api/v1${ruta}`);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
    patch: (ruta: string) => {
      const r = request(app.getHttpServer()).patch(`/api/v1${ruta}`);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
  });
  const api = () => como(jefe);
  const importar = (tipo: string, archivo: Buffer, nombre: string) =>
    api().post(`/evidencia/fuentes/${tipo}/importar`).attach('archivo', archivo, nombre);

  /* ---------------------------------------------------------------- */
  /* Bug 1 · el pretest no se pierde                                   */
  /* ---------------------------------------------------------------- */

  describe('bug 1 · carga del pretest', () => {
    const fila = (cambios: Record<string, unknown>) => ({
      fecha: '2026-08-24',
      eventoRegistrado: 'Evento QA',
      horaInicioRegistro: '08:00',
      tiempoMin: 3,
      ...cambios,
    });

    it.each([
      ['tiempo enorme (desbordaba int4 y dejaba el pretest vacío)', { tiempoMin: 100_000_000 }, 'tiempoMin'],
      ['tiempo mayor que 60 min', { tiempoMin: 61 }, 'tiempoMin'],
      ['fecha que no existe', { fecha: '2026-02-31' }, 'fecha'],
      ['hora imposible', { horaInicioRegistro: '99:99' }, 'horaInicioRegistro'],
    ])('rechaza %s con 422 y conserva las 10 filas', async (_caso, cambios, campo) => {
      const { body } = await api()
        .post('/evidencia/tri/pretest')
        .send({ registros: [fila({}), fila(cambios)] })
        .expect(422);
      expect(JSON.stringify(body.details)).toContain(campo);

      const tri = await api().get('/evidencia/tri').expect(200);
      expect(tri.body.pretest).toHaveLength(10);
      expect(tri.body.promedioPretest).toBe(2.9);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bugs 2 y 17 · tokens no adivinables y roles                        */
  /* ---------------------------------------------------------------- */

  describe('bugs 2 y 17 · encuesta y roles de la evidencia', () => {
    it('las invitaciones usan tokens aleatorios distintos', async () => {
      const a = await api().post('/evidencia/tsp/invitaciones').send({ usuarioId: 'USR-07' }).expect(201);
      const b = await api().post('/evidencia/tsp/invitaciones').send({ usuarioId: 'USR-08' }).expect(201);
      for (const r of [a, b]) expect(r.body.invitacion.token).toMatch(/^tsp-[A-Za-z0-9_-]{22}$/);
      expect(a.body.invitacion.token).not.toBe(b.body.invitacion.token);
      /* La encuesta pública sigue funcionando con el token nuevo. */
      await como(null).get(`/encuesta/${a.body.invitacion.token}`).expect(200);
    });

    it('sólo jefe e investigador leen tokens, fichas y exportan', async () => {
      for (const token of [maquinista, supervisor, calidad]) {
        await como(token).get('/evidencia/tsp').expect(403);
        await como(token).get('/evidencia/tci').expect(403);
        await como(token).get('/evidencia/cfs').expect(403);
        await como(token).post('/evidencia/exportar').send({ kpis: ['TSP'] }).expect(403);
      }
      await como(maquinista).get('/evidencia/resumen').expect(403);
      await como(null).get('/evidencia/tsp').expect(401);
      const investigador = await login(app, CRED.investigador);
      await como(investigador).get('/evidencia/tsp').expect(200);
    });

    it('el resumen agregado (Home) sigue abierto a supervisor y calidad, sin tokens', async () => {
      for (const token of [supervisor, calidad]) {
        const { body } = await como(token).get('/evidencia/resumen').expect(200);
        expect(body.kpis).toHaveLength(5);
        expect(JSON.stringify(body)).not.toContain('tsp-');
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 3 · exactamente 8 respuestas                                  */
  /* ---------------------------------------------------------------- */

  describe('bug 3 · respuestas de la encuesta', () => {
    it('rechaza más de 8 respuestas y un doble envío simultáneo da un 201 y 409s', async () => {
      const { body } = await api().post('/evidencia/tsp/invitaciones').send({ usuarioId: 'USR-09' }).expect(201);
      const token = body.invitacion.token as string;

      await como(null)
        .post(`/encuesta/${token}`)
        .send({ respuestas: Array(20).fill(1) })
        .expect(422);

      const envios = await Promise.all(
        [5, 1, 2].map((v) => como(null).post(`/encuesta/${token}`).send({ respuestas: Array(8).fill(v) })),
      );
      const estados = envios.map((r) => r.status).sort();
      expect(estados).toEqual([201, 409, 409]);

      const tsp = await api().get('/evidencia/tsp').expect(200);
      expect(tsp.body.respuestas).toBe(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bugs 4 y 7 · fechas de las fuentes                                */
  /* ---------------------------------------------------------------- */

  describe('bugs 4 y 7 · fechas de las fuentes externas', () => {
    it('la celda fecha de Excel es hora de pared y las fechas imposibles se rechazan', async () => {
      const archivo = await xlsx(
        ['linea', 'fecha_hora', 'estado'],
        [
          /* exceljs escribe/lee las celdas fecha en UTC: 10:18 escrito = 10:18 importado. */
          ['MOLD-A2', new Date(Date.UTC(2026, 8, 11, 10, 18, 0)), 'PARADA'],
          ['MOLD-A2', '11/09/2026 7:05 PM', 'PRODUCIENDO'],
          ['MOLD-A2', '31/02/2026 10:00', 'PARADA'],
          ['MOLD-A2', '2026-13-45 10:00', 'PARADA'],
          ['MOLD-A2', '11/09/2026 25:70', 'PARADA'],
          ['MOLD-A2', '11/09/2026 13:00 PM', 'PARADA'],
        ],
      );
      const { body } = await importar('sensores', archivo, 'fechas.xlsx').expect(201);
      expect(body.filasOk).toBe(2);
      expect(body.rechazos.map((r: { fila: number }) => r.fila)).toEqual([4, 5, 6, 7]);
      expect(body.periodo).toEqual({ desde: '2026-09-11', hasta: '2026-09-11' });

      const ds = app.get(DataSource);
      const filas = (await ds.query(
        `SELECT "fechaHora" FROM lectura_sensor WHERE "importacionId" = ? ORDER BY "fechaHora"`,
        [body.id],
      )) as { fechaHora: string }[];
      expect(filas.map((f) => f.fechaHora)).toEqual(['2026-09-11T10:18:00', '2026-09-11T19:05:00']);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 6 · TRI postest robusto                                        */
  /* ---------------------------------------------------------------- */

  describe('bug 6 · TRI postest', () => {
    it('descarta filas con fecha inválida o tiempo fuera de rango y numera sin duplicados', async () => {
      const ds = app.get(DataSource);
      const insertar = (id: string, n: number, fecha: string, segundos: number) =>
        ds.query(
          `INSERT INTO registro_tiempo (id, n, fecha, "eventoRegistrado", "horaInicioRegistro", segundos, etapa, tipo)
           VALUES (?, ?, ?, 'QA', '10:00:00', ?, 'postest', 'parada')`,
          [id, n, fecha, segundos],
        );
      await insertar('TRI-QA-OK-1', 7, '2026-09-11', 60);
      await insertar('TRI-QA-OK-2', 7, '2026-09-11', 120);
      await insertar('TRI-QA-FECHA', 8, 'abc', 30);
      await insertar('TRI-QA-HORA', 9, '14:05', 30);
      await insertar('TRI-QA-ENORME', 10, '2026-09-11', 99_999_999);

      const { body } = await api().get('/evidencia/tri').expect(200);
      const ids = (body.postest as { id: string; n: number }[]).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['TRI-QA-OK-1', 'TRI-QA-OK-2']));
      expect(ids).not.toEqual(expect.arrayContaining(['TRI-QA-FECHA']));
      expect(body.descartadosPostest).toBeGreaterThanOrEqual(3);
      const ns = (body.postest as { n: number }[]).map((r) => r.n);
      expect(new Set(ns).size).toBe(ns.length);
      expect(body.promedioPostest).toBeLessThan(60);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bugs 9 y 10 · archivos ilegibles e importaciones concurrentes      */
  /* ---------------------------------------------------------------- */

  describe('bugs 9 y 10 · importación robusta', () => {
    it.each([
      ['0 bytes', Buffer.alloc(0)],
      ['PDF renombrado', Buffer.from('%PDF-1.4 esto no es un xlsx')],
      ['ZIP cortado', Buffer.from('PK\u0003\u0004 cortado a la mitad')],
    ])('un .xlsx %s es 422, no 500', async (_caso, contenido) => {
      const { body } = await importar('sensores', contenido, 'roto.xlsx').expect(422);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details.archivo).toBeDefined();
    });

    it('importaciones simultáneas no dan 500 ni duplican', async () => {
      const a = csv('numero_solicitud,fecha,linea,tipo,estado\nSM-PAR-1,2026-09-12,EXTR-2,MANTENIMIENTO,ABIERTA\n');
      const b = csv(
        'numero_solicitud,fecha,linea,tipo,estado\nSM-PAR-1,2026-09-12,EXTR-2,MANTENIMIENTO,ABIERTA\nSM-PAR-2,2026-09-12,EXTR-2,MANTENIMIENTO,ABIERTA\n',
      );
      const respuestas = await Promise.all([
        importar('solicitudes', a, 'a.csv'),
        importar('solicitudes', b, 'b.csv'),
        importar('solicitudes', a, 'a.csv'),
      ]);
      expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201]);
      const ids = respuestas.map((r) => r.body.id as string);
      expect(new Set(ids).size).toBe(3);
      const totalOk = respuestas.reduce((s, r) => s + (r.body.filasOk as number), 0);
      expect(totalOk).toBe(2);
    });

    it('un archivo de más de 5 MB es 413 con mensaje en español', async () => {
      const grande = Buffer.alloc(5 * 1024 * 1024 + 10, 'a');
      const { body } = await importar('sensores', grande, 'grande.csv').expect(413);
      expect(body.details.archivo).toContain('5 MB');
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 11 · overrides del TCI                                        */
  /* ---------------------------------------------------------------- */

  describe('bug 11 · override del Anexo 03', () => {
    let id: string;

    beforeAll(async () => {
      await api().post('/evidencia/tci/validar').send({ desde: '2026-08-28', hasta: '2026-08-28' }).expect(200);
      const { body } = await api().get('/evidencia/tci?tipo=parada&pageSize=1').expect(200);
      id = body.data[0].id;
    });

    it('rechaza valores no booleanos, criterios que no aplican y la falta de justificación', async () => {
      await api().patch(`/evidencia/tci/${id}`).send({ overrides: { completo: 'no' }, observacion: 'x' }).expect(422);
      await api().patch(`/evidencia/tci/${id}`).send({ overrides: { sap: true }, observacion: 'x' }).expect(422);
      await api().patch(`/evidencia/tci/${id}`).send({ overrides: { foo: true }, observacion: 'x' }).expect(422);
      const sinJustificar = await api().patch(`/evidencia/tci/${id}`).send({ overrides: { sensor: true } }).expect(422);
      expect(sinJustificar.body.details.observacion).toBeDefined();
    });

    it('el rol calidad ya no puede forzar criterios (igual que la web)', async () => {
      await como(calidad).patch(`/evidencia/tci/${id}`).send({ overrides: { sensor: true }, observacion: 'x' }).expect(403);
    });

    it('un override válido expone el resultado de la regla en `cumpleRegla`', async () => {
      const { body } = await api()
        .patch(`/evidencia/tci/${id}`)
        .send({ overrides: { sensor: true }, observacion: 'Sensor fuera de servicio ese turno' })
        .expect(200);
      const sensor = body.item.criterios.find((c: { clave: string }) => c.clave === 'sensor');
      expect(sensor).toMatchObject({ cumple: true, override: true });
      expect(typeof sensor.cumpleRegla).toBe('boolean');
      await api().patch(`/evidencia/tci/${id}`).send({ overrides: { sensor: null } }).expect(200);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 13 · CFS                                                       */
  /* ---------------------------------------------------------------- */

  describe('bug 13 · lista de cotejo', () => {
    it('una observación sola no verifica la funcionalidad y omitirla la conserva', async () => {
      const nota = await api().patch('/evidencia/cfs/CFS-8').send({ observacion: 'Pendiente de revisar' }).expect(200);
      expect(nota.body.item).toMatchObject({ cumple: false, verificadaEn: null, observacion: 'Pendiente de revisar' });

      const verificada = await api().patch('/evidencia/cfs/CFS-8').send({ cumple: true }).expect(200);
      expect(verificada.body.item.observacion).toBe('Pendiente de revisar');
      expect(verificada.body.item.verificadaEn).toEqual(expect.any(String));

      await api().patch('/evidencia/cfs/CFS-8').send({}).expect(422);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 16 · hoja CFS exportada con la verificación                   */
  /* ---------------------------------------------------------------- */

  describe('bug 16 · exportación', () => {
    it('la hoja CFS incluye «Verificada» y «Verificada en»', async () => {
      const { body } = await api()
        .post('/evidencia/exportar')
        .send({ kpis: ['CFS'], formato: 'xlsx', destino: 'informe' })
        .expect(202);

      let url: string | undefined;
      for (let i = 0; i < 40 && !url; i += 1) {
        const lista = await api().get('/reportes/exportaciones').expect(200);
        const job = (lista.body.data as { id: string; estado: string; url?: string }[]).find((j) => j.id === body.id);
        if (job?.estado === 'listo') url = job.url;
        else await new Promise((r) => setTimeout(r, 100));
      }
      expect(url).toBeDefined();
      const archivo = await api()
        .get(url!)
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (c: Buffer) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(archivo.body as ArrayBuffer);
      const cabecera = libro.worksheets[0]!.getRow(1).values as unknown[];
      expect(cabecera).toEqual(expect.arrayContaining(['Verificada', 'Verificada en', 'Cumple']));
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bug 18 · conflictos visibles                                       */
  /* ---------------------------------------------------------------- */

  describe('bug 18 · conflictos al importar', () => {
    it('misma clave con otros datos se rechaza como conflicto; idéntica es duplicado', async () => {
      const cab = 'documento,fecha,linea,codigo_producto,cantidad_kg\n';
      await importar('sap_mermas', csv(`${cab}4900077001,11/09/2026,LLEN-A1,1120002,3.2\n`), 'sap1.csv').expect(201);
      const { body } = await importar(
        'sap_mermas',
        csv(`${cab}4900077001,11/09/2026,LLEN-A1,1120002,3.2\n4900077001,12/09/2026,LLEN-A1,1120002,9\n4900077002,11/09/2026,LLEN-A1,1120002,1\n4900077002,11/09/2026,LLEN-A1,1120002,2\n`),
        'sap2.csv',
      ).expect(201);
      expect(body).toMatchObject({ filasOk: 1, filasDuplicadas: 1, filasConflicto: 2 });
      const conflictos = (body.rechazos as { fila: number; conflicto?: boolean; motivo: string }[]).filter(
        (r) => r.conflicto,
      );
      expect(conflictos.map((r) => r.fila)).toEqual([3, 5]);
      expect(conflictos[0]!.motivo).toContain('ya fue importado con otros datos');
      expect(conflictos[1]!.motivo).toContain('fila 4');
    });
  });

  /* ---------------------------------------------------------------- */
  /* Bajos                                                              */
  /* ---------------------------------------------------------------- */

  describe('bajos', () => {
    it('validar con rango invertido o fecha imposible es 422', async () => {
      await api().post('/evidencia/tci/validar').send({ desde: '2026-09-20', hasta: '2026-09-10' }).expect(422);
      await api().post('/evidencia/tci/validar').send({ desde: '2026-02-31' }).expect(422);
    });

    it('el filtro `tipo` admite valores separados por comas', async () => {
      const comas = await api().get('/evidencia/tci?tipo=parada,merma&pageSize=1').expect(200);
      const repetido = await api().get('/evidencia/tci?tipo=parada&tipo=merma&pageSize=1').expect(200);
      expect(comas.body.meta.total).toBe(repetido.body.meta.total);
    });

    it('solicitud sin tipo/estado y velocidad negativa se rechazan; «1.234» son 1234', async () => {
      const sol = await importar(
        'solicitudes',
        csv('numero_solicitud,fecha,tipo,estado\nSM-BAJO-1,2026-09-11,,\n'),
        'sol.csv',
      ).expect(201);
      expect(sol.body.rechazos[0].motivo).toContain('Falta el tipo');

      const sen = await importar(
        'sensores',
        csv('linea;fecha_hora;estado;velocidad_unid_min\nEXTR-2;2026-09-15 08:00;PRODUCIENDO;-5\nEXTR-2;2026-09-15 08:10;PRODUCIENDO;1.234\n'),
        'sen.csv',
      ).expect(201);
      expect(sen.body.filasOk).toBe(1);
      expect(sen.body.rechazos[0].motivo).toContain('negativa');
      const ds = app.get(DataSource);
      const [fila] = (await ds.query(
        `SELECT "velocidadUnidMin" AS v FROM lectura_sensor WHERE "importacionId" = ?`,
        [sen.body.id],
      )) as { v: number }[];
      expect(fila!.v).toBe(1234);
    });

    it('un alias de mapeo inexistente cae a la cabecera estándar', async () => {
      await importar('sensores', csv('linea,fecha_hora,estado\nEXTR-2,2026-09-16 08:00,PARADA\n'), 'x.csv')
        .field('mapeo', JSON.stringify({ linea: 'NoExiste' }))
        .expect(201);
    });
  });
});
