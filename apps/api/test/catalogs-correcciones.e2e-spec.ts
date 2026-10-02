import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { crearApp, CREDENCIALES, login } from './app.factory';

/**
 * Regresiones de la QA de Configuración (mantenedores y umbrales). Cada
 * bloque nombra el bug que cubre (C1, A2…A5, M1, M6, M7, B1, B4, B5, B8).
 */
describe('catálogos — correcciones de QA (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app, CREDENCIALES.jefe);
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());
  const post = (url: string, body: object) => api().post(`/api/v1${url}`).set(auth()).send(body);
  const patch = (url: string, body: object) => api().patch(`/api/v1${url}`).set(auth()).send(body);
  const del = (url: string) => api().delete(`/api/v1${url}`).set(auth());
  const get = (url: string) => api().get(`/api/v1${url}`).set(auth());

  const linea = (codigo: string) => ({
    codigo,
    nombre: `Línea ${codigo}`,
    nombreCorto: codigo,
    tipoProceso: 'llenadora',
  });
  const producto = (codigo: string, extra: object = {}) => ({
    codigo,
    descripcionLarga: `PRODUCTO ${codigo}`,
    descripcionCorta: `PROD ${codigo}`,
    nombre: `PROD ${codigo}`,
    pesoKg: 1.5,
    ...extra,
  });

  /* ------------------------------------------------------------------ */
  describe('C1 · el id nunca se sobrescribe', () => {
    it('422 al intentar cambiar el código de una línea, producto o causa', async () => {
      await post('/lineas', linea('QAC-1')).expect(201);
      const l = await patch('/lineas/LIN-QAC-1', { codigo: 'QAC-3' }).expect(422);
      expect(l.body.details).toHaveProperty('codigo');

      await post('/productos', producto('9990001')).expect(201);
      await patch('/productos/PRD-9990001', { codigo: '9990004' }).expect(422);

      await patch('/causas-parada/CPA-PN-02-A', { codigo: 'PN-02-Z' }).expect(422);
      await patch('/causas-merma/CME-MP-01-A', { codigo: 'MP-01-Z' }).expect(422);
      /* Reenviar el mismo código (lo hace el formulario) sigue permitido. */
      await patch('/lineas/LIN-QAC-1', { codigo: 'QAC-1', nombre: 'Línea QAC 1 bis' }).expect(200);
    });

    it('409 (y la fila intacta) si el id derivado del código ya existe', async () => {
      /* Simula una fila heredada cuyo código ya no coincide con su id. */
      await ds.query(`UPDATE linea SET codigo = 'QAC-5' WHERE id = 'LIN-QAC-1'`);
      const { body } = await post('/lineas', linea('QAC-1')).expect(409);
      expect(body.code).toBe('CONFLICT');
      const [fila] = await ds.query(`SELECT codigo, nombre FROM linea WHERE id = 'LIN-QAC-1'`);
      expect(fila).toMatchObject({ codigo: 'QAC-5', nombre: 'Línea QAC 1 bis' });
      await ds.query(`UPDATE linea SET codigo = 'QAC-1' WHERE id = 'LIN-QAC-1'`);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('A2 · líneas y productos inactivos', () => {
    it('rechaza un par sobre una línea o un producto inactivo', async () => {
      await post('/lineas', linea('QAC-2')).expect(201);
      await del('/lineas/LIN-QAC-2').expect(200);
      const r1 = await post('/velocidades-estandar', {
        productoId: 'PRD-9990001',
        lineaId: 'LIN-QAC-2',
        velocidadUnidHora: 600,
      }).expect(422);
      expect(r1.body.details).toHaveProperty('lineaId');

      await post('/productos', producto('9990002')).expect(201);
      await del('/productos/PRD-9990002').expect(200);
      const r2 = await post('/velocidades-estandar', {
        productoId: 'PRD-9990002',
        lineaId: 'LIN-QAC-1',
        velocidadUnidHora: 600,
      }).expect(422);
      expect(r2.body.details).toHaveProperty('productoId');
    });

    it('la baja de la línea da de baja sus pares; la del producto, los suyos', async () => {
      await post('/lineas', linea('QAC-6')).expect(201);
      await post('/productos', producto('9990006')).expect(201);
      const par = await post('/velocidades-estandar', {
        productoId: 'PRD-9990006',
        lineaId: 'LIN-QAC-6',
        velocidadUnidHora: 600,
      }).expect(201);
      const par2 = await post('/velocidades-estandar', {
        productoId: 'PRD-9990001',
        lineaId: 'LIN-QAC-6',
        velocidadUnidHora: 600,
      }).expect(201);

      /* El filtro por línea sólo ofrece productos activos con par activo. */
      let enLinea = await get('/productos?lineaId=LIN-QAC-6').expect(200);
      expect(enLinea.body.data.map((p: { codigo: string }) => p.codigo).sort()).toEqual([
        '9990001',
        '9990006',
      ]);
      await ds.query(`UPDATE producto SET estado = 'inactivo' WHERE id = 'PRD-9990001'`);
      enLinea = await get('/productos?lineaId=LIN-QAC-6').expect(200);
      expect(enLinea.body.data.map((p: { codigo: string }) => p.codigo)).toEqual(['9990006']);
      await ds.query(`UPDATE producto SET estado = 'activo' WHERE id = 'PRD-9990001'`);

      const baja = await del('/productos/PRD-9990006').expect(200);
      expect(baja.body.mensaje).toContain('1 velocidades');
      const p1 = await get(`/velocidades-estandar?productoId=PRD-9990006`).expect(200);
      expect(p1.body.data[0]).toMatchObject({ id: par.body.id, estado: 'inactivo' });

      /* Desactivar la línea desde el formulario (PATCH estado) también cascadea. */
      await patch('/lineas/LIN-QAC-6', { estado: 'inactivo' }).expect(200);
      const p2 = await get(`/velocidades-estandar?lineaId=LIN-QAC-6`).expect(200);
      const estados = Object.fromEntries(
        p2.body.data.map((p: { id: string; estado: string }) => [p.id, p.estado]),
      );
      expect(estados[par2.body.id]).toBe('inactivo');

      /* Reactivar el par sin reactivar su línea → 422. */
      await patch(`/velocidades-estandar/${par2.body.id}`, { estado: 'activo' }).expect(422);
    });

    it('Tiempo real no lista las líneas inactivas', async () => {
      const { body } = await get('/tiempo-real/lineas').expect(200);
      const ids = (body.lineas as Array<{ lineaId?: string; id?: string }>).map(
        (l) => l.lineaId ?? l.id,
      );
      expect(ids).toContain('LIN-QAC-1');
      expect(ids).not.toContain('LIN-QAC-2');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('A3 · la clasificación se hereda del tipo', () => {
    it('una hija de PP-01 (planificada) nace programada', async () => {
      const { body } = await post('/causas-parada', {
        codigo: 'PP-01-Q9',
        nombre: 'Hija de planificada',
        nivel: 'especifica',
        parentId: 'CPA-PP-01-A',
        clasificacion: 'imprevista',
      }).expect(201);
      expect(body.clasificacion).toBe('programada');
    });

    it('sólo el tipo edita la clasificación y la propaga a su subárbol', async () => {
      await patch('/causas-parada/CPA-PP-01-Q9', { clasificacion: 'imprevista' }).expect(422);
      await post('/causas-parada', { codigo: 'PQ-90', nombre: 'Tipo QA', nivel: 'tipo' }).expect(201);
      await post('/causas-parada', {
        codigo: 'PQ-90-A',
        nombre: 'General QA',
        nivel: 'general',
        parentId: 'CPA-PQ-90',
      }).expect(201);
      await post('/causas-parada', {
        codigo: 'PQ-90-01',
        nombre: 'Específica QA',
        nivel: 'especifica',
        parentId: 'CPA-PQ-90-A',
      }).expect(201);
      await patch('/causas-parada/CPA-PQ-90', { clasificacion: 'programada' }).expect(200);
      const { body } = await get('/causas-parada?formato=plano').expect(200);
      const qa = (body.data as Array<{ codigo: string; clasificacion: string }>).filter((c) =>
        c.codigo.startsWith('PQ-90'),
      );
      expect(qa).toHaveLength(3);
      expect(qa.every((c) => c.clasificacion === 'programada')).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('A4 · la baja de un padre arrastra su subárbol', () => {
    it('DELETE de una general da de baja sus específicas y no se reactivan solas', async () => {
      const { body } = await del('/causas-parada/CPA-PQ-90-A').expect(200);
      expect(body.mensaje).toContain('1 causas que dependían');
      const plano = await get('/causas-parada?formato=plano').expect(200);
      const hija = (plano.body.data as Array<{ id: string; estado: string }>).find(
        (c) => c.id === 'CPA-PQ-90-01',
      );
      expect(hija?.estado).toBe('inactivo');
      const r = await patch('/causas-parada/CPA-PQ-90-01', { estado: 'activo' }).expect(422);
      expect(r.body.details).toHaveProperty('estado');
    });

    it('desactivar un tipo de merma por PATCH también desactiva su subárbol', async () => {
      await post('/causas-merma', { codigo: 'MQ-90', nombre: 'Tipo QA', nivel: 'tipo' }).expect(201);
      await post('/causas-merma', {
        codigo: 'MQ-90-A',
        nombre: 'Clasif QA',
        nivel: 'clasificacion',
        parentId: 'CME-MQ-90',
      }).expect(201);
      await patch('/causas-merma/CME-MQ-90', { estado: 'inactivo' }).expect(200);
      const { body } = await get('/causas-merma?formato=plano').expect(200);
      const hija = (body.data as Array<{ id: string; estado: string }>).find(
        (c) => c.id === 'CME-MQ-90-A',
      );
      expect(hija?.estado).toBe('inactivo');
    });
  });

  /* ------------------------------------------------------------------ */
  describe('A5 · contadores históricos reales', () => {
    it('paradasHistoricas y mermasHistoricas cuentan los registros reales', async () => {
      const [p] = await ds.query(
        `SELECT "causaId" AS id, COUNT(*) AS n FROM parada GROUP BY "causaId" ORDER BY COUNT(*) DESC LIMIT 1`,
      );
      const paradas = await get('/causas-parada?formato=plano').expect(200);
      const causa = (paradas.body.data as Array<{ id: string; paradasHistoricas: number }>).find(
        (c) => c.id === p.id,
      );
      expect(Number(p.n)).toBeGreaterThan(0);
      expect(causa?.paradasHistoricas).toBe(Number(p.n));

      const [m] = await ds.query(
        `SELECT "causaId" AS id, COUNT(*) AS n FROM merma GROUP BY "causaId" ORDER BY COUNT(*) DESC LIMIT 1`,
      );
      const mermas = await get('/causas-merma?formato=plano').expect(200);
      const cm = (mermas.body.data as Array<{ id: string; mermasHistoricas: number }>).find(
        (c) => c.id === m.id,
      );
      expect(cm?.mermasHistoricas).toBe(Number(m.n));
    });
  });

  /* ------------------------------------------------------------------ */
  describe('M1 · concurrencia optimista', () => {
    it('409 al guardar con una versión vieja (línea, producto, par, causas, umbrales)', async () => {
      const l = await get('/lineas').expect(200);
      const qac1 = l.body.data.find((x: { id: string }) => x.id === 'LIN-QAC-1');
      await patch('/lineas/LIN-QAC-1', { nombre: 'Línea A', version: qac1.version }).expect(200);
      const r = await patch('/lineas/LIN-QAC-1', { nombre: 'Línea B', version: qac1.version }).expect(409);
      expect(r.body.code).toBe('CONFLICT');

      const prod = (await get('/productos?search=9990001').expect(200)).body.data[0];
      await patch('/productos/PRD-9990001', { alias: 'x', version: prod.version }).expect(200);
      await patch('/productos/PRD-9990001', { alias: 'y', version: prod.version }).expect(409);

      const par = (await get('/velocidades-estandar?productoId=PRD-1110001').expect(200)).body
        .data[0];
      await patch(`/velocidades-estandar/${par.id}`, { mermaEstandarPct: 1, version: par.version }).expect(200);
      await patch(`/velocidades-estandar/${par.id}`, { mermaEstandarPct: 2, version: par.version }).expect(409);

      const cp = (await get('/causas-parada?formato=plano').expect(200)).body.data.find(
        (c: { id: string }) => c.id === 'CPA-PP-01-Q9',
      );
      await patch('/causas-parada/CPA-PP-01-Q9', { nombre: 'Pestaña A', version: cp.version }).expect(200);
      await patch('/causas-parada/CPA-PP-01-Q9', { tiempoEstandarMin: 33, version: cp.version }).expect(409);

      const cm = (await get('/causas-merma?formato=plano').expect(200)).body.data.find(
        (c: { id: string }) => c.id === 'CME-MP-01-A',
      );
      await patch('/causas-merma/CME-MP-01-A', { nombre: 'Clasif A', version: cm.version }).expect(200);
      await patch('/causas-merma/CME-MP-01-A', { nombre: 'Clasif B', version: cm.version }).expect(409);

      const u = (await get('/alertas/umbrales').expect(200)).body;
      const base = {
        velocidadBajoEstandarPct: u.velocidadBajoEstandarPct,
        oeeMinimo: u.oeeMinimo,
        probabilidadMinima: u.probabilidadMinima,
        notificarN8n: u.notificarN8n,
        mostrarTv: u.mostrarTv,
      };
      await api().put('/api/v1/alertas/umbrales').set(auth()).send({ ...base, oeeMinimo: 80, version: u.version }).expect(200);
      const c = await api()
        .put('/api/v1/alertas/umbrales')
        .set(auth())
        .send({ ...base, tciToleranciaMin: 7, version: u.version })
        .expect(409);
      expect(c.body.code).toBe('CONFLICT');
      /* Sin `version` (clientes antiguos) se sigue aceptando. */
      await api().put('/api/v1/alertas/umbrales').set(auth()).send(base).expect(200);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('M6 · integridad del árbol de causas', () => {
    it.each([
      ['específica sin padre', { codigo: 'PQ-90-02', nombre: 'Huérfana', nivel: 'especifica' }, 'parentId'],
      ['código incoherente con el padre', { codigo: 'PQ-91-07', nombre: 'Incoherente', nivel: 'especifica', parentId: 'CPA-PN-02-A' }, 'codigo'],
      ['tipo con tres segmentos', { codigo: 'PQ-92-05', nombre: 'Tipo mal', nivel: 'tipo' }, 'codigo'],
      ['padre inexistente', { codigo: 'PQ-95-A', nombre: 'Padre fantasma', nivel: 'general', parentId: 'CPA-NOEXISTE' }, 'parentId'],
      ['padre de nivel equivocado', { codigo: 'PN-02-B9', nombre: 'Nivel mal', nivel: 'general', parentId: 'CPA-PN-02-A' }, 'parentId'],
    ])('422: %s', async (_caso, body, campo) => {
      const r = await post('/causas-parada', body).expect(422);
      expect(r.body.details).toHaveProperty(campo);
    });

    it('422 al cambiar el padre o el nivel (antes un padre = sí misma la sacaba del árbol)', async () => {
      await patch('/causas-parada/CPA-PP-01-Q9', { parentId: 'CPA-PP-01-Q9' }).expect(422);
      await patch('/causas-parada/CPA-PP-01-Q9', { nivel: 'tipo' }).expect(422);
      await post('/causas-merma', { codigo: 'MQ-91-01', nombre: 'Sin padre', nivel: 'causa' }).expect(422);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('M7 · 4xx en vez de 500', () => {
    it('capacidad null → 422', async () => {
      const r = await patch('/lineas/LIN-QAC-1', { capacidadUnidadesMin: null }).expect(422);
      expect(r.body.details).toHaveProperty('capacidadUnidadesMin');
      await patch('/lineas/LIN-QAC-1', { capacidadUnidadesMin: 1e308 }).expect(422);
    });

    it('PATCH de par con producto inexistente → 422', async () => {
      const par = (await get('/velocidades-estandar?productoId=PRD-1110001').expect(200)).body
        .data[0];
      const r = await patch(`/velocidades-estandar/${par.id}`, { productoId: 'PRD-NOEXISTE' }).expect(422);
      expect(r.body.details).toHaveProperty('productoId');
    });

    it('dos altas de par simultáneas → dos ids distintos, sin 500', async () => {
      await post('/lineas', linea('QAC-7')).expect(201);
      await post('/lineas', linea('QAC-8')).expect(201);
      const respuestas = await Promise.all(
        ['LIN-QAC-7', 'LIN-QAC-8'].map((lineaId) =>
          post('/velocidades-estandar', { productoId: 'PRD-9990001', lineaId, velocidadUnidHora: 300 }),
        ),
      );
      expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(2);
    });
  });

  /* ------------------------------------------------------------------ */
  describe('B1 · B4 · B5 · B8', () => {
    it('B1: nombres sólo con espacios → 422', async () => {
      const r = await post('/lineas', { ...linea('QAC-91'), nombre: '   ', nombreCorto: '  ' }).expect(422);
      expect(r.body.details).toHaveProperty('nombre');
      await post('/causas-parada', { codigo: 'PQ-93', nombre: '    ', nivel: 'tipo' }).expect(422);
    });

    it('B4: tiempo estándar decimal → mensaje en español', async () => {
      const r = await patch('/causas-parada/CPA-PP-01-Q9', { tiempoEstandarMin: 2.5 }).expect(422);
      expect(r.body.details.tiempoEstandarMin).toBe('Debe ser un número entero de minutos');
    });

    it('B5: el texto del sabor se deriva de saborId', async () => {
      const sabores = (await get('/sabores').expect(200)).body.data as Array<{ id: string; nombre: string }>;
      const sabor = sabores[0]!;
      const { body } = await post('/productos', producto('9990009', { saborId: sabor.id })).expect(201);
      expect(body.sabor).toBe(sabor.nombre);
      const busqueda = await get(`/productos?search=${encodeURIComponent(sabor.nombre)}`).expect(200);
      expect(busqueda.body.data.map((p: { codigo: string }) => p.codigo)).toContain('9990009');
      await post('/productos', producto('9990010', { saborId: 'SAB-NOEXISTE' })).expect(422);
    });

    it('B8: 404 con el género correcto', async () => {
      const { body } = await del('/lineas/LIN-NOPE').expect(404);
      expect(body.message).toBe('Línea no encontrada');
    });
  });
});
