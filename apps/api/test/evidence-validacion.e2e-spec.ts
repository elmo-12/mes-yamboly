import type { INestApplication } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { CREDENCIALES, crearApp, login } from './app.factory';

/**
 * Flujo real de la evidencia de tesis (fase 3):
 * estado vacío → captura real → importación de fuentes externas → validación
 * del Anexo 03 → override manual → encuesta → CFS → alerta confirmada.
 *
 * Los fixtures XLSX se generan aquí con exceljs para que el archivo subido sea
 * exactamente el que produciría la plantilla descargable.
 */

/** Día congelado de los seeds operativos (`database/seeds/data/seed.ts`). */
const DIA = '2026-08-28';

interface Criterio {
  clave: string;
  label: string;
  cumple: boolean;
  detalle: string;
}
interface Evaluacion {
  id: string;
  registroId: string;
  tipoRegistro: string;
  valido: boolean;
  criterios: Criterio[];
}

async function xlsx(cabeceras: string[], filas: (string | number | null)[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Datos');
  hoja.addRow(cabeceras);
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('evidencia · importación y validación de calidad (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let tokenMaquinista: string;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app, CREDENCIALES.jefe);
    tokenMaquinista = await login(app, CREDENCIALES.maquinista);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (ruta: string) =>
    request(app.getHttpServer()).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
  const post = (ruta: string) =>
    request(app.getHttpServer()).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
  const patch = (ruta: string) =>
    request(app.getHttpServer()).patch(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);

  /* ---------------------------------------------------------------- */
  /* Estado inicial: sólo el pretest                                   */
  /* ---------------------------------------------------------------- */

  it('arranca con los 4 KPI del postest en «sin datos» y el pretest en 2,9 min', async () => {
    const { body } = await get('/evidencia/resumen').expect(200);
    const porId = Object.fromEntries(
      (body.kpis as { id: string; valor: number | null; estado: string; detalle: string }[]).map(
        (k) => [k.id, k],
      ),
    );

    for (const id of ['TRI', 'TCI', 'TSP', 'EP']) {
      expect(porId[id]).toMatchObject({ valor: null, estado: 'sin_datos' });
    }
    expect(porId.TRI!.detalle).toContain('2,9 min');
    /* Las 9 funcionalidades arrancan sin verificar: sin datos, no 0 %. */
    expect(porId.CFS).toMatchObject({ valor: null, estado: 'sin_datos' });

    expect(body.comparativaTri).toEqual([
      { etapa: 'Pretest', minutos: 2.9 },
      { etapa: 'Postest', minutos: null },
    ]);

    const tri = await get('/evidencia/tri').expect(200);
    expect(tri.body.pretest).toHaveLength(10);
    expect(tri.body.postest).toHaveLength(0);
    expect(tri.body.promedioPretest).toBe(2.9);
    expect(tri.body.promedioPostest).toBeNull();
    expect(tri.body.reduccionPct).toBeNull();

    const tci = await get('/evidencia/tci').expect(200);
    expect(tci.body.data).toHaveLength(0);
    expect(tci.body.resumen).toMatchObject({ registrosTotales: 0, porcentaje: null, estado: 'sin_datos' });
    expect(tci.body.resumen.fuentes.map((f: { tipo: string; filas: number }) => [f.tipo, f.filas])).toEqual([
      ['sensores', 0],
      ['solicitudes', 0],
      ['sap_mermas', 0],
    ]);
  });

  it('registrar una parada real crea la primera fila del postest del Anexo 02', async () => {
    await post('/paradas')
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        causaId: 'CPA-PN-04-02',
        inicio: `${DIA}T15:20:00`,
        accionTomada: 'Se cambió el lote de insumo y se verificó la especificación',
        responsableId: 'USR-07',
        tiempoRegistroSeg: 66,
      })
      .expect(201);

    const { body } = await get('/evidencia/tri').expect(200);
    expect(body.postest).toHaveLength(1);
    expect(body.promedioPostest).toBe(1.1);
    expect(body.reduccionPct).toBe(-62.1);
    expect(body.estado).toBe('cumple');
  });

  /* ---------------------------------------------------------------- */
  /* Plantillas e importación de fuentes externas                      */
  /* ---------------------------------------------------------------- */

  it('descarga la plantilla XLSX de cada fuente y 404 con un tipo desconocido', async () => {
    for (const tipo of ['sensores', 'solicitudes', 'sap_mermas']) {
      const respuesta = await get(`/evidencia/fuentes/${tipo}/plantilla`).expect(200);
      expect(respuesta.headers['content-type']).toContain('spreadsheetml');
      expect(respuesta.headers['content-disposition']).toContain('.xlsx');
    }
    await get('/evidencia/fuentes/inventado/plantilla').expect(404);
  });

  it('importa las lecturas de sensor y rechaza la fila de una línea inexistente', async () => {
    const archivo = await xlsx(
      ['linea', 'fecha_hora', 'estado', 'velocidad_unid_min'],
      [
        ['LLEN-A1', `${DIA} 06:00`, 'PRODUCIENDO', 133],
        ['LLEN-A1', `${DIA} 07:42`, 'PARADA', null],
        ['LLEN-A1', `${DIA} 07:56`, 'PRODUCIENDO', 132],
        ['LLEN-A1', `${DIA} 09:08`, 'PRODUCIENDO', 130],
        ['LLEN-A1', `${DIA} 11:18`, 'PARADA', null],
        ['LLEN-A1', `${DIA} 11:27`, 'PRODUCIENDO', 131],
        /* Fila 8: la línea no existe en el maestro → rechazo con motivo. */
        ['LLEN-Z9', `${DIA} 08:00`, 'PRODUCIENDO', 100],
        /* Fila 9: estado fuera del enum. */
        ['LLEN-A1', `${DIA} 13:00`, 'DETENIDA', null],
      ],
    );

    const { body } = await post('/evidencia/fuentes/sensores/importar')
      .attach('archivo', archivo, 'sensores.xlsx')
      .expect(201);

    expect(body).toMatchObject({
      tipo: 'sensores',
      archivo: 'sensores.xlsx',
      filasOk: 6,
      filasRechazadas: 2,
      filasDuplicadas: 0,
      periodo: { desde: DIA, hasta: DIA },
    });
    expect(body.rechazos).toEqual([
      { fila: 8, motivo: 'La línea «LLEN-Z9» no existe en el maestro' },
      { fila: 9, motivo: 'Estado «DETENIDA» fuera de PRODUCIENDO | PARADA' },
    ]);

    /* Reimportar el mismo archivo no duplica: la clave natural es línea + hora. */
    const repetido = await post('/evidencia/fuentes/sensores/importar')
      .attach('archivo', archivo, 'sensores.xlsx')
      .expect(201);
    expect(repetido.body).toMatchObject({ filasOk: 0, filasDuplicadas: 6 });

    const historial = await get('/evidencia/fuentes/sensores/importaciones').expect(200);
    expect(historial.body.data).toHaveLength(2);
    /* Dos importaciones del mismo segundo: el id correlativo desempata y la
       más reciente encabeza el historial y el resumen de la fuente. */
    expect(historial.body.data[0].id > historial.body.data[1].id).toBe(true);
    const fuentes = await get('/evidencia/fuentes').expect(200);
    const sensores = fuentes.body.data.find((f: { tipo: string }) => f.tipo === 'sensores');
    expect(sensores.ultimaImportacion.id).toBe(historial.body.data[0].id);
  });

  it('rechaza con 422 el archivo al que le falta una columna obligatoria', async () => {
    /* «Fecha y hora» no normaliza a `fecha_hora`: sin mapeo la columna no
       existe y todas las filas caerían con un motivo que oculta la causa. */
    const archivo = await xlsx(
      ['Línea', 'Fecha y hora', 'Estado'],
      [['LLEN-A1', `${DIA} 06:00`, 'PRODUCIENDO']],
    );
    const { body } = await post('/evidencia/fuentes/sensores/importar')
      .attach('archivo', archivo, 'sin-columna.xlsx')
      .expect(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.archivo).toContain('fecha_hora');

    /* Con el mapeo que envía el wizard de la web sí entra. */
    const ok = await post('/evidencia/fuentes/sensores/importar')
      .field('mapeo', JSON.stringify({ linea: 'Línea', fecha_hora: 'Fecha y hora', estado: 'Estado' }))
      .attach('archivo', archivo, 'sin-columna.xlsx')
      .expect(201);
    expect(ok.body.filasOk + ok.body.filasDuplicadas).toBe(1);
  });

  it('importa solicitudes y transferencias SAP con el mapeo de columnas', async () => {
    const solicitudes = await xlsx(
      ['numero_solicitud', 'fecha', 'linea', 'tipo', 'estado', 'descripcion'],
      [
        ['SM-2026-0421', DIA, 'LLEN-A1', 'MANTENIMIENTO', 'ATENDIDA', 'Cambio de retén de la tapadora'],
        ['SM-2026-0999', DIA, 'EXTR-2', 'MERMA', 'ABIERTA', 'Descarte en tolva'],
      ],
    );
    const resultadoSolicitudes = await post('/evidencia/fuentes/solicitudes/importar')
      .attach('archivo', solicitudes, 'solicitudes.xlsx')
      .expect(201);
    expect(resultadoSolicitudes.body).toMatchObject({ filasOk: 2, filasRechazadas: 0 });

    /* El archivo de SAP trae cabeceras propias del ERP: se corrigen con `mapeo`. */
    const sap = await xlsx(
      ['Documento', 'Fecha contable', 'Centro', 'Material', 'Cantidad', 'Clase', 'Texto'],
      [
        ['4900012345', '28/08/2026', 'LLEN-A1', '1120002', 3.3, 'EP', 'Merma de arranque'],
        /* Producto inexistente en el maestro → rechazo. */
        ['4900012346', '28/08/2026', 'LLEN-A1', '9999999', 1.2, 'PT', 'Documento de prueba'],
      ],
    );
    const { body } = await post('/evidencia/fuentes/sap_mermas/importar')
      .field(
        'mapeo',
        JSON.stringify({
          documento: 'Documento',
          fecha: 'Fecha contable',
          linea: 'Centro',
          codigo_producto: 'Material',
          cantidad_kg: 'Cantidad',
          tipo_merma: 'Clase',
          motivo: 'Texto',
        }),
      )
      .attach('archivo', sap, 'sap.xlsx')
      .expect(201);

    expect(body).toMatchObject({ filasOk: 1, filasRechazadas: 1 });
    expect(body.rechazos[0].motivo).toBe('El producto «9999999» no existe en el maestro');

    const fuentes = await get('/evidencia/fuentes').expect(200);
    const porTipo = Object.fromEntries(
      (fuentes.body.data as { tipo: string; filas: number }[]).map((f) => [f.tipo, f.filas]),
    );
    expect(porTipo).toEqual({ sensores: 6, solicitudes: 2, sap_mermas: 1 });
  });

  it('acepta un CSV con separador «;», cabeceras con tildes y coma decimal', async () => {
    const csv = [
      'Línea;Fecha / Hora;Estado;Velocidad (unid/min)',
      `LLEN-M2;28/08/2026 10:15;PRODUCIENDO;48,5`,
      `LLEN-M2;28/08/2026 10:30;PARADA;`,
    ].join('\n');

    const { body } = await post('/evidencia/fuentes/sensores/importar')
      .field('mapeo', JSON.stringify({ velocidad_unid_min: 'Velocidad (unid/min)' }))
      .attach('archivo', Buffer.from(csv, 'utf8'), 'sensores.csv')
      .expect(201);

    expect(body).toMatchObject({ filasOk: 2, filasRechazadas: 0, periodo: { desde: DIA, hasta: DIA } });

    /* Un `mapeo` que no es JSON válido es un 422 tipado. */
    await post('/evidencia/fuentes/sensores/importar')
      .field('mapeo', 'esto-no-es-json')
      .attach('archivo', Buffer.from(csv, 'utf8'), 'sensores.csv')
      .expect(422);
  });

  it('rechaza un archivo que no es XLSX ni CSV y devuelve 403 al maquinista', async () => {
    await post('/evidencia/fuentes/sensores/importar')
      .attach('archivo', Buffer.from('no soy una tabla'), 'notas.txt')
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/evidencia/fuentes/sensores/importar')
      .set('Authorization', `Bearer ${tokenMaquinista}`)
      .attach('archivo', await xlsx(['linea'], [['LLEN-A1']]), 'x.xlsx')
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/evidencia/tci/validar')
      .set('Authorization', `Bearer ${tokenMaquinista}`)
      .send({ desde: DIA, hasta: DIA })
      .expect(403);
  });

  /* ---------------------------------------------------------------- */
  /* Validación del Anexo 03                                           */
  /* ---------------------------------------------------------------- */

  it('valida el día contra las fuentes y marca válidos los registros trazables', async () => {
    const { body } = await post('/evidencia/tci/validar')
      .send({ desde: DIA, hasta: DIA, tipos: ['parada', 'merma', 'velocidad'] })
      .expect(200);

    expect(body.registrosTotales).toBeGreaterThan(0);
    expect(body.ultimaValidacion).toMatchObject({ desde: DIA, hasta: DIA });
    /* Sólo la Llenadora A1 tiene fuentes externas cargadas para ese día. */
    expect(body.porTipo.parada.correctos).toBe(2);
    expect(body.porTipo.merma.correctos).toBe(1);
    expect(body.porTipo.velocidad.correctos).toBe(1);
    expect(body.porcentaje).toBe(
      Math.round((4 / body.registrosTotales) * 1000) / 10,
    );
    expect(body.estado).toBe('no_cumple');

    const registros = body.registros as Evaluacion[];
    const porRegistro = new Map(registros.map((r) => [r.registroId, r]));

    /* Parada con tramo de sensor coincidente: 07:42–07:56. */
    const par01 = porRegistro.get('PAR-0815-01')!;
    expect(par01.valido).toBe(true);
    expect(par01.criterios.map((c) => c.clave)).toEqual(['completo', 'sensor', 'solicitud']);
    expect(par01.criterios[1]!.detalle).toBe(
      'Sensor: parada detectada 07:42–07:56, registro 07:42–07:56 (Δ inicio 0 min)',
    );
    expect(par01.criterios[2]!.detalle).toBe('La causa PP-01-10 no exige n.º de solicitud');

    /* Parada con n.º de solicitud: se comprueba contra la importación. */
    const par03 = porRegistro.get('PAR-0815-03')!;
    expect(par03.valido).toBe(true);
    /* La causa PN-02-01 no exige solicitud, pero el registro trae una y se
       verifica igual: el detalle debe explicar por qué se comprobó. */
    expect(par03.criterios[2]!.detalle).toBe(
      'Solicitud SM-2026-0421 verificada aunque la causa PN-02-01 no la exige (registrada el 28/08/2026)',
    );

    /* Parada sin tramo de sensor cerca: falla por Δ inicio. */
    const par02 = porRegistro.get('PAR-0815-02')!;
    expect(par02.valido).toBe(false);
    expect(par02.criterios[1]!.cumple).toBe(false);
    expect(par02.criterios[1]!.detalle).toContain('Δ inicio');

    /* Merma contrastada con la transferencia SAP: 3,3 kg vs 3,2 kg = 3,1 %. */
    const mer01 = porRegistro.get('MER-0815-01')!;
    expect(mer01.valido).toBe(true);
    expect(mer01.criterios.map((c) => c.clave)).toEqual(['completo', 'sap', 'solicitud']);
    expect(mer01.criterios[1]!.detalle).toBe('SAP: doc 4900012345 3,3 kg (Δ 3,1 %)');

    /* La otra merma del mismo producto y día se sale de la tolerancia de kg. */
    const mer02 = porRegistro.get('MER-0815-02')!;
    expect(mer02.valido).toBe(false);
    expect(mer02.criterios[1]!.detalle).toContain('kg registrados');

    /* Velocidad contra la lectura de sensor más cercana (09:08). */
    const vel01 = porRegistro.get('VEL-0815-01')!;
    expect(vel01.valido).toBe(true);
    expect(vel01.criterios.map((c) => c.clave)).toEqual(['completo', 'sensor']);
    expect(vel01.criterios[1]!.detalle).toBe(
      'Sensor 09:08: 130,0 u/min vs 131,0 u/min registradas (Δ 0,8 %)',
    );

    /* La parada registrada en este mismo test no tiene sensor de esa línea. */
    const sinSensor = registros.find((r) => r.criterios.some((c) => c.detalle.startsWith('Sin lecturas de sensor')));
    expect(sinSensor?.valido).toBe(false);
  });

  it('filtra la ficha del Anexo 03 por tipo, resultado y fecha', async () => {
    const validas = await get(`/evidencia/tci?tipo=parada&resultado=valido&desde=${DIA}&hasta=${DIA}&pageSize=50`).expect(200);
    expect(validas.body.data.map((r: Evaluacion) => r.registroId).sort()).toEqual([
      'PAR-0815-01',
      'PAR-0815-03',
    ]);
    expect(validas.body.meta.total).toBe(2);

    const invalidas = await get('/evidencia/tci?tipo=merma&resultado=invalido&pageSize=5').expect(200);
    expect(invalidas.body.data.every((r: Evaluacion) => !r.valido)).toBe(true);
    expect(invalidas.body.data.length).toBeLessThanOrEqual(5);

    const vacio = await get('/evidencia/tci?desde=2030-01-01&hasta=2030-01-02').expect(200);
    expect(vacio.body.data).toHaveLength(0);
  });

  it('un override manual por criterio cambia si el registro es válido', async () => {
    const antes = await get('/evidencia/tci/resumen').expect(200);

    const { body } = await patch('/evidencia/tci/TCI-PAR-0815-02')
      .send({ overrides: { sensor: true }, observacion: 'Sensor fuera de servicio; validado con la bitácora' })
      .expect(200);

    expect(body.item.valido).toBe(true);
    expect(body.item.overrides).toEqual({ sensor: true });
    expect(body.item.criterios[1]!.detalle).toContain('Override manual (válido)');
    expect(body.item.observacion).toContain('bitácora');
    expect(body.resumen.registrosCorrectos).toBe(antes.body.registrosCorrectos + 1);

    /* `null` devuelve el criterio al resultado de la regla. */
    const revertido = await patch('/evidencia/tci/TCI-PAR-0815-02')
      .send({ overrides: { sensor: null } })
      .expect(200);
    expect(revertido.body.item.valido).toBe(false);
    expect(revertido.body.resumen.registrosCorrectos).toBe(antes.body.registrosCorrectos);

    await patch('/evidencia/tci/TCI-NO-EXISTE').send({ overrides: { sensor: true } }).expect(404);
  });

  it('revalidar conserva los overrides puestos a mano', async () => {
    await patch('/evidencia/tci/TCI-PAR-0815-02').send({ overrides: { sensor: true } }).expect(200);

    await post('/evidencia/tci/validar').send({ desde: DIA, hasta: DIA }).expect(200);

    const { body } = await get(`/evidencia/tci?tipo=parada&resultado=valido&desde=${DIA}&hasta=${DIA}&pageSize=50`).expect(200);
    expect(body.data.map((r: Evaluacion) => r.registroId)).toContain('PAR-0815-02');

    await patch('/evidencia/tci/TCI-PAR-0815-02').send({ overrides: { sensor: null } }).expect(200);
  });

  /* ---------------------------------------------------------------- */
  /* TSP · CFS · EP                                                    */
  /* ---------------------------------------------------------------- */

  it('una invitación TSP habilita la encuesta pública y mueve el KPI', async () => {
    const vacio = await get('/evidencia/tsp').expect(200);
    expect(vacio.body).toMatchObject({ invitados: 0, respuestas: 0, pctAcuerdo: null, estado: 'sin_datos' });
    expect(vacio.body.invitaciones).toHaveLength(0);

    const { body } = await post('/evidencia/tsp/invitaciones')
      .send({ invitado: 'Jorge Quispe', rol: 'Maquinista' })
      .expect(201);
    const invitacion = body.invitacion as { token: string; url: string; respondida: boolean };
    expect(invitacion.token).toMatch(/^tsp-\d{4}-01$/);
    expect(invitacion.url).toContain(`/encuesta/${invitacion.token}`);
    expect(invitacion.respondida).toBe(false);
    expect(body.resumen.invitados).toBe(1);

    const publica = await request(app.getHttpServer())
      .get(`/api/v1/encuesta/${invitacion.token}`)
      .expect(200);
    expect(publica.body.items).toHaveLength(8);

    await request(app.getHttpServer())
      .post(`/api/v1/encuesta/${invitacion.token}`)
      .send({ respuestas: [5, 4, 4, 5, 4, 4, 5, 4] })
      .expect(201);

    const tsp = await get('/evidencia/tsp').expect(200);
    expect(tsp.body).toMatchObject({ respuestas: 1, invitados: 1, pctAcuerdo: 100, estado: 'cumple' });
    expect(tsp.body.invitaciones[0]).toMatchObject({ invitado: 'Jorge Quispe', respondida: true });

    await request(app.getHttpServer())
      .post('/api/v1/evidencia/tsp/invitaciones')
      .set('Authorization', `Bearer ${tokenMaquinista}`)
      .send({ invitado: 'Ana Ríos' })
      .expect(403);
  });

  it('marcar una funcionalidad deja el CFS en 1 / 9', async () => {
    const { body } = await patch('/evidencia/cfs/CFS-1')
      .send({ cumple: true, observacion: 'Verificado en /tiempo-real con cronómetro TRI' })
      .expect(200);
    expect(body.item.verificadaEn).toEqual(expect.any(String));
    expect(body.resumen).toMatchObject({
      cumplidas: 1,
      verificadas: 1,
      totales: 9,
      porcentaje: 11.1,
      estado: 'no_cumple',
    });
  });

  it('una funcionalidad revisada que no cumple suma verificación pero no cumplimiento', async () => {
    const { body } = await patch('/evidencia/cfs/CFS-8')
      .send({ cumple: false, observacion: 'Pendiente de reentrenar el modelo de analítica' })
      .expect(200);
    expect(body.item).toMatchObject({ cumple: false });
    expect(body.item.verificadaEn).toEqual(expect.any(String));
    expect(body.resumen).toMatchObject({ cumplidas: 1, verificadas: 2, porcentaje: 11.1 });
  });

  it('confirmar una alerta crea la primera fila del Anexo 06', async () => {
    const vacio = await get('/evidencia/ep').expect(200);
    expect(vacio.body).toMatchObject({ prediccionesTotales: 0, porcentaje: null, estado: 'sin_datos' });

    await post('/alertas/ALE-001/atender')
      .send({ accionTomada: 'Se detuvo la línea y se purgó la boquilla de la envolvedora' })
      .expect(200);
    await post('/alertas/ALE-001/confirmar')
      .send({ ocurrio: true, observacion: 'La parada ocurrió a las 15:02' })
      .expect(200);

    const { body } = await get('/evidencia/ep').expect(200);
    expect(body).toMatchObject({
      prediccionesTotales: 1,
      prediccionesCorrectas: 1,
      porcentaje: 100,
      estado: 'cumple',
    });
  });

  it('la exportación de evidencia genera un XLSX con todas las hojas', async () => {
    const { body } = await post('/evidencia/exportar')
      .send({ kpis: ['TRI', 'TCI', 'TSP', 'CFS', 'EP'], formato: 'xlsx', destino: 'spss' })
      .expect(202);

    let estado = 'generando';
    for (let intento = 0; intento < 40 && estado !== 'listo'; intento += 1) {
      await new Promise((r) => setTimeout(r, 100));
      const historial = await get('/reportes/exportaciones').expect(200);
      estado = historial.body.data.find((j: { id: string }) => j.id === body.id).estado;
    }
    expect(estado).toBe('listo');

    const descarga = await get(`/reportes/exportaciones/${body.id}/descargar`).expect(200);
    expect(descarga.headers['content-type']).toContain('spreadsheetml');
  });
});
