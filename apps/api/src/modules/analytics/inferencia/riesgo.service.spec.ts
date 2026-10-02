import { RiesgoService } from './riesgo.service';
import type { PredictionContext, PredictionProvider, PredictionResult } from '../../alerts/prediction';

/**
 * Cobertura del punto D5 del plan: `ejecutarCiclo` puntúa cada línea con el
 * `PREDICTION_PROVIDER` completo (con `features`) y luego dispara
 * `AlertsEngineService.evaluar()`, que internamente puede volver a pedir una
 * probabilidad para el mismo tipo/línea/turno pero con un contexto más
 * estrecho. Este test comprueba que `RiesgoService` deja precargada (vía
 * `precalcular`) la respuesta que ya calculó, para que esa segunda llamada la
 * reutilice en vez de recibir una probabilidad distinta.
 */
describe('RiesgoService — coherencia de la probabilidad entre predict() y evaluar() (D5)', () => {
  function construirServicio() {
    const resultado: PredictionResult = { probabilidad: 61, factores: [{ texto: 'x', contribucion: 100 }] };
    const proveedor = {
      nombre: 'cascada:python-http',
      predict: jest.fn().mockResolvedValue(resultado),
      precalcular: jest.fn(),
    } satisfies Required<Pick<PredictionProvider, 'predict' | 'precalcular' | 'nombre'>>;
    const motor = {
      evaluar: jest.fn().mockResolvedValue([]),
      vencerCaducadas: jest.fn().mockResolvedValue(0),
    };
    const dataset = {
      construirVivoLote: jest.fn().mockResolvedValue(
        new Map([
          [
            'LIN-1',
            {
              features: {
                paradasImprev7d: 5,
                paradasImprev30d: 14,
                desvioVelocidadTurnoPrevio: -6,
                oeeTurnoPrevio: 58,
              },
            },
          ],
        ]),
      ),
    };
    const lineas = {
      find: jest.fn().mockResolvedValue([
        { id: 'LIN-1', codigo: 'LLEN-M1', nombre: 'Llenadora M1', estado: 'activo', capacidadUnidadesMin: 100 },
      ]),
    };
    const paradas = { find: jest.fn().mockResolvedValue([]) };
    /* `lineasConHistorial()`: solo se puntúan líneas con al menos una orden (M6). */
    const qb = {
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ lineaId: 'LIN-1' }]),
    };
    const ordenes = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const causas = { find: jest.fn().mockResolvedValue([]) };
    const predicciones = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue([]),
    };
    const alertas = { find: jest.fn().mockResolvedValue([]) };
    const versiones = { findOne: jest.fn().mockResolvedValue(null) };

    const service = new RiesgoService(
      dataset as never,
      motor as never,
      proveedor as never,
      lineas as never,
      paradas as never,
      ordenes as never,
      causas as never,
      predicciones as never,
      alertas as never,
      versiones as never,
    );

    return { service, proveedor, motor, resultado };
  }

  it('precarga en el proveedor el resultado ya calculado antes de llamar a evaluar()', async () => {
    const { service, proveedor, motor, resultado } = construirServicio();

    await service.ejecutarCiclo({ generarAlertas: true, persistir: false });

    expect(proveedor.predict).toHaveBeenCalledTimes(1);
    const ctxUsado = proveedor.predict.mock.calls[0]![0] as PredictionContext;
    expect(ctxUsado.tipo).toBe('parada_prevista');
    expect(ctxUsado.lineaId).toBe('LIN-1');
    expect(ctxUsado.features).toBeDefined();

    expect(proveedor.precalcular).toHaveBeenCalledTimes(1);
    const [ctxPrecargado, resultadoPrecargado] = proveedor.precalcular.mock.calls[0]!;
    expect(ctxPrecargado.tipo).toBe('parada_prevista');
    expect(ctxPrecargado.lineaId).toBe('LIN-1');
    expect(ctxPrecargado.turno).toBe(ctxUsado.turno);
    expect(resultadoPrecargado).toBe(resultado);

    /* El orden importa: hay que precargar antes de disparar el motor, si no la
     * llamada interna de `evaluar()` no encontraría nada que reutilizar. */
    const ordenPrecalcular = proveedor.precalcular.mock.invocationCallOrder[0]!;
    const ordenEvaluar = motor.evaluar.mock.invocationCallOrder[0]!;
    expect(ordenPrecalcular).toBeLessThan(ordenEvaluar);
  });
});
