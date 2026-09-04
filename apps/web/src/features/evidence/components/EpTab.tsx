'use client';

import {
  Badge,
  Button,
  EmptyState,
  Icon,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
} from '@mes/ui';
import type { EvidenciaEP } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { KpiAnexoCard, KpiRow, PieAnexo, usePaginaLocal } from './evidencia-format';

/**
 * `Evidencia / EP (Anexo 06)` — Figma 2163:18770.
 * KPI PCC/PTG y ficha de evaluación de la analítica: cada predicción se
 * contrasta con el evento realmente observado (alimentada por `/alertas`).
 */
export function EpTab({ ep }: { ep: EvidenciaEP }) {
  const pagina = usePaginaLocal(ep.registros, 12);
  const hayRegistros = ep.prediccionesTotales > 0;
  const falsosPositivos = ep.prediccionesTotales - ep.prediccionesCorrectas;
  const pctFalsos = ep.prediccionesTotales
    ? (falsosPositivos / ep.prediccionesTotales) * 100
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="EP · Exactitud"
          value={ep.porcentaje === null ? null : `${formatNumber(ep.porcentaje, 1)} %`}
          meta={ep.meta}
          estado={hayRegistros ? ep.estado : 'sin_datos'}
          context={
            hayRegistros
              ? `${ep.prediccionesCorrectas} de ${ep.prediccionesTotales} predicciones correctas`
              : 'Se calcula al confirmar el evento real de cada alerta'
          }
        />
        <KpiAnexoCard
          label="Predicciones correctas (PCC)"
          value={ep.prediccionesCorrectas}
          meta={
            hayRegistros
              ? `Meta ≥ ${Math.ceil(ep.prediccionesTotales * 0.8)} de ${ep.prediccionesTotales}`
              : 'Meta ≥ 80 % de las emitidas'
          }
          estado={hayRegistros ? ep.estado : 'sin_datos'}
          context="contrastadas en planta"
        />
        <KpiAnexoCard
          label="Predicciones emitidas (PTG)"
          value={ep.prediccionesTotales}
          meta="Bitácora del modelo"
          estado="referencia"
          context="alertas con evento real confirmado"
        />
        <KpiAnexoCard
          label="Falsos positivos"
          value={falsosPositivos}
          meta="Máximo 20 %"
          estado={hayRegistros ? (pctFalsos <= 20 ? 'cumple' : 'en_riesgo') : 'sin_datos'}
          context={
            hayRegistros
              ? `${formatNumber(pctFalsos, 1)} % sin evento real asociado`
              : 'sin predicciones contrastadas'
          }
        />
      </KpiRow>

      <SectionTitle
        title="Ficha de evaluación de la analítica inteligente (Anexo 06)"
        description="Cada predicción o alerta emitida por el módulo de analítica se contrasta con el evento realmente observado en planta y se marca como acierto o no."
        className="border-b border-divider pb-3"
      />

      {!hayRegistros ? (
        <EmptyState
          icon={<Icon name="radar" size={40} />}
          title="Todavía no hay predicciones contrastadas"
          description="Se calcula al confirmar el evento real de cada alerta en Alertas."
          action={
            <AppLink href="/alertas" className="text-body-md font-medium">
              Ir a Alertas
            </AppLink>
          }
        />
      ) : (
      <div className="flex flex-col">
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-14">N.º</TH>
              <TH className="w-30">Fecha</TH>
              <TH>Tipo de predicción / alerta</TH>
              <TH className="w-70">Evento real observado</TH>
              <TH className="w-25">¿Acierto?</TH>
              <TH className="w-50">Observación</TH>
            </tr>
          </THead>
          <TBody>
            {pagina.filas.map((registro) => (
              <TRow key={registro.id} plain>
                <TCell muted>{registro.n}</TCell>
                <TCell muted className="tabular">
                  {formatDate(registro.fecha)}
                </TCell>
                <TCell className="whitespace-normal">{registro.tipoPrediccion}</TCell>
                <TCell muted className="whitespace-normal">
                  {registro.eventoReal}
                </TCell>
                <TCell>
                  <Badge color={registro.acierto ? 'success' : 'critical'}>
                    {registro.acierto ? 'Sí' : 'No'}
                  </Badge>
                </TCell>
                <TCell muted className="whitespace-normal">
                  {registro.observacion || '—'}
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>

        <PieAnexo
          texto={`Mostrando ${(pagina.page - 1) * pagina.pageSize + 1}–${
            (pagina.page - 1) * pagina.pageSize + pagina.filas.length
          } de ${pagina.total} predicciones · PCC = ${ep.prediccionesCorrectas} · PTG = ${
            ep.prediccionesTotales
          } · EP = (${ep.prediccionesCorrectas} / ${ep.prediccionesTotales}) × 100 = ${formatNumber(
            ep.porcentaje ?? 0,
            1,
          )} % · Meta ${ep.meta}`}
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina.page <= 1}
                onClick={() => pagina.setPage(pagina.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina.page >= pagina.totalPages}
                onClick={() => pagina.setPage(pagina.page + 1)}
              >
                Siguiente
              </Button>
            </>
          }
        />
      </div>
      )}
    </div>
  );
}
