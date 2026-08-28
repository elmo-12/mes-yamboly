import { Injectable } from '@nestjs/common';
import type { FactorAlerta } from '@mes/types';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';

function acotar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function round1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Proveedor por defecto: puntúa el contexto con pesos fijos, sin aleatoriedad.
 * El mismo contexto siempre devuelve la misma probabilidad y los mismos factores,
 * lo que hace reproducibles las cifras de EP del Anexo 06.
 */
@Injectable()
export class RuleBasedPredictionProvider implements PredictionProvider {
  readonly nombre = 'reglas';

  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    const historico = acotar(ctx.eventos7d * 9 + ctx.eventos30d * 1.2, 0, 55);
    const velocidad = acotar(Math.abs(Math.min(0, ctx.desvioVelocidadPct)) * 4, 0, 35);
    const oee = acotar((85 - ctx.oeeActual) * 1.5, 0, 30);
    const cambio = ctx.minutosDesdeCambio > 0 && ctx.minutosDesdeCambio <= 60
      ? acotar(25 - ctx.minutosDesdeCambio * 0.25, 0, 25)
      : 0;

    const bruto = 45 + historico * 0.45 + velocidad * 0.5 + oee * 0.5 + cambio * 0.4;
    const probabilidad = round1(acotar(bruto, 50, 97));

    const crudos: FactorAlerta[] = [
      { texto: `${ctx.eventos7d} eventos en ${ctx.lineaCodigo} en los últimos 7 días`, contribucion: historico },
      { texto: `Velocidad ${round1(ctx.desvioVelocidadPct)} % frente al estándar`, contribucion: velocidad },
      { texto: `OEE acumulado ${round1(ctx.oeeActual)} %`, contribucion: oee },
      { texto: `Cambio de producto hace ${ctx.minutosDesdeCambio} min`, contribucion: cambio },
    ].filter((f) => f.contribucion > 0);

    return { probabilidad, factores: this.normalizar(crudos) };
  }

  /** Reparte las contribuciones sobre 100 y deja los 3 factores más influyentes. */
  private normalizar(factores: FactorAlerta[]): FactorAlerta[] {
    const top = [...factores].sort((a, b) => b.contribucion - a.contribucion).slice(0, 3);
    const total = top.reduce((a, f) => a + f.contribucion, 0);
    if (total <= 0) return top.map((f) => ({ ...f, contribucion: 0 }));
    const normalizados = top.map((f) => ({ ...f, contribucion: Math.round((f.contribucion / total) * 100) }));
    /* El redondeo se ajusta en el primer factor para que la suma sea 100. */
    const suma = normalizados.reduce((a, f) => a + f.contribucion, 0);
    if (normalizados[0]) normalizados[0].contribucion += 100 - suma;
    return normalizados;
  }
}
