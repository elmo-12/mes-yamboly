import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, CREDENCIALES, login } from './app.factory';

/**
 * CRUD de mantenedores sobre el maestro real de Yamboly: 9 sedes, 9 líneas,
 * 41 sabores, 201 productos, 333 pares producto × línea, 33 máquinas,
 * 83 causas de parada y 56 causas de merma (ver `catalogs.ts`).
 */
describe('catálogos — mantenedores (e2e)', () => {
  let app: INestApplication;
  let jefeToken: string;
  let supervisorToken: string;
  let maquinistaToken: string;

  beforeAll(async () => {
    app = await crearApp();
    jefeToken = await login(app, CREDENCIALES.jefe);
    supervisorToken = await login(app, { email: 'ana.rios@yamboly.lat', password: 'Yamboly2026' });
    maquinistaToken = await login(app, CREDENCIALES.maquinista);
  });

  afterAll(async () => {
    await app.close();
  });

  const jefe = () => ({ Authorization: `Bearer ${jefeToken}` });
  const supervisor = () => ({ Authorization: `Bearer ${supervisorToken}` });
  const maquinista = () => ({ Authorization: `Bearer ${maquinistaToken}` });
  const server = () => app.getHttpServer();

  /* ------------------------------------------------------------------ */
  /* Conteos con datos reales (se ejecutan antes de cualquier mutación)  */
  /* ------------------------------------------------------------------ */

  describe('conteos con datos reales', () => {
    it('lista las 9 líneas reales (4 llenadoras / 2 extrusoras / 3 moldeadoras)', async () => {
      const { body } = await request(server()).get('/api/v1/lineas').set(jefe()).expect(200);
      expect(body.data).toHaveLength(9);
      const porTipo = (body.data as Array<{ tipoProceso: string }>).reduce<Record<string, number>>(
        (acc, l) => ({ ...acc, [l.tipoProceso]: (acc[l.tipoProceso] ?? 0) + 1 }),
        {},
      );
      expect(porTipo).toMatchObject({ llenadora: 4, extrusora: 2, moldeadora: 3 });
    });

    it('lista las 9 sedes reales', async () => {
      const { body } = await request(server()).get('/api/v1/sedes').set(jefe()).expect(200);
      expect(body.data).toHaveLength(9);
    });

    it('lista los 2 turnos reales D (Día) y N (Noche)', async () => {
      const { body } = await request(server()).get('/api/v1/turnos').set(jefe()).expect(200);
      expect(body.data).toHaveLength(2);
      expect(body.data.map((t: { codigo: string }) => t.codigo).sort()).toEqual(['D', 'N']);
    });

    it('lista los 41 sabores reales', async () => {
      const { body } = await request(server()).get('/api/v1/sabores').set(jefe()).expect(200);
      expect(body.data).toHaveLength(41);
    });

    it('lista los 201 productos reales, todos activos y con código de 7 dígitos', async () => {
      const { body } = await request(server()).get('/api/v1/productos').set(jefe()).expect(200);
      expect(body.data).toHaveLength(201);
      const productos = body.data as Array<{ estado: string; codigo: string }>;
      expect(productos.every((p) => p.estado === 'activo')).toBe(true);
      expect(productos.every((p) => /^\d{7}$/.test(p.codigo))).toBe(true);
    });

    it('lista las 333 velocidades estándar, todas ≤ 1000 u/min y consistentes con u/h', async () => {
      const { body } = await request(server())
        .get('/api/v1/velocidades-estandar')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(333);
      const pares = body.data as Array<{ velocidadUnidHora: number; velocidadUnidMin: number }>;
      expect(pares.every((p) => p.velocidadUnidMin <= 1000)).toBe(true);
      expect(
        pares.every(
          (p) => p.velocidadUnidMin === Math.round((p.velocidadUnidHora / 60) * 10) / 10,
        ),
      ).toBe(true);
    });

    it('devuelve las 83 causas de parada en formato plano (5 raíces) con hojas con codigoLegado', async () => {
      const { body: arbol } = await request(server())
        .get('/api/v1/causas-parada')
        .set(jefe())
        .expect(200);
      expect(arbol.data).toHaveLength(5);
      expect(arbol.data[0]).toHaveProperty('hijos');

      const { body: plano } = await request(server())
        .get('/api/v1/causas-parada?formato=plano')
        .set(jefe())
        .expect(200);
      expect(plano.data).toHaveLength(83);
      expect(plano.data[0]).not.toHaveProperty('hijos');
      const especifica = (plano.data as Array<{ id: string; codigoLegado: string | null }>).find(
        (c) => c.id === 'CPA-PN-02-01',
      );
      expect(especifica?.codigoLegado).toBe('FAL02');
    });

    it('devuelve las 56 causas de merma (5 raíces en árbol) y parentId resuelve en plano', async () => {
      const { body: arbol } = await request(server())
        .get('/api/v1/causas-merma')
        .set(jefe())
        .expect(200);
      expect(arbol.data).toHaveLength(5);

      const { body: plano } = await request(server())
        .get('/api/v1/causas-merma?formato=plano')
        .set(jefe())
        .expect(200);
      expect(plano.data).toHaveLength(56);
      const ids = new Set((plano.data as Array<{ id: string }>).map((c) => c.id));
      const huerfanas = (plano.data as Array<{ parentId: string | null }>).filter(
        (c) => c.parentId && !ids.has(c.parentId),
      );
      expect(huerfanas).toHaveLength(0);
    });

    it('lista las 33 máquinas (equipos de línea)', async () => {
      const { body } = await request(server()).get('/api/v1/maquinas').set(jefe()).expect(200);
      expect(body.data).toHaveLength(33);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Sedes                                                              */
  /* ------------------------------------------------------------------ */

  describe('sedes', () => {
    it('el jefe crea una sede', async () => {
      const { body } = await request(server())
        .post('/api/v1/sedes')
        .set(jefe())
        .send({ codigo: 'CUZC', nombre: 'Cusco', ciudad: 'Cusco' })
        .expect(201);
      expect(body).toMatchObject({ id: 'SED-CUSCO', codigo: 'CUZC', nombre: 'Cusco' });
    });

    it('409 al repetir el código de una sede existente', async () => {
      const { body } = await request(server())
        .post('/api/v1/sedes')
        .set(jefe())
        .send({ codigo: 'LIMA', nombre: 'Lima Norte', ciudad: 'Lima' })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('422 con código de sede inválido', async () => {
      const { body } = await request(server())
        .post('/api/v1/sedes')
        .set(jefe())
        .send({ codigo: 'cz', nombre: 'Cajazul', ciudad: 'Cajamarca' })
        .expect(422);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toHaveProperty('codigo');
    });

    it('el jefe edita una sede', async () => {
      const { body } = await request(server())
        .patch('/api/v1/sedes/SED-CUSCO')
        .set(jefe())
        .send({ ciudad: 'Cusco (centro histórico)' })
        .expect(200);
      expect(body.ciudad).toBe('Cusco (centro histórico)');
    });

    it('403 si un supervisor intenta crear una sede', async () => {
      const { body } = await request(server())
        .post('/api/v1/sedes')
        .set(supervisor())
        .send({ codigo: 'PUNO', nombre: 'Puno', ciudad: 'Puno' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Productos                                                          */
  /* ------------------------------------------------------------------ */

  describe('productos', () => {
    const nuevoProducto = {
      codigo: '9999001',
      descripcionLarga: 'CUBETA YAMBOLY HELADO PRUEBA E2E 1 X 5 L',
      descripcionCorta: 'CUB-YAM-E2E 1X5L',
      nombre: 'CUB-YAM-E2E 1X5L',
      pesoKg: 2.5,
    };

    it('el jefe crea un producto válido', async () => {
      const { body } = await request(server())
        .post('/api/v1/productos')
        .set(jefe())
        .send(nuevoProducto)
        .expect(201);
      expect(body).toMatchObject({ id: 'PRD-9999001', codigo: '9999001', estado: 'activo' });
    });

    it('409 al repetir el código de un producto existente', async () => {
      const { body } = await request(server())
        .post('/api/v1/productos')
        .set(jefe())
        .send({ ...nuevoProducto, codigo: '1110001' })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('422 con código que no tiene 7 dígitos', async () => {
      const { body } = await request(server())
        .post('/api/v1/productos')
        .set(jefe())
        .send({ ...nuevoProducto, codigo: '12345' })
        .expect(422);
      expect(body.details).toHaveProperty('codigo');
    });

    it('422 con pesoKg menor o igual a 0', async () => {
      const { body } = await request(server())
        .post('/api/v1/productos')
        .set(jefe())
        .send({ ...nuevoProducto, codigo: '9999002', pesoKg: 0 })
        .expect(422);
      expect(body.details).toHaveProperty('pesoKg');
    });

    it('el supervisor edita el producto', async () => {
      const { body } = await request(server())
        .patch('/api/v1/productos/PRD-9999001')
        .set(supervisor())
        .send({ nombre: 'CUB-YAM-E2E 1X5L (editado)' })
        .expect(200);
      expect(body.nombre).toBe('CUB-YAM-E2E 1X5L (editado)');
    });

    it('GET /productos?search= filtra por código, nombre o descripción', async () => {
      const { body } = await request(server())
        .get('/api/v1/productos?search=capuccino')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(4);
      expect(body.data.map((p: { id: string }) => p.id)).toContain('PRD-1110001');
    });

    it('GET /productos?lineaId= solo incluye productos con par activo en esa línea', async () => {
      const { body } = await request(server())
        .get('/api/v1/productos?lineaId=LIN-LLEN-M2')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(120);
      expect(body.data.map((p: { id: string }) => p.id)).toContain('PRD-1110001');
    });

    it('DELETE da de baja el producto y conserva sus órdenes', async () => {
      const { body } = await request(server())
        .delete('/api/v1/productos/PRD-1110001')
        .set(jefe())
        .expect(200);
      expect(body).toMatchObject({
        id: 'PRD-1110001',
        codigo: '1110001',
        estado: 'inactivo',
        etiquetaConservados: 'órdenes',
      });
      /* ORD-0814 referencia este producto; el seed histórico puede sumar más. */
      expect(body.conservados).toBeGreaterThanOrEqual(1);
      expect(body.mensaje).toContain('1110001');
    });

    it('403 si un maquinista intenta crear un producto', async () => {
      const { body } = await request(server())
        .post('/api/v1/productos')
        .set(maquinista())
        .send({ ...nuevoProducto, codigo: '9999003' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Velocidades estándar (par producto × línea)                       */
  /* ------------------------------------------------------------------ */

  describe('velocidades estándar', () => {
    let nuevoParId: string;

    it('el jefe crea el par y la API calcula velocidadUnidMin', async () => {
      const { body } = await request(server())
        .post('/api/v1/velocidades-estandar')
        .set(jefe())
        .send({ productoId: 'PRD-9999001', lineaId: 'LIN-LLEN-A2', velocidadUnidHora: 605 })
        .expect(201);
      expect(body).toMatchObject({
        productoId: 'PRD-9999001',
        lineaId: 'LIN-LLEN-A2',
        velocidadUnidHora: 605,
        velocidadUnidMin: 10.1,
      });
      nuevoParId = body.id;
    });

    it('409 al repetir el par producto × línea', async () => {
      const { body } = await request(server())
        .post('/api/v1/velocidades-estandar')
        .set(jefe())
        .send({ productoId: 'PRD-1110001', lineaId: 'LIN-LLEN-M2', velocidadUnidHora: 480 })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('422 si el producto o la línea no existen', async () => {
      const producto = await request(server())
        .post('/api/v1/velocidades-estandar')
        .set(jefe())
        .send({ productoId: 'PRD-INEXISTENTE', lineaId: 'LIN-LLEN-A2', velocidadUnidHora: 480 })
        .expect(422);
      expect(producto.body.details).toHaveProperty('productoId');

      const linea = await request(server())
        .post('/api/v1/velocidades-estandar')
        .set(jefe())
        .send({ productoId: 'PRD-9999001', lineaId: 'LIN-INEXISTENTE', velocidadUnidHora: 480 })
        .expect(422);
      expect(linea.body.details).toHaveProperty('lineaId');
    });

    it('el supervisor edita u/h y la API recalcula u/min', async () => {
      const { body } = await request(server())
        .patch(`/api/v1/velocidades-estandar/${nuevoParId}`)
        .set(supervisor())
        .send({ velocidadUnidHora: 900 })
        .expect(200);
      expect(body).toMatchObject({ velocidadUnidHora: 900, velocidadUnidMin: 15 });
    });

    it('el listado enriquece el par con productoCodigo, lineaCodigo y tipoProceso', async () => {
      const { body } = await request(server())
        .get('/api/v1/velocidades-estandar?productoId=PRD-9999001')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        productoCodigo: '9999001',
        lineaCodigo: 'LLEN-A2',
        tipoProceso: 'llenadora',
      });
    });

    it('DELETE da de baja el par y conserva las órdenes que lo congelaron', async () => {
      const { body } = await request(server())
        .delete('/api/v1/velocidades-estandar/VE-0002')
        .set(jefe())
        .expect(200);
      expect(body).toMatchObject({ id: 'VE-0002', estado: 'inactivo' });
      /* ORD-0814 congeló este par; el seed histórico puede sumar más. */
      expect(body.conservados).toBeGreaterThanOrEqual(1);
      expect(body.etiquetaConservados).toBe('órdenes');
    });

    it('403 si un maquinista intenta crear un par', async () => {
      const { body } = await request(server())
        .post('/api/v1/velocidades-estandar')
        .set(maquinista())
        .send({ productoId: 'PRD-9999001', lineaId: 'LIN-LLEN-A1', velocidadUnidHora: 480 })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Causas de merma                                                    */
  /* ------------------------------------------------------------------ */

  describe('causas de merma', () => {
    it('el jefe crea una hoja bajo una clasificación real', async () => {
      const { body } = await request(server())
        .post('/api/v1/causas-merma')
        .set(jefe())
        .send({
          codigo: 'MP-01-Z9',
          nombre: 'Causa de prueba e2e',
          nivel: 'causa',
          parentId: 'CME-MP-01-A',
        })
        .expect(201);
      expect(body).toMatchObject({
        id: 'CME-MP-01-Z9',
        codigo: 'MP-01-Z9',
        nivel: 'causa',
        parentId: 'CME-MP-01-A',
        estado: 'activo',
      });
    });

    it('409 al repetir el código de una causa de merma existente', async () => {
      const { body } = await request(server())
        .post('/api/v1/causas-merma')
        .set(jefe())
        .send({ codigo: 'MP-01-01', nombre: 'Duplicada', nivel: 'causa', parentId: 'CME-MP-01-A' })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('422 con código de causa de merma con formato inválido', async () => {
      const { body } = await request(server())
        .post('/api/v1/causas-merma')
        .set(jefe())
        .send({ codigo: 'ZZZZZ', nombre: 'Inválida', nivel: 'causa', parentId: 'CME-MP-01-A' })
        .expect(422);
      expect(body.details).toHaveProperty('codigo');
    });

    it('el supervisor edita requiereSolicitud y lineasAplicables', async () => {
      const { body } = await request(server())
        .patch('/api/v1/causas-merma/CME-MP-01-Z9')
        .set(supervisor())
        .send({ requiereSolicitud: true, lineasAplicables: ['LIN-LLEN-M2'] })
        .expect(200);
      expect(body).toMatchObject({ requiereSolicitud: true, lineasAplicables: ['LIN-LLEN-M2'] });
    });

    it('DELETE da de baja la causa y las mermas sembradas la siguen referenciando', async () => {
      const { body } = await request(server())
        .delete('/api/v1/causas-merma/CME-MP-01-01')
        .set(jefe())
        .expect(200);
      expect(body).toMatchObject({ id: 'CME-MP-01-01', estado: 'inactivo' });
      expect(body.conservados).toBeGreaterThan(0);
      expect(body.etiquetaConservados).toBe('mermas');

      const { body: mermas } = await request(server())
        .get('/api/v1/ordenes/ORD-0815/mermas')
        .set(jefe())
        .expect(200);
      const merma = (mermas.data as Array<{ causaId: string; causaCodigo: string }>).find(
        (m) => m.causaId === 'CME-MP-01-01',
      );
      expect(merma).toBeDefined();
      expect(merma?.causaCodigo).toBe('MP-01-01');
    });

    it('403 si un maquinista intenta crear una causa de merma', async () => {
      const { body } = await request(server())
        .post('/api/v1/causas-merma')
        .set(maquinista())
        .send({ codigo: 'MP-01-Y1', nombre: 'Sin permiso', nivel: 'causa', parentId: 'CME-MP-01-A' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Máquinas (equipos de línea)                                       */
  /* ------------------------------------------------------------------ */

  describe('máquinas', () => {
    it('el jefe edita código, nombre, tipo y línea de una máquina', async () => {
      const { body } = await request(server())
        .patch('/api/v1/maquinas/MAQ-33')
        .set(jefe())
        .send({
          nombre: 'Túnel de frío MOLD A4 (renovado)',
          tipo: 'Túnel de frío',
          lineaId: 'LIN-MOLD-A3',
        })
        .expect(200);
      expect(body).toMatchObject({
        id: 'MAQ-33',
        nombre: 'Túnel de frío MOLD A4 (renovado)',
        lineaId: 'LIN-MOLD-A3',
      });
    });

    it('422 con código de máquina que no cumple ^MQ-[A-Z0-9]{2,6}-\\d{2}$', async () => {
      const { body } = await request(server())
        .patch('/api/v1/maquinas/MAQ-33')
        .set(jefe())
        .send({ codigo: 'INVALIDO' })
        .expect(422);
      expect(body.details).toHaveProperty('codigo');
    });

    it('DELETE da de baja la máquina y conserva sus paradas', async () => {
      const { body } = await request(server())
        .delete('/api/v1/maquinas/MAQ-08')
        .set(jefe())
        .expect(200);
      expect(body).toMatchObject({ id: 'MAQ-08', estado: 'baja' });
      expect(body.conservados).toBeGreaterThan(0);
      expect(body.etiquetaConservados).toBe('paradas');
    });

    it('403 si un maquinista intenta editar una máquina', async () => {
      const { body } = await request(server())
        .patch('/api/v1/maquinas/MAQ-01')
        .set(maquinista())
        .send({ nombre: 'Sin permiso' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Causas de parada                                                   */
  /* ------------------------------------------------------------------ */

  describe('causas de parada', () => {
    it('el jefe crea una causa con codigoLegado', async () => {
      const { body } = await request(server())
        .post('/api/v1/causas-parada')
        .set(jefe())
        .send({
          codigo: 'PN-02-99',
          nombre: 'Causa de prueba e2e',
          nivel: 'especifica',
          parentId: 'CPA-PN-02-A',
          codigoLegado: 'LEG-99',
        })
        .expect(201);
      expect(body).toMatchObject({
        id: 'CPA-PN-02-99',
        codigo: 'PN-02-99',
        codigoLegado: 'LEG-99',
      });
    });

    it('DELETE devuelve paradasConservadas y conservados coherentes', async () => {
      const { body } = await request(server())
        .delete('/api/v1/causas-parada/CPA-PN-02-01')
        .set(jefe())
        .expect(200);
      expect(body).toMatchObject({ id: 'CPA-PN-02-01', estado: 'inactivo' });
      expect(body.conservados).toBeGreaterThan(0);
      expect(body.paradasConservadas).toBe(body.conservados);
    });

    it('403 si un maquinista intenta dar de baja una causa de parada', async () => {
      const { body } = await request(server())
        .delete('/api/v1/causas-parada/CPA-PN-02-02')
        .set(maquinista())
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });
});
