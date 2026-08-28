'use client';

import {
  Badge,
  Button,
  Checkbox,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
} from '@mes/ui';
import type { EvidenciaTCI } from '@mes/types';
import { TURNO_LABEL } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { KpiAnexoCard, KpiRow, NotaAnexo, PieAnexo, usePaginaLocal } from './evidencia-format';

/**
 * `Evidencia / TCI (Anexo 03)` — Figma 2163:10456.
 * KPI RC/RT y ficha de registro con los tres criterios de validación evaluados
 * por el motor de reglas (RF15): completo, preciso y trazable.
 */
export function TciTab({ tci }: { tci: EvidenciaTCI }) {
  const pagina = usePaginaLocal(tci.registros);

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="TCI postest"
          value={`${formatNumber(tci.porcentaje, 1)} %`}
          meta={tci.meta}
          estado={tci.estado}
          context={`${tci.registrosCorrectos} de ${tci.registrosTotales} registros correctos`}
        />
        <KpiAnexoCard
          label="Registros válidos (RC)"
          value={tci.registrosCorrectos}
          meta={`Meta ≥ ${Math.ceil(tci.registrosTotales * 0.9)} de ${tci.registrosTotales}`}
          estado={tci.estado}
          context="cumplen los tres criterios"
        />
        <KpiAnexoCard
          label="Registros totales (RT)"
          value={tci.registrosTotales}
          meta={`Meta = ${tci.registrosTotales} registros`}
          context="muestra completa"
        />
        <KpiAnexoCard
          label="Registros no válidos"
          value={tci.registrosTotales - tci.registrosCorrectos}
          meta="Se corrigen en la bitácora"
          context="incumplen algún criterio"
        />
      </KpiRow>

      <SectionTitle
        title="Ficha de registro — Calidad de la información productiva (Anexo 03)"
        description="Cada registro se evalúa contra tres criterios. Es válido solo si cumple los tres: completo, preciso y trazable."
        className="border-b border-divider pb-3"
      />

      <div className="flex flex-col">
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-14">N.º</TH>
              <TH className="w-45">Fecha / Turno</TH>
              <TH>Registro</TH>
              <TH className="w-25 text-center">¿Completo?</TH>
              <TH className="w-25 text-center">¿Preciso?</TH>
              <TH className="w-25 text-center">¿Trazable?</TH>
              <TH className="w-30">¿Registro válido?</TH>
              <TH className="w-50">Observación</TH>
            </tr>
          </THead>
          <TBody>
            {pagina.filas.map((registro) => (
              <TRow key={registro.id} plain>
                <TCell muted>{registro.n}</TCell>
                <TCell muted className="tabular">
                  {formatDate(registro.fecha)} · {TURNO_LABEL[registro.turno]}
                </TCell>
                <TCell>{registro.registro}</TCell>
                <CeldaCriterio valor={registro.completo} etiqueta="Completo" n={registro.n} />
                <CeldaCriterio valor={registro.preciso} etiqueta="Preciso" n={registro.n} />
                <CeldaCriterio valor={registro.trazable} etiqueta="Trazable" n={registro.n} />
                <TCell>
                  <Badge color={registro.valido ? 'success' : 'critical'}>
                    {registro.valido ? 'Válido' : 'No válido'}
                  </Badge>
                </TCell>
                <TCell muted>{registro.observacion || '—'}</TCell>
              </TRow>
            ))}
          </TBody>
        </Table>

        <PieAnexo
          texto={`Mostrando ${(pagina.page - 1) * pagina.pageSize + 1}–${
            (pagina.page - 1) * pagina.pageSize + pagina.filas.length
          } de ${pagina.total} registros · RC = ${tci.registrosCorrectos} · RT = ${
            tci.registrosTotales
          } · TCI = (${tci.registrosCorrectos} / ${tci.registrosTotales}) × 100 = ${formatNumber(
            tci.porcentaje,
            1,
          )} %`}
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

      <NotaAnexo
        titulo="Reglas de validación aplicadas por el MES (RF15)"
        detalle="Completo: todos los campos obligatorios del formulario están informados. · Preciso: los valores están dentro de rango y son coherentes con la orden de fabricación. · Trazable: el registro conserva usuario, máquina, línea, turno y marca temporal de creación y de última edición."
      />
    </div>
  );
}

/** Criterio evaluado por reglas: se muestra, no se edita (no hay endpoint de override). */
function CeldaCriterio({ valor, etiqueta, n }: { valor: boolean; etiqueta: string; n: number }) {
  return (
    <TCell className="text-center">
      <span className="inline-grid place-items-center">
        <Checkbox
          size="sm"
          checked={valor}
          tabIndex={-1}
          aria-readonly
          className="pointer-events-none"
          aria-label={`Registro ${n}: ${etiqueta} ${valor ? 'sí' : 'no'}`}
        />
      </span>
    </TCell>
  );
}
