import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Alerta, ExportJob, Merma, OrdenFabricacion, Parada } from '../src/database/entities';
import { CREDENCIALES, crearApp, login } from './app.factory';

/**
 * Regresiones de la QA de reportes, alertas, analítica y usuarios:
 * C1, C2 (alertas), A1, A3, A4, A5, M1, M2, M3, M7, M9 y usuarios M2/M9.
 */
describe('reportes · alertas · analítica · auth (regresiones QA)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const CUENTAS = {
    jefe: CREDENCIALES.jefe,
    supervisor: { email: 'ana.rios@yamboly.lat', password: 'Yamboly2026' },
    maquinista: CREDENCIALES.maquinista, // jorge.quispe · LIN-EXTR-2
    mermas: { email: 'maria.torres@yamboly.lat', password: 'Yamboly2026' },
    investigador: { email: 'investigador@yamboly.lat', password: 'Yamboly2026' },
  } as const;
  type Cuenta = keyof typeof CUENTAS;

  beforeAll(async () => {
    app = await crearApp();
    ds = app.get(DataSource);
    for (const cuenta of Object.keys(CUENTAS) as Cuenta[]) {
      tokens[cuenta] = await login(app, CUENTAS[cuenta]);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const get = (ruta: string, cuenta: Cuenta = 'jefe') =>
    http().get(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[cuenta]}`);
  const post = (ruta: string, cuenta: Cuenta = 'jefe') =>
    http().post(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[cuenta]}`);
  const patch = (ruta: string, cuenta: Cuenta = 'jefe') =>
    http().patch(`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[cuenta]}`);

  /* ---------------------------------------------------------------- */
  /* C1 · Paradas y Mermas respetan la ventana y los filtros           */
  /* ---------------------------------------------------------------- */

  describe('C1 · reportes de paradas y mermas', () => {
    /** Hechos que caen en [desde, hasta] por el día operativo de su orden. */
    async function hechos(desde: string, hasta: string, lineaId?: string) {
      const ordenes = new Map(
        (await ds.getRepository(OrdenFabricacion).find()).map((o) => [o.id, o]),
      );
      const dentro = (ordenId: string, linea: string) => {
        const o = ordenes.get(ordenId);
        return !!o && o.fecha >= desde && o.fecha <= hasta && (!lineaId || linea === lineaId);
      };
      const paradas = (await ds.getRepository(Parada).find()).filter((p) => dentro(p.ordenId, p.lineaId));
      const mermas = (await ds.getRepository(Merma).find()).filter((m) => dentro(m.ordenId, m.lineaId));
      return { paradas, mermas };
    }

    it('los KPI de paradas cambian con el periodo y coinciden con la base', async () => {
      const hoy = (await get('/reportes/paradas?periodo=hoy').expect(200)).body;
      const mes = (await get('/reportes/paradas?periodo=mes').expect(200)).body;
      const valor = (b: { kpis: { id: string; valor: number }[] }, id: string) =>
        b.kpis.find((k) => k.id === id)!.valor;

      for (const cuerpo of [hoy, mes]) {
        const { paradas } = await hechos(cuerpo.desde, cuerpo.hasta);
        expect(valor(cuerpo, 'paradas')).toBe(paradas.length);
        expect(valor(cuerpo, 'minutos')).toBe(paradas.reduce((t, p) => t + p.duracionMin, 0));
      }
      expect(valor(hoy, 'paradas')).toBeLessThanOrEqual(valor(mes, 'paradas'));
    });

    it('filtra paradas por línea y por clasificación (no programadas)', async () => {
      const todas = (await get('/reportes/paradas?periodo=mes').expect(200)).body;
      const linea = (await get('/reportes/paradas?periodo=mes&lineaId=LIN-EXTR-2').expect(200)).body;
      const { paradas } = await hechos(linea.desde, linea.hasta, 'LIN-EXTR-2');
      expect(linea.kpis[0].valor).toBe(paradas.length);
      expect(linea.kpis[0].valor).toBeLessThanOrEqual(todas.kpis[0].valor);

      const imprevistas = (await get('/reportes/paradas?periodo=mes&clasificacion=imprevista').expect(200)).body;
      const programadas = (await get('/reportes/paradas?periodo=mes&clasificacion=programada').expect(200)).body;
      expect(imprevistas.kpis[0].valor + programadas.kpis[0].valor).toBe(todas.kpis[0].valor);
      await get('/reportes/paradas?clasificacion=otra').expect(422);
    });

    it('la merma total sale de la base y respeta línea y periodo', async () => {
      const mes = (await get('/reportes/mermas?periodo=mes').expect(200)).body;
      const { mermas } = await hechos(mes.desde, mes.hasta);
      expect(mes.kpis[0].valor).toBeCloseTo(mermas.reduce((t, m) => t + m.cantidadKg, 0), 0);

      const linea = (await get('/reportes/mermas?periodo=mes&lineaId=LIN-EXTR-2').expect(200)).body;
      const soloLinea = await hechos(linea.desde, linea.hasta, 'LIN-EXTR-2');
      expect(linea.kpis[0].valor).toBeCloseTo(
        soloLinea.mermas.reduce((t, m) => t + m.cantidadKg, 0),
        0,
      );
      expect(linea.apiladasPorLinea.every((l: { lineaId: string }) => l.lineaId === 'LIN-EXTR-2')).toBe(true);
    });

    it('una ventana sin datos marca los KPI como `sinDatos` (M7)', async () => {
      const ruta = '?periodo=personalizado&desde=2020-01-01&hasta=2020-01-05';
      for (const informe of ['indicadores', 'paradas', 'mermas']) {
        const { body } = await get(`/reportes/${informe}${ruta}`).expect(200);
        expect(body.kpis.every((k: { sinDatos?: boolean }) => k.sinDatos === true)).toBe(true);
      }
    });

    it('rechaza fechas imposibles y rangos invertidos con 422 (M7)', async () => {
      await get('/reportes/indicadores?periodo=personalizado&desde=2026-02-30&hasta=2026-03-01').expect(422);
      await get('/reportes/paradas?periodo=personalizado&desde=2026-09-30&hasta=2026-09-01').expect(422);
      await get('/reportes/mermas?periodo=personalizado&desde=2026-09-01').expect(422);
    });
  });

  /* ---------------------------------------------------------------- */
  /* A4 / A5 · Exportación                                             */
  /* ---------------------------------------------------------------- */

  describe('A4 · A5 · exportación', () => {
    const base = { datasets: ['ordenes'], formato: 'xlsx', desde: '2026-08-01', hasta: '2026-08-31' };

    it('valida rango, fechas reales, línea y datasets repetidos (422)', async () => {
      await post('/reportes/exportar').send({ ...base, desde: '2026-09-30', hasta: '2026-09-01' }).expect(422);
      await post('/reportes/exportar').send({ ...base, desde: '2026-13-45', hasta: '2026-99-99' }).expect(422);
      const linea = await post('/reportes/exportar').send({ ...base, lineaId: 'LIN-NO-EXISTE' }).expect(422);
      expect(linea.body.details).toHaveProperty('lineaId');
      await post('/reportes/exportar').send({ ...base, datasets: ['ordenes', 'ordenes'] }).expect(422);
    });

    it('envíos simultáneos reciben ids distintos, sin 500 (A5)', async () => {
      const respuestas = await Promise.all(
        [1, 2, 3, 4].map(() => post('/reportes/exportar').send(base)),
      );
      expect(respuestas.map((r) => r.status)).toEqual([202, 202, 202, 202]);
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(4);
    });

    it('la hoja de alertas respeta el rango, la línea y el turno', async () => {
      const alertas = await ds.getRepository(Alerta).find();
      const fechas = [...new Set(alertas.map((a) => a.generadaEn.slice(0, 10)))].sort();
      const dia = fechas.at(-1)!;
      const { body } = await post('/reportes/exportar')
        .send({ datasets: ['alertas'], formato: 'xlsx', desde: dia, hasta: dia, lineaId: 'LIN-MOLD-A3' })
        .expect(202);
      let estado = 'generando';
      for (let i = 0; i < 40 && estado !== 'listo'; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const historial = await get('/reportes/exportaciones').expect(200);
        estado = historial.body.data.find((j: { id: string }) => j.id === body.id).estado;
      }
      expect(estado).toBe('listo');
      const archivo = await get(`/reportes/exportaciones/${body.id}/descargar`)
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (c: Buffer) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(archivo.body as unknown as ArrayBuffer);
      const filas = libro.getWorksheet('Alertas')!.actualRowCount - 1;
      const esperadas = alertas.filter(
        (a) => a.generadaEn.slice(0, 10) === dia && a.lineaId === 'LIN-MOLD-A3',
      ).length;
      expect(filas).toBe(esperadas);
      expect(filas).toBeLessThan(alertas.length);
    });
  });

  describe('QA regresión · exportación con varias líneas, permisos y filtros', () => {
    const base = { datasets: ['ordenes'], formato: 'xlsx', desde: '2026-08-01', hasta: '2026-08-31' };

    async function esperarListo(id: string): Promise<string> {
      let estado = 'generando';
      for (let i = 0; i < 40 && estado === 'generando'; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const historial = await get('/reportes/exportaciones').expect(200);
        estado = historial.body.data.find((j: { id: string }) => j.id === id).estado;
      }
      return estado;
    }

    it('exportar con 2 líneas no da 500 y termina «listo»', async () => {
      const { body } = await post('/reportes/exportar')
        .send({ ...base, lineaId: 'LIN-MOLD-A3,LIN-EXTR-2' })
        .expect(202);
      expect(await esperarListo(body.id)).toBe('listo');
      const job = await ds.getRepository(ExportJob).findOneByOrFail({ id: body.id });
      expect(job).toMatchObject({ lineaId: null, lineaIds: ['LIN-MOLD-A3', 'LIN-EXTR-2'] });
    });

    it('con una sola línea se conserva `lineaId`', async () => {
      const { body } = await post('/reportes/exportar').send({ ...base, lineaId: 'LIN-MOLD-A3' }).expect(202);
      const job = await ds.getRepository(ExportJob).findOneByOrFail({ id: body.id });
      expect(job).toMatchObject({ lineaId: 'LIN-MOLD-A3', lineaIds: ['LIN-MOLD-A3'] });
    });

    it('la evidencia solo se exporta como jefe o investigador (403 para el resto)', async () => {
      const evidencia = { ...base, datasets: ['ordenes', 'evidencia'] };
      for (const cuenta of ['maquinista', 'mermas', 'supervisor'] as const) {
        await post('/reportes/exportar', cuenta).send(evidencia).expect(403);
      }
      await post('/reportes/exportar', 'investigador').send(evidencia).expect(202);
      await post('/reportes/exportar', 'jefe').send(evidencia).expect(202);
      await post('/reportes/exportar', 'maquinista').send(base).expect(202);
    });

    it('la descarga y el listado son del creador, del jefe y del investigador', async () => {
      const { body } = await post('/reportes/exportar', 'maquinista').send(base).expect(202);
      const ajeno = await post('/reportes/exportar', 'jefe').send(base).expect(202);
      await esperarListo(body.id);
      await get(`/reportes/exportaciones/${ajeno.body.id}/descargar`, 'maquinista').expect(403);
      await get(`/reportes/exportaciones/${body.id}/descargar`, 'maquinista').expect(200);
      await get(`/reportes/exportaciones/${body.id}/descargar`, 'investigador').expect(200);
      const propios = await get('/reportes/exportaciones', 'maquinista').expect(200);
      const ids = propios.body.data.map((j: { id: string }) => j.id);
      expect(ids).toContain(body.id);
      expect(ids).not.toContain(ajeno.body.id);
      const todos = await get('/reportes/exportaciones', 'investigador').expect(200);
      expect(todos.body.data.map((j: { id: string }) => j.id)).toContain(ajeno.body.id);
    });

    it('la exportación sembrada EXP-001 es descargable', async () => {
      await get('/reportes/exportaciones/EXP-001/descargar', 'investigador').expect(200);
    });
  });

  describe('QA regresión · filtros inválidos y umbrales', () => {
    it('turno desconocido o línea inexistente en los informes dan 422', async () => {
      for (const ruta of ['indicadores', 'paradas', 'mermas']) {
        await get(`/reportes/${ruta}?turno=Z`).expect(422);
        await get(`/reportes/${ruta}?lineaId=LIN-NO-EXISTE`).expect(422);
        await get(`/reportes/${ruta}?turno=D&lineaId=LIN-MOLD-A3`).expect(200);
      }
    });

    it('PUT /alertas/umbrales con tolerancias null da 422, no 500', async () => {
      const actuales = (await get('/alertas/umbrales').expect(200)).body;
      for (const campo of ['tciToleranciaMin', 'tciToleranciaPct', 'tciToleranciaDiasSap']) {
        await http()
          .put('/api/v1/alertas/umbrales')
          .set('Authorization', `Bearer ${tokens.jefe}`)
          .send({ ...actuales, [campo]: null })
          .expect(422);
      }
    });

    it('«Alerta no encontrada» en femenino', async () => {
      const r = await get('/alertas/ALE-NO-EXISTE').expect(404);
      expect(r.body.message).toBe('Alerta no encontrada');
    });
  });

  /* ---------------------------------------------------------------- */
  /* C2 · A3 · M1 · alertas                                            */
  /* ---------------------------------------------------------------- */

  describe('alertas: permisos, línea y máquina de estados', () => {
    const accion = { accionTomada: 'Se ajustó la velocidad y se limpió la boquilla' };

    it('el maquinista solo atiende alertas de su línea; mermas e investigador no atienden', async () => {
      /* ALE-001 es de LLEN-A1; Jorge Quispe opera EXTR-2 (ALE-004). */
      await post('/alertas/ALE-001/atender', 'maquinista').send(accion).expect(403);
      await post('/alertas/ALE-001/atender', 'mermas').send(accion).expect(403);
      await post('/alertas/ALE-001/descartar', 'investigador').send({ motivo: 'Falsa alarma' }).expect(403);
      const propia = await post('/alertas/ALE-004/atender', 'maquinista').send(accion).expect(200);
      expect(propia.body.alerta.atendidaPor).toBe('Jorge Quispe');
    });

    it('solo jefe y supervisor confirman el evento real (EP)', async () => {
      await post('/alertas/ALE-004/confirmar', 'maquinista').send({ ocurrio: true }).expect(403);
      await post('/alertas/confirmar-lote', 'mermas')
        .send({ confirmaciones: [{ alertaId: 'ALE-004', ocurrio: true }] })
        .expect(403);
      await post('/alertas/ALE-004/confirmar', 'supervisor').send({ ocurrio: true }).expect(200);
    });

    it('rechaza transiciones inválidas con 409 (A3)', async () => {
      await post('/alertas/ALE-002/atender').send(accion).expect(200);
      /* Atender dos veces o descartar una atendida ya no sobrescribe nada. */
      await post('/alertas/ALE-002/atender').send(accion).expect(409);
      await post('/alertas/ALE-002/descartar').send({ motivo: 'Falsa alarma' }).expect(409);

      await post('/alertas/ALE-003/descartar').send({ motivo: 'Línea en mantenimiento' }).expect(200);
      await post('/alertas/ALE-003/atender').send(accion).expect(409);
      /* Una descartada no puede confirmarse ni contar en la EP. */
      await post('/alertas/ALE-003/confirmar').send({ ocurrio: true }).expect(409);
      const ep = await get('/evidencia/ep').expect(200);
      expect(ep.body.registros.some((r: { alertaId: string }) => r.alertaId === 'ALE-003')).toBe(false);
    });

    it('recorta los textos antes de validar (solo espacios = 422)', async () => {
      await post('/alertas/ALE-005/atender').send({ accionTomada: '          x' }).expect(422);
      await post('/alertas/ALE-005/descartar').send({ motivo: '     ' }).expect(422);
    });

    it('pendientes de confirmar no cuenta las descartadas (M1)', async () => {
      const { body } = await get('/alertas/resumen').expect(200);
      const filas = await ds.getRepository(Alerta).find();
      const esperadas = filas.filter(
        (a) => a.acierto === null && (a.estado === 'atendida' || a.estado === 'vencida'),
      ).length;
      expect(body.pendientesConfirmar).toBe(esperadas);
    });

    it('el lote es atómico: una alerta inválida (409) o repetida (422) no confirma ninguna', async () => {
      /* ALE-010 y ALE-011 están atendidas sin acierto; ALE-003 está descartada. */
      const conflicto = await post('/alertas/confirmar-lote')
        .send({
          confirmaciones: [
            { alertaId: 'ALE-010', ocurrio: true },
            { alertaId: 'ALE-003', ocurrio: true },
          ],
        })
        .expect(409);
      expect(conflicto.body.details.alertas).toContain('ALE-003');
      const intacta = await get('/alertas/ALE-010').expect(200);
      expect(intacta.body.estado).toBe('atendida');

      await post('/alertas/confirmar-lote')
        .send({
          confirmaciones: [
            { alertaId: 'ALE-010', ocurrio: true },
            { alertaId: 'ALE-010', ocurrio: false },
          ],
        })
        .expect(422);
      await post('/alertas/confirmar-lote')
        .send({ confirmaciones: [{ alertaId: 'ALE-NO-EXISTE', ocurrio: true }] })
        .expect(404);
    });

    it('dos envíos simultáneos del mismo lote: uno confirma y el otro recibe 409, nunca 500 (A5)', async () => {
      const cuerpo = {
        confirmaciones: [
          { alertaId: 'ALE-010', ocurrio: true },
          { alertaId: 'ALE-011', ocurrio: false },
        ],
      };
      const [a, b] = await Promise.all([
        post('/alertas/confirmar-lote').send(cuerpo),
        post('/alertas/confirmar-lote').send(cuerpo),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const ep = await get('/evidencia/ep').expect(200);
      const filas = ep.body.registros.filter((r: { alertaId: string }) =>
        ['ALE-010', 'ALE-011'].includes(r.alertaId),
      );
      expect(filas).toHaveLength(2);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Analítica por rol                                                 */
  /* ---------------------------------------------------------------- */

  describe('analítica por rol', () => {
    it('solo jefe, supervisor e investigador leen /analitica (como la UI)', async () => {
      await get('/analitica/resumen', 'maquinista').expect(403);
      await get('/analitica/predicciones', 'mermas').expect(403);
      await get('/analitica/estado-datos', 'supervisor').expect(200);
      await get('/analitica/estado-datos', 'investigador').expect(200);
    });

    it('el supervisor no gestiona el modelo (403)', async () => {
      await post('/analitica/modelo/v1.0/activar', 'supervisor').expect(403);
      await post('/analitica/reentrenar', 'supervisor').expect(403);
    });
  });

  /* ---------------------------------------------------------------- */
  /* A1 · M2 · usuarios y sesión                                       */
  /* ---------------------------------------------------------------- */

  describe('sesión y usuarios', () => {
    it('bloquea la cuenta tras 5 intentos fallidos (429), aun con la clave correcta (A1)', async () => {
      const cuenta = 'rosa.huaman@yamboly.lat';
      for (let i = 0; i < 5; i++) {
        await http().post('/api/v1/auth/login').send({ email: cuenta, password: `mala-clave-${i}` }).expect(401);
      }
      const bloqueada = await http()
        .post('/api/v1/auth/login')
        .send({ email: cuenta, password: 'Yamboly2026' })
        .expect(429);
      expect(bloqueada.body.code).toBe('TOO_MANY_REQUESTS');
      expect(bloqueada.body.details.reintentarEnSeg).toBeGreaterThan(0);
      /* Otra cuenta desde la misma IP sigue entrando (el límite de IP es mayor). */
      await login(app, CUENTAS.supervisor);
    });

    it('el logout revoca el token (M2)', async () => {
      const token = await login(app, { email: 'diego.salazar@yamboly.lat', password: 'Yamboly2026' });
      const auth = { Authorization: `Bearer ${token}` };
      await http().get('/api/v1/auth/me').set(auth).expect(200);
      await http().post('/api/v1/auth/logout').set(auth).expect(204);
      await http().get('/api/v1/auth/me').set(auth).expect(401);
    });

    it('restablecer la contraseña y desactivar revocan las sesiones abiertas', async () => {
      const cuenta = { email: 'sofia.cardenas@yamboly.lat', password: 'Yamboly2026' };
      const token = await login(app, cuenta);
      await post('/usuarios/USR-08/restablecer-password').send({ password: 'Yamboly2026' }).expect(200);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);

      const nuevo = await login(app, cuenta);
      await post('/usuarios/USR-08/estado').send({ activo: false }).expect(200);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${nuevo}`).expect(401);
      await post('/usuarios/USR-08/estado').send({ activo: true }).expect(200);
    });

    it('GET /usuarios solo da DNI y correo al jefe; el resto ve activos sin datos personales', async () => {
      await post('/usuarios/USR-10/estado').send({ activo: false }).expect(200);
      const jefe = await get('/usuarios').expect(200);
      expect(jefe.body.data[0]).toHaveProperty('dni');
      expect(jefe.body.data.some((u: { id: string }) => u.id === 'USR-10')).toBe(true);

      const otro = await get('/usuarios', 'maquinista').expect(200);
      expect(otro.body.data[0]).not.toHaveProperty('dni');
      expect(otro.body.data[0]).not.toHaveProperty('email');
      expect(otro.body.data.some((u: { id: string }) => u.id === 'USR-10')).toBe(false);

      const directorio = await get('/usuarios/directorio', 'supervisor').expect(200);
      expect(directorio.body.data.every((u: { activo: boolean }) => u.activo)).toBe(true);
      await post('/usuarios/USR-10/estado').send({ activo: true }).expect(200);
    });

    it('valida línea, nombre, correo y el rol del propio jefe (M9)', async () => {
      const linea = await patch('/usuarios/USR-10').send({ lineaId: 'LIN-NO-EXISTE' }).expect(422);
      expect(linea.body.details).toHaveProperty('lineaId');
      await patch('/usuarios/USR-10').send({ lineaId: null }).expect(422);
      await patch('/usuarios/USR-10').send({ nombre: 'x'.repeat(5000) }).expect(422);
      await patch('/usuarios/USR-01').send({ rol: 'supervisor' }).expect(422);

      const alta = await post('/usuarios')
        .send({
          nombre: 'Prueba Mayúsculas',
          email: '  Prueba.MAYUS@Yamboly.LAT ',
          dni: '49999001',
          rol: 'calidad',
          cargo: 'Analista',
          password: 'Yamboly2026',
        })
        .expect(201);
      expect(alta.body.email).toBe('prueba.mayus@yamboly.lat');

      await post('/usuarios')
        .send({
          nombre: 'Maquinista Sin Línea',
          email: 'sin.linea@yamboly.lat',
          dni: '49999002',
          rol: 'maquinista',
          cargo: 'Maquinista',
          password: 'Yamboly2026',
        })
        .expect(422);
    });

    it('cambiar el rol obliga a iniciar sesión de nuevo', async () => {
      const cuenta = { email: 'luis.vargas@yamboly.lat', password: 'Yamboly2026' };
      const token = await login(app, cuenta);
      await patch('/usuarios/USR-07').send({ lineaId: 'LIN-LLEN-M1' }).expect(200);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });
});
