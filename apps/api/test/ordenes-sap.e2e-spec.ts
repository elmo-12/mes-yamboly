import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { turnoDeInstante, ahoraPlanta } from '@mes/shared';
import { OrdenFabricacion } from '../src/database/entities';
import { OrdenesSapService } from '../src/modules/ordenes-sap/ordenes-sap.service';
import type { FilaSapOrigen } from '../src/modules/ordenes-sap/origen-sap';
import { CREDENCIALES, crearApp, login } from './app.factory';

describe('órdenes SAP (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const pendientes = async (query: string) => {
    const { body } = await request(app.getHttpServer())
      .get(`/api/v1/ordenes-sap?${query}`)
      .set(auth())
      .expect(200);
    return body.data as Array<Record<string, unknown>>;
  };

  /** Deja la línea sin orden en curso (una sola en curso por línea). */
  const liberarLinea = (lineaId: string) =>
    app
      .get(DataSource)
      .getRepository(OrdenFabricacion)
      .update({ lineaId, estado: 'en_curso' }, { estado: 'por_validar', fin: ahoraPlanta() });

  const crear = (ordenSapId: string) =>
    request(app.getHttpServer())
      .post('/api/v1/ordenes')
      .set(auth())
      .send({
        ordenSapId,
        lote: `L-TEST-${ordenSapId}`,
        vencimiento: '2027-02-28',
        maquinistaId: 'USR-07',
        supervisorId: 'USR-03',
        operarios: 4,
      });

  it('lista las pendientes de una línea con producto mapeado, por fecha y turno', async () => {
    const data = await pendientes('lineaId=LIN-MOLD-A4');

    expect(data.map((o) => o.id)).toEqual(['SAPD-033', 'SAPD-034', 'SAPD-035', 'SAPD-036']);
    expect(data.every((o) => o.lineaId === 'LIN-MOLD-A4' && o.ordenId === null)).toBe(true);
    expect(data[0]).toMatchObject({
      numero: '95101733',
      turno: 'N',
      codigoProducto: '1120074',
      productoNombre: 'MAXI GOLD VAI LUC 36X78ML',
      lineaCodigo: 'MOLD-A4',
      planificadoCajas: 4500,
      unidadesPorCaja: 36,
      planificadoUnidades: 4500 * 36,
      velocidadUnidHora: 27500,
      velocidadEstandar: 458.3,
      velocidadFuente: 'par',
    });
    /* El número SAP no es único: el parcial repite el número en otra fila. */
    expect(data[2].numero).toBe(data[1].numero);
  });

  it('busca por número, código o producto y oculta las filas sin producto mapeado', async () => {
    expect((await pendientes('q=95101733')).map((o) => o.id)).toEqual(['SAPD-033']);
    expect((await pendientes('lineaId=LIN-LLEN-A1&q=1120072')).map((o) => o.id)).toEqual([
      'SAPD-009',
      'SAPD-011',
    ]);
    expect((await pendientes('q=praia-fresa')).map((o) => o.id)).toEqual(['SAPD-034', 'SAPD-036']);

    const extr2 = (await pendientes('lineaId=LIN-EXTR-2')).map((o) => o.id);
    expect(extr2).toContain('SAPD-090');
    expect(extr2).not.toContain('SAPD-092');
  });

  it('crea la orden desde la fila SAP y la fila deja de estar pendiente; repetirla es 409', async () => {
    await liberarLinea('LIN-MOLD-A4');
    const { body } = await crear('SAPD-033').expect(201);
    expect(body).toMatchObject({
      id: 'ORD-95101733',
      codigo: '95101733',
      lineaId: 'LIN-MOLD-A4',
      productoId: 'PRD-1120074',
      /* El turno es el de la hora real de inicio; el del plan SAP queda en `planSap`. */
      turno: turnoDeInstante(ahoraPlanta()),
      planSap: { ordenSapId: 'SAPD-033', numero: '95101733', turno: 'N' },
      planificado: 162000,
      velocidadEstandar: 458.3,
      velocidadEstandarId: 'VE-0092',
      estado: 'en_curso',
    });

    expect((await pendientes('lineaId=LIN-MOLD-A4')).map((o) => o.id)).not.toContain('SAPD-033');

    const repetida = await crear('SAPD-033').expect(409);
    expect(repetida.body.code).toBe('CONFLICT');
  });

  it('el mismo número SAP en otra fila crea otra orden con sufijo -2', async () => {
    await liberarLinea('LIN-MOLD-A4');
    const primera = await crear('SAPD-034').expect(201);
    await liberarLinea('LIN-MOLD-A4');
    const parcial = await crear('SAPD-035').expect(201);
    expect(primera.body).toMatchObject({ id: 'ORD-95101734', codigo: '95101734' });
    expect(parcial.body).toMatchObject({
      id: 'ORD-95101734-2',
      codigo: '95101734-2',
      planSap: { turno: 'N' },
    });
  });

  it('responde 404 si la orden SAP no existe', async () => {
    const { body } = await crear('SAPD-999').expect(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('sin par activo usa la velocidad del texto SAP; sin ninguna, 422 en ordenSapId', async () => {
    /* PRD-1120002 no tiene par en LIN-EXTR-2: la velocidad sale de «7200 u/h». */
    await liberarLinea('LIN-EXTR-2');
    const { body } = await crear('SAPD-090').expect(201);
    expect(body).toMatchObject({
      lineaId: 'LIN-EXTR-2',
      velocidadEstandar: 120,
      velocidadEstandarId: null,
      planificado: 800 * 12,
    });

    const sinVelocidad = await crear('SAPD-091').expect(422);
    expect(sinVelocidad.body.code).toBe('VALIDATION_ERROR');
    expect(sinVelocidad.body.details).toHaveProperty('ordenSapId');

    const sinProducto = await crear('SAPD-092').expect(422);
    expect(sinProducto.body.details).toHaveProperty('ordenSapId');
  });

  it('valida el cuerpo: ordenSapId es obligatorio', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ordenes')
      .set(auth())
      .send({
        lote: 'L-TEST',
        vencimiento: '2027-02-28',
        maquinistaId: 'USR-07',
        supervisorId: 'USR-03',
        operarios: 2,
      })
      .expect(422);
  });

  it('sincronizar exige rol y responde 503 sin origen configurado', async () => {
    const maquinista = await login(app, CREDENCIALES.maquinista);
    await request(app.getHttpServer())
      .post('/api/v1/ordenes-sap/sincronizar')
      .set({ Authorization: `Bearer ${maquinista}` })
      .expect(403);

    const { body } = await request(app.getHttpServer())
      .post('/api/v1/ordenes-sap/sincronizar')
      .set(auth())
      .expect(503);
    expect(body.code).toBe('ORIGEN_NO_CONFIGURADO');
  });

  it('aplicar: upsert sin pisar ordenId y limpieza de las pendientes que ya no vienen', async () => {
    const servicio = app.get(OrdenesSapService);
    const fila = (sapId: number, cambios: Partial<FilaSapOrigen> = {}): FilaSapOrigen => ({
      sapId,
      numero: `9520${sapId}`,
      fecha: '2026-10-01',
      turno: '1',
      codigoProducto: '1120079',
      producto: 'PRAIA-FRESA 40X70ML',
      lineaProduccion: 'MOLDEADORA A4',
      velocidadEstandarTexto: '24400 u/h',
      planificadoCajas: 1000,
      tipoProduccion: 'Produccion',
      ...cambios,
    });

    const primera = await servicio.aplicar([
      fila(1),
      fila(2, { turno: '2', codigoProducto: '1999999', velocidadEstandarTexto: ' u/h' }),
      fila(3, { lineaProduccion: 'MIXPLANT 2' }),
    ]);
    expect(primera).toMatchObject({
      leidas: 3,
      insertadas: 2,
      actualizadas: 0,
      omitidas: 1,
      sinProducto: 1,
    });

    const listadas = await pendientes('lineaId=LIN-MOLD-A4&q=95201');
    expect(listadas.map((o) => o.id)).toEqual(['SAP-1']);
    expect(listadas[0]).toMatchObject({ turno: 'D', velocidadUnidHora: 24400 });

    /* El MES consume SAP-1; el origen todavía la ve libre y cambia el plan. */
    await liberarLinea('LIN-MOLD-A4');
    await crear('SAP-1').expect(201);
    const segunda = await servicio.aplicar([fila(1, { planificadoCajas: 1200 }), fila(2)]);
    expect(segunda).toMatchObject({ insertadas: 0, actualizadas: 2, eliminadas: 0 });
    await crear('SAP-1').expect(409);

    /* SAP-2 desaparece del origen (consumida allí): se borra. SAP-1 sigue consumida
     * y las de demostración (`SAPD-…`) no se tocan. */
    const tercera = await servicio.aplicar([fila(1)]);
    expect(tercera).toMatchObject({ eliminadas: 1 });
    expect((await pendientes('q=95202')).length).toBe(0);
    expect((await pendientes('lineaId=LIN-MOLD-A4')).map((o) => o.id)).toContain('SAPD-036');
  });
});
