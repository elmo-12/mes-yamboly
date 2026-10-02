import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { addDays, ahoraPlanta, toIsoDate, turnoDeInstante } from '@mes/shared';
import { Linea, OrdenFabricacion, OrdenSap, User } from '../src/database/entities';
import { OrdersService } from '../src/modules/orders/orders.service';
import { crearApp, login } from './app.factory';

/**
 * Reglas de negocio de las órdenes de fabricación corregidas tras la QA de
 * octubre (bugs A1–A8, M1–M7, B6–B7 y la parte de C1 que vive en órdenes).
 */
describe('órdenes · reglas de alta, cierre y validación (e2e)', () => {
  let app: INestApplication;
  let jefe: string;
  let datos: DataSource;

  beforeAll(async () => {
    app = await crearApp();
    jefe = await login(app);
    datos = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const loginComo = (email: string) => login(app, { email, password: 'Yamboly2026' });
  const repoOrdenes = () => datos.getRepository(OrdenFabricacion);

  /** `YYYY-MM-DDTHH:mm:ss` de planta desplazado `min` minutos. */
  const haceMin = (min: number) => ahoraPlanta(new Date(Date.now() - min * 60_000));
  const vencimiento = toIsoDate(addDays(new Date(), 400));

  let secuencia = 0;
  /** Fila SAP de prueba en LLEN-A1 (CORNELLO VAI 12X120ML, par VE-0070 a 133,3 u/min). */
  const filaSap = async (cambios: Partial<OrdenSap> = {}): Promise<string> => {
    secuencia += 1;
    const id = `SAPD-T-${String(secuencia).padStart(3, '0')}`;
    await datos.getRepository(OrdenSap).insert({
      id,
      numero: `9600${String(secuencia).padStart(4, '0')}`,
      fecha: '2026-10-01',
      turno: 'N',
      lineaId: 'LIN-LLEN-A1',
      productoId: 'PRD-1120002',
      codigoProducto: '1120002',
      productoNombre: 'CORNELLO VAI 12X120ML',
      planificadoCajas: 100,
      velocidadUnidHora: 8000,
      tipoProduccion: null,
      ordenId: null,
      sincronizadaEn: '2026-10-01T05:00:00',
      ...cambios,
    });
    return id;
  };

  const cuerpo = (ordenSapId: string, cambios: Record<string, unknown> = {}) => ({
    ordenSapId,
    lote: 'L-REGLAS-01',
    vencimiento,
    maquinistaId: 'USR-07',
    supervisorId: 'USR-03',
    operarios: 4,
    tiempoRegistroSeg: 30,
    ...cambios,
  });

  const crear = (ordenSapId: string, cambios: Record<string, unknown> = {}, token = jefe) =>
    http().post('/api/v1/ordenes').set(bearer(token)).send(cuerpo(ordenSapId, cambios));

  const finalizar = (id: string, body: Record<string, unknown>, token = jefe) =>
    http().post(`/api/v1/ordenes/${id}/finalizar`).set(bearer(token)).send(body);

  const checklist = {
    produccionRegistrada: true,
    paradasConCausa: true,
    mermasClasificadas: true,
    evidenciaEtiqueta: true,
  };

  /** Cierra a mano la orden en curso de una línea (prepara el caso siguiente). */
  const liberarLinea = (lineaId: string) =>
    repoOrdenes().update(
      { lineaId, estado: 'en_curso' },
      { estado: 'por_validar', fin: ahoraPlanta() },
    );

  /** Orden en curso recién creada en LLEN-A1, con inicio `minutos` atrás. */
  const ordenEnCurso = async (minutos = 60): Promise<string> => {
    await liberarLinea('LIN-LLEN-A1');
    const { body } = await crear(await filaSap()).expect(201);
    await repoOrdenes().update({ id: body.id }, { inicio: haceMin(minutos) });
    return body.id as string;
  };

  describe('alta', () => {
    it('A1 · una sola orden en curso por línea: la segunda es 409', async () => {
      await liberarLinea('LIN-LLEN-A1');
      await crear(await filaSap()).expect(201);
      const { body } = await crear(await filaSap()).expect(409);
      expect(body.code).toBe('CONFLICT');
      expect(body.message).toContain('ya tiene la orden');
    });

    it('M4 · turno de la hora real de inicio; el turno SAP queda como plan', async () => {
      await liberarLinea('LIN-LLEN-A1');
      const id = await filaSap({ turno: 'N' });
      const { body } = await crear(id).expect(201);
      expect(body.turno).toBe(turnoDeInstante(body.inicio));
      expect(body.planSap).toMatchObject({ ordenSapId: id, turno: 'N' });
    });

    it('M4 · maquinista con rol maquinista y supervisor con rol supervisor o jefe', async () => {
      const id = await filaSap();
      const malo = await crear(id, { maquinistaId: 'USR-05', supervisorId: 'USR-02' }).expect(422);
      expect(malo.body.details).toHaveProperty('maquinistaId');
      expect(malo.body.details).toHaveProperty('supervisorId');
    });

    it('M2 · vencimiento real y futuro; lote recortado y con longitud máxima', async () => {
      const id = await filaSap();
      for (const venc of ['2026-13-45', '2020-01-01']) {
        const { body } = await crear(id, { vencimiento: venc }).expect(422);
        expect(body.details).toHaveProperty('vencimiento');
      }
      expect((await crear(id, { lote: '    ' }).expect(422)).body.details).toHaveProperty('lote');
      expect((await crear(id, { lote: 'L'.repeat(41) }).expect(422)).body.details).toHaveProperty(
        'lote',
      );

      await liberarLinea('LIN-LLEN-A1');
      const { body } = await crear(id, { lote: '  L-261002-07  ' }).expect(201);
      expect(body.lote).toBe('L-261002-07');
    });

    it('M7 · operarios, tiempo de registro y planificado fuera de rango son 422, no 500', async () => {
      const id = await filaSap();
      expect((await crear(id, { operarios: 1e12 }).expect(422)).body.details).toHaveProperty(
        'operarios',
      );
      expect((await crear(id, { operarios: '' }).expect(422)).body.details).toHaveProperty(
        'operarios',
      );
      /* A7: el cronómetro TRI tiene tope (TIEMPO_REGISTRO_MAX_SEG). */
      expect((await crear(id, { tiempoRegistroSeg: 1e9 }).expect(422)).body.details).toHaveProperty(
        'tiempoRegistroSeg',
      );
      const enorme = await filaSap({ planificadoCajas: 200_000_000 });
      expect((await crear(enorme).expect(422)).body.details).toHaveProperty('ordenSapId');
    });

    it('maquinista o supervisor desactivados y línea desactivada son 422', async () => {
      const usuarios = datos.getRepository(User);
      await usuarios.update({ id: 'USR-07' }, { activo: false });
      await usuarios.update({ id: 'USR-11' }, { activo: false });
      try {
        const { body } = await crear(await filaSap(), { supervisorId: 'USR-11' }).expect(422);
        expect(body.details.maquinistaId).toContain('desactivado');
        expect(body.details.supervisorId).toContain('desactivado');
      } finally {
        await usuarios.update({ id: 'USR-07' }, { activo: true });
        await usuarios.update({ id: 'USR-11' }, { activo: true });
      }

      const lineas = datos.getRepository(Linea);
      await lineas.update({ id: 'LIN-LLEN-A1' }, { estado: 'inactivo' });
      try {
        const { body } = await crear(await filaSap()).expect(422);
        expect(body.details.ordenSapId).toContain('desactivada');
      } finally {
        await lineas.update({ id: 'LIN-LLEN-A1' }, { estado: 'activo' });
      }
    });

    it('B7 · colaboradores inexistentes son 422', async () => {
      const { body } = await crear(await filaSap(), {
        colaboradorIds: ['COL-01', 'COL-XX'],
      }).expect(422);
      expect(body.details.colaboradorIds).toContain('COL-XX');
    });

    it('M1 · el mismo número SAP iniciado a la vez en dos líneas no da 500', async () => {
      await liberarLinea('LIN-LLEN-A1');
      await liberarLinea('LIN-LLEN-A2');
      const a = await filaSap({ numero: '96999999' });
      const b = await filaSap({ numero: '96999999', lineaId: 'LIN-LLEN-A2', productoId: null });
      /* LLEN-A2 sin producto mapeado daría 422: se le pone el mismo producto con velocidad SAP. */
      await datos.getRepository(OrdenSap).update({ id: b }, { productoId: 'PRD-1120002' });
      const respuestas = await Promise.all([crear(a), crear(b)]);
      expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
      expect(respuestas.map((r) => r.body.codigo).sort()).toEqual(['96999999', '96999999-2']);
    });
  });

  describe('cierre', () => {
    it('A2 · investigador no puede finalizar y el maquinista sólo en su línea', async () => {
      const id = await ordenEnCurso();
      await finalizar(
        id,
        { producido: 10, conteoCodificadora: 10 },
        await loginComo('investigador@yamboly.lat'),
      ).expect(403);
      /* Jorge Quispe es maquinista de EXTR-2; la orden es de LLEN-A1. */
      await finalizar(
        id,
        { producido: 10, conteoCodificadora: 10 },
        await loginComo('jorge.quispe@yamboly.lat'),
      ).expect(403);
    });

    it('A6 · producido vacío o nulo es 422 «Campo obligatorio», no 0', async () => {
      const id = await ordenEnCurso();
      for (const producido of ['', null, '   ']) {
        const { body } = await finalizar(id, { producido, conteoCodificadora: 5 }).expect(422);
        expect(body.details.producido).toBe('Campo obligatorio');
      }
      expect(
        (await finalizar(id, { producido: 1e12, conteoCodificadora: 5 }).expect(422)).body.details,
      ).toHaveProperty('producido');
    });

    it('A5 · producción imposible para la duración real es 422 en producido', async () => {
      const id = await ordenEnCurso(10);
      /* 133,3 u/min × 10 min × 1,5 ≈ 2 000 u como máximo. */
      const { body } = await finalizar(id, {
        producido: 100_000,
        conteoCodificadora: 100_000,
      }).expect(422);
      expect(body.details.producido).toContain('no es posible');
    });

    it('A5 · el OEE usa la duración real de la orden como tiempo planificado', async () => {
      const id = await ordenEnCurso(60);
      /* 60 min a 133,3 u/min = 7 998 u teóricas; 7 200 u ≈ 90 % de desempeño. */
      const { body } = await finalizar(id, { producido: 7200, conteoCodificadora: 7128 }).expect(
        200,
      );
      expect(body.oee.disponibilidad).toBe(100);
      expect(body.oee.desempeno).toBeGreaterThan(88);
      expect(body.oee.desempeno).toBeLessThan(92);
      expect(body.oee.calidad).toBe(99);
    });

    it('A3 · finalizar dos veces a la vez: un 200, un 409 y una sola entrada de bitácora', async () => {
      const id = await ordenEnCurso();
      const respuestas = await Promise.all([
        finalizar(id, { producido: 100, conteoCodificadora: 100 }),
        finalizar(id, { producido: 100, conteoCodificadora: 100 }),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      const { body } = await http()
        .get(`/api/v1/ordenes/${id}/bitacora?tipo=sistema`)
        .set(bearer(jefe))
        .expect(200);
      expect(body.data).toHaveLength(1);
    });

    it('A4 · con una parada abierta no se finaliza ni se valida (409)', async () => {
      const id = await ordenEnCurso(60);
      await http()
        .post('/api/v1/paradas')
        .set(bearer(jefe))
        .send({
          ordenId: id,
          lineaId: 'LIN-LLEN-A1',
          causaId: 'CPA-PN-02-01',
          inicio: haceMin(30),
          accionTomada: 'Parada abierta de prueba para el cierre',
          responsableId: 'USR-07',
        })
        .expect(201);

      const { body } = await finalizar(id, { producido: 100, conteoCodificadora: 100 }).expect(409);
      expect(body.message).toBe('Cierra la parada abierta antes de finalizar');

      /* Una orden ya cerrada (p. ej. sincronizada del legado) con la parada abierta tampoco se valida. */
      await repoOrdenes().update({ id }, { estado: 'por_validar', fin: ahoraPlanta() });
      const validar = await http()
        .post(`/api/v1/ordenes/${id}/validar`)
        .set(bearer(jefe))
        .send(checklist)
        .expect(409);
      expect(validar.body.message).toBe('Cierra la parada abierta antes de validar');
    });
  });

  describe('validación y recálculo', () => {
    it('A3 · validar dos veces a la vez: un 200, un 409 y una sola entrada de bitácora', async () => {
      const id = await ordenEnCurso();
      await finalizar(id, { producido: 100, conteoCodificadora: 100 }).expect(200);
      const respuestas = await Promise.all([
        http().post(`/api/v1/ordenes/${id}/validar`).set(bearer(jefe)).send(checklist),
        http().post(`/api/v1/ordenes/${id}/validar`).set(bearer(jefe)).send(checklist),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      const { body } = await http()
        .get(`/api/v1/ordenes/${id}/bitacora?tipo=validacion`)
        .set(bearer(jefe))
        .expect(200);
      expect(body.data).toHaveLength(1);
    });

    it('C1 · recalcular no toca una validada y en las pendientes sólo con jefe o supervisor', async () => {
      const servicio = app.get(OrdersService);
      const validada = await repoOrdenes().findOneByOrFail({ estado: 'validada' });
      const oeeAntes = { ...validada.oee };
      validada.producido = 1;
      expect(await servicio.recalcular(validada, { rol: 'jefe' })).toBe(false);
      expect(validada.oee).toEqual(oeeAntes);

      const pendiente = await repoOrdenes().findOneByOrFail({ estado: 'por_validar' });
      const antes = { ...pendiente.oee };
      expect(await servicio.recalcular(pendiente, { rol: 'maquinista' })).toBe(false);
      expect(pendiente.oee).toEqual(antes);
      expect(await servicio.recalcular(pendiente, { rol: 'supervisor' })).toBe(true);
    });
  });

  describe('tiempo real y resumen', () => {
    it('A8 · la orden en curso se muestra aunque su fecha sea de otro día operativo', async () => {
      /* Una orden de hoy hace que el día operativo sea hoy; la de MOLD-A4 es del
       * 28-ago (siembra) y sigue en curso: antes la línea salía «sin orden». */
      await liberarLinea('LIN-LLEN-A1');
      await crear(await filaSap()).expect(201);
      const { body } = await http().get('/api/v1/tiempo-real/lineas').set(bearer(jefe)).expect(200);
      const a4 = body.lineas.find((l: { lineaId: string }) => l.lineaId === 'LIN-MOLD-A4');
      const enCurso = await repoOrdenes().findOneByOrFail({
        lineaId: 'LIN-MOLD-A4',
        estado: 'en_curso',
      });
      expect(a4.estado).not.toBe('sin_orden');
      expect(a4.orden.codigo).toBe(enCurso.codigo);
    });

    it('B6 · la última sincronización es la real de las órdenes SAP, no «ahora»', async () => {
      const { body } = await http().get('/api/v1/ordenes/resumen').set(bearer(jefe)).expect(200);
      const [ultima] = await datos
        .getRepository(OrdenSap)
        .find({ order: { sincronizadaEn: 'DESC' }, take: 1 });
      expect(body.ultimaSincronizacion).toBe(ultima?.sincronizadaEn ?? null);
    });
  });

  describe('QA de regresión · OEE de órdenes importadas, vínculo y mensajes', () => {
    /** Deja la orden como la importa `pnpm sync:real`: cerrada, sin colaboradores y con el OEE del legado. */
    const comoImportada = async (
      id: string,
      producido: number,
      conteo: number,
      oee: { oee: number; disponibilidad: number; desempeno: number; calidad: number },
    ) => {
      await repoOrdenes().update(
        { id },
        {
          estado: 'por_validar',
          fin: ahoraPlanta(),
          producido,
          conteoCodificadora: conteo,
          colaboradores: [],
          oee,
        },
      );
    };
    const validar = (id: string) =>
      http().post(`/api/v1/ordenes/${id}/validar`).set(bearer(jefe)).send(checklist);

    it('ORD-95101736 · validar conserva el OEE del legado aunque no haya conteo de codificadora', async () => {
      const id = await ordenEnCurso();
      const legado = { oee: 107.3, disponibilidad: 100, desempeno: 107.3, calidad: 100 };
      await comoImportada(id, 362, 0, legado);
      await validar(id).expect(200);
      const sellada = await repoOrdenes().findOneByOrFail({ id });
      expect(sellada.estado).toBe('validada');
      expect(sellada.oee).toEqual(legado);
    });

    it('ORD-95101738 · corregir una orden importada no degrada la calidad del legado (99,3)', async () => {
      const id = await ordenEnCurso();
      const legado = { oee: 80, disponibilidad: 90, desempeno: 89.5, calidad: 99.3 };
      await comoImportada(id, 1000, 0, legado);
      const orden = await repoOrdenes().findOneByOrFail({ id });
      expect(await app.get(OrdersService).recalcular(orden, { rol: 'supervisor' })).toBe(true);
      expect(orden.oee).toEqual(legado);
      await validar(id).expect(200);
      expect((await repoOrdenes().findOneByOrFail({ id })).oee).toEqual(legado);
    });

    it('una parada que no afecta OEE no cambia el OEE de una orden importada', async () => {
      const id = await ordenEnCurso();
      const legado = { oee: 84.9, disponibilidad: 84, desempeno: 104.1, calidad: 97.1 };
      await comoImportada(id, 500, 0, legado);
      const inicio = haceMin(50);
      await http()
        .post('/api/v1/paradas')
        .set(bearer(jefe))
        .send({
          ordenId: id,
          lineaId: 'LIN-LLEN-A1',
          causaId: 'CPA-PN-02-01',
          inicio,
          fin: haceMin(49),
          accionTomada: 'Parada de 1 min que no afecta OEE',
          responsableId: 'USR-07',
          afectaOee: false,
        })
        .expect(201);
      const despues = await repoOrdenes().findOneByOrFail({ id });
      expect(despues.oee).toEqual(legado);
      expect(despues.paradasCount).toBe(1);
    });

    it('conteo 0 = sin codificadora: la calidad de una orden del MES nunca es 0', async () => {
      const id = await ordenEnCurso();
      const { body } = await finalizar(id, { producido: 100, conteoCodificadora: 0 }).expect(200);
      expect(body.oee.calidad).toBe(100);
    });

    it('finalizar rechaza una evidenciaUrl que no es una foto subida', async () => {
      for (const url of ['javascript:alert(1)', '/api/v1/evidencias/EV-20260101-noexiste.png']) {
        const id = await ordenEnCurso();
        const { body } = await finalizar(id, {
          producido: 100,
          conteoCodificadora: 100,
          evidenciaUrl: url,
        }).expect(422);
        expect(body.details).toHaveProperty('evidenciaUrl');
      }
    });

    it('mensajes de validación correctos: obligatorio → tipo → rango', async () => {
      const id = await filaSap();
      const det = async (cambios: Record<string, unknown>) =>
        (await crear(id, cambios).expect(422)).body.details as Record<string, string>;
      expect((await det({ lote: undefined })).lote).toBe('El lote es obligatorio');
      expect((await det({ operarios: 'abc' })).operarios).toBe('Debe ser un número entero');
      expect((await det({ tiempoRegistroSeg: -5 })).tiempoRegistroSeg).toBe('Debe ser 0 o mayor');
      const orden = await ordenEnCurso();
      const fin = await finalizar(orden, { producido: 'abc', conteoCodificadora: 1 }).expect(422);
      expect(fin.body.details.producido).toBe('Debe ser un número entero');
    });

    it('producción imposible: coma decimal y al menos 1 min', async () => {
      const id = await ordenEnCurso(0);
      const { body } = await finalizar(id, { producido: 9_000_000, conteoCodificadora: 1 }).expect(422);
      expect(body.details.producido).toContain('×1,5');
      expect(body.details.producido).not.toContain(' 0 min');
    });
  });
});
