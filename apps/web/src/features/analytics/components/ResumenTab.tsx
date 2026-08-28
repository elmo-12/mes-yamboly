'use client';

import * as React from 'react';
import {
  Badge,
  InsightCard,
  KpiCard,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  type BadgeColor,
} from '@mes/ui';
import type { AnaliticaResumen, TipoAlerta } from '@mes/types';
import { TIPOS_ALERTA, TIPO_ALERTA_LABEL } from '@mes/types';
import { formatNumber, formatPct } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { RiesgoPorLineaChart, colorRiesgo } from './charts/RiesgoPorLineaChart';

export interface ResumenTabProps {
  resumen: AnaliticaResumen;
}

/** Escala de confianza del modelo: ≥85 Success · 70–84 Informational · <70 Neutral. */
export function colorConfianza(confianza: number): BadgeColor {
  if (confianza >= 85) return 'success';
  if (confianza >= 70) return 'informational';
  return 'neutral';
}

/**
 * Estado de la predicción → color de Badge con la semántica MDS documentada
 * (`Activa` = Warning · `Vencida` = Critical · `Atendida`/`Confirmada`/`Validada`
 * = Success · resto Neutral). Antes se pintaba siempre Informational.
 */
export function colorEstadoPrediccion(estado: string): BadgeColor {
  const v = estado.trim().toLowerCase();
  if (v.startsWith('activ')) return 'warning';
  if (v.startsWith('vencid')) return 'critical';
  if (v.startsWith('atendid') || v.startsWith('confirmad') || v.startsWith('validad')) {
    return 'success';
  }
  return 'neutral';
}

/** Confianza del modelo por hallazgo, en el orden en que los devuelve la API. */
const CONFIANZAS = [88, 81, 76] as const;

function esTipoAlerta(v: string): v is TipoAlerta {
  return (TIPOS_ALERTA as readonly string[]).includes(v);
}

/** `parada_prevista` → `Parada prevista`. */
function etiquetaTipo(tipo: string): string {
  return esTipoAlerta(tipo) ? TIPO_ALERTA_LABEL[tipo] : tipo;
}

/** `Analítica / Resumen` (Figma 2156:4301). */
export function ResumenTab({ resumen }: ResumenTabProps) {
  const { kpis, insights, riesgoPorLinea, prediccionesActivas } = resumen;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Exactitud de predicción (EP)"
          value={formatPct(kpis.ep)}
          trend="up"
          favorable
          delta="+2,4 pp"
          context="vs modelo anterior"
        />
        <KpiCard
          label="Precisión"
          value={formatPct(kpis.precision)}
          trend="up"
          favorable
          delta="+1,6 pp"
          context={`sobre ${formatNumber(kpis.alertas30d)} alertas`}
        />
        <KpiCard
          label="Recall"
          value={formatPct(kpis.recall)}
          trend="down"
          favorable={false}
          delta="−1,1 pp"
          context="vs modelo anterior"
        />
        <KpiCard
          label="Alertas generadas (30 d)"
          value={formatNumber(kpis.alertas30d)}
          trend="flat"
          delta="0,0 %"
          context="últimos 30 días"
        />
      </div>

      <SectionTitle
        title="Hallazgos del modelo"
        description="Patrones con mayor impacto detectados en los últimos 90 días de operación"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {insights.map((i, indice) => {
          const confianza = CONFIANZAS[indice] ?? 75;
          return (
            <InsightCard
              key={i.id}
              title={i.texto}
              text={i.soporte}
              confidence={`Confianza ${formatPct(confianza, 0)}`}
              confidenceColor={colorConfianza(confianza)}
            />
          );
        })}
      </div>

      <RiesgoPorLineaChart lineas={riesgoPorLinea} />

      <SectionTitle
        title="Predicciones activas"
        description="Predicciones vigentes generadas por el modelo · se recalculan cada 15 minutos"
      />
      {prediccionesActivas.length === 0 ? (
        <p className="text-body text-text-secondary">
          No hay predicciones vigentes. El modelo evaluará el próximo turno.
        </p>
      ) : (
        <Table density="dense">
          <THead>
            <TRow plain>
              <TH>Línea</TH>
              <TH>Tipo</TH>
              <TH>Evento predicho</TH>
              <TH>Ventana</TH>
              <TH numeric>Probabilidad</TH>
              <TH>Estado</TH>
              <TH>Alerta</TH>
            </TRow>
          </THead>
          <TBody>
            {prediccionesActivas.map((p) => (
              <TRow key={p.id}>
                <TCell className="font-medium">{p.lineaCodigo}</TCell>
                <TCell muted>{etiquetaTipo(p.tipo)}</TCell>
                <TCell>{p.prediccion}</TCell>
                <TCell muted className="tabular whitespace-nowrap">
                  {p.ventana}
                </TCell>
                <TCell numeric>
                  <Badge color={colorRiesgo(p.probabilidad)}>{formatPct(p.probabilidad, 0)}</Badge>
                </TCell>
                <TCell>
                  <Badge color={colorEstadoPrediccion(p.estado)}>{p.estado}</Badge>
                </TCell>
                <TCell>
                  <AppLink href={`/alertas?id=${p.id}`} className="text-body-sm">
                    Ver alerta
                  </AppLink>
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
