'use client';

import {
  Badge,
  Button,
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
import { KpiAnexoCard, KpiRow, PieAnexo, usePaginaLocal } from './evidencia-format';

/**
 * `Evidencia / EP (Anexo 06)` — Figma 2163:18770.
 * KPI PCC/PTG y ficha de evaluación de la analítica: cada predicción se
 * contrasta con el evento realmente observado (alimentada por `/alertas`).
 */
export function EpTab({ ep }: { ep: EvidenciaEP }) {
  const pagina = usePaginaLocal(ep.registros, 12);
  const falsosPositivos = ep.prediccionesTotales - ep.prediccionesCorrectas;
  const pctFalsos = ep.prediccionesTotales
    ? (falsosPositivos / ep.prediccionesTotales) * 100
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="EP · Exactitud"
          value={`${formatNumber(ep.porcentaje, 1)} %`}
          meta={ep.meta}
          estado={ep.estado}
          context={`${ep.prediccionesCorrectas} de ${ep.prediccionesTotales} predicciones correctas`}
        />
        <KpiAnexoCard
          label="Predicciones correctas (PCC)"
          value={ep.prediccionesCorrectas}
          meta={`Meta ≥ ${Math.ceil(ep.prediccionesTotales * 0.8)} de ${ep.prediccionesTotales}`}
          estado={ep.estado}
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
          estado={pctFalsos <= 20 ? 'cumple' : 'en_riesgo'}
          context={`${formatNumber(pctFalsos, 1)} % sin evento real asociado`}
        />
      </KpiRow>

      <SectionTitle
        title="Ficha de evaluación de la analítica inteligente (Anexo 06)"
        description="Cada predicción o alerta emitida por el módulo de analítica se contrasta con el evento realmente observado en planta y se marca como acierto o no."
        className="border-b border-divider pb-3"
      />

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
            ep.porcentaje,
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
    </div>
  );
}
