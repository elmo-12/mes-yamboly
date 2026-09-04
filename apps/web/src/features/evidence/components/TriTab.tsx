'use client';

import * as React from 'react';
import {
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
import type { EvidenciaTRI, RegistroTRI } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { CargarPretestModal } from './CargarPretestModal';
import {
  KpiAnexoCard,
  KpiRow,
  NotaAnexo,
  PieAnexo,
  usePaginaLocal,
} from './evidencia-format';

/**
 * `Evidencia / TRI (Anexo 02)` — Figma 2163:4263.
 * KPI ΣTR/n, hoja de observación del postest (automática desde Captura) y
 * bloque del pretest manual con carga de la hoja digitalizada. El postest
 * empieza vacío: se llena con cada captura real registrada en el MES.
 */
export function TriTab({ tri }: { tri: EvidenciaTRI }) {
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const postest = usePaginaLocal(tri.postest);
  const pretest = usePaginaLocal(tri.pretest);

  const hayPostest = tri.postest.length > 0;
  const sumaPostest = tri.postest.reduce((acc, r) => acc + r.tiempoMin, 0);
  const sumaPretest = tri.pretest.reduce((acc, r) => acc + r.tiempoMin, 0);

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="TRI postest (MES)"
          value={hayPostest ? `${formatNumber(tri.promedioPostest ?? 0, 2)} min` : null}
          meta={hayPostest ? '≥ 40 % red.' : 'Meta ≥ 40 % red.'}
          estado={hayPostest ? tri.estado : 'sin_datos'}
          context={
            hayPostest
              ? `vs ${formatNumber(tri.promedioPretest, 2)} min pretest`
              : 'Se calcula con cada captura real del MES'
          }
        />
        <KpiAnexoCard
          label="TRI pretest (manual)"
          value={`${formatNumber(tri.promedioPretest, 2)} min`}
          meta="Línea base I1"
          estado="referencia"
          context={`n = ${tri.pretest.length} · hoja de observación`}
        />
        <KpiAnexoCard
          label="Reducción lograda"
          value={hayPostest ? `${formatNumber(Math.abs(tri.reduccionPct ?? 0), 1)} %` : null}
          meta="Meta ≥ 40 %"
          estado={hayPostest ? tri.estado : 'sin_datos'}
          context="respecto al registro manual"
        />
        <KpiAnexoCard
          label="Eventos medidos"
          value={tri.postest.length}
          meta={hayPostest ? 'Muestra en curso' : 'Aún sin eventos'}
          estado={hayPostest ? tri.estado : 'sin_datos'}
          context="capturas cronometradas por el MES"
        />
      </KpiRow>

      <SectionTitle
        title="Hoja de observación — Tiempo de registro (Anexo 02)"
        description="El MES marca la hora de apertura del formulario y la hora de guardado (RF14); el tiempo de registro se calcula y almacena por evento."
        className="border-b border-divider pb-3"
      />

      {hayPostest ? (
        <div className="flex flex-col">
          <TablaTri filas={postest.filas} />
          <PieAnexo
            texto={`Mostrando ${(postest.page - 1) * postest.pageSize + 1}–${
              (postest.page - 1) * postest.pageSize + postest.filas.length
            } de ${postest.total} eventos · ΣTR = ${formatNumber(sumaPostest, 1)} min · n = ${
              tri.postest.length
            } · TRI = ${formatNumber(tri.promedioPostest ?? 0, 2)} min`}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={postest.page <= 1}
                  onClick={() => postest.setPage(postest.page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={postest.page >= postest.totalPages}
                  onClick={() => postest.setPage(postest.page + 1)}
                >
                  Siguiente
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="stopwatch" size={40} />}
          title="Todavía no hay eventos del postest"
          description="Se completa automáticamente con cada parada, merma, velocidad u orden registrada en el MES."
        />
      )}

      <SectionTitle
        title="Pretest (registro manual)"
        description="Hoja de observación aplicada con el procedimiento manual vigente. Se digitaliza para el contraste pareado."
        className="border-b border-divider pb-3"
      />

      <NotaAnexo
        titulo={`${tri.pretest.length} eventos cargados desde la hoja física digitalizada`}
        detalle={`ΣTR pretest = ${formatNumber(sumaPretest, 1)} min · n = ${
          tri.pretest.length
        } · TRI pretest = ${formatNumber(tri.promedioPretest, 2)} min · Formato: Anexo 02 (CSV / XLSX)`}
        actions={
          <Button
            variant="secondary"
            icon={<Icon name="upload" />}
            onClick={() => setModalAbierto(true)}
          >
            Cargar hoja
          </Button>
        }
      />

      {tri.pretest.length > 0 ? (
        <div className="flex flex-col">
          <TablaTri filas={pretest.filas} />
          <PieAnexo
            texto={`Mostrando ${(pretest.page - 1) * pretest.pageSize + 1}–${
              (pretest.page - 1) * pretest.pageSize + pretest.filas.length
            } de ${pretest.total} eventos del pretest`}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pretest.page <= 1}
                  onClick={() => pretest.setPage(pretest.page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pretest.page >= pretest.totalPages}
                  onClick={() => pretest.setPage(pretest.page + 1)}
                >
                  Siguiente
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="upload" size={40} />}
          title="Sin línea base cargada"
          description="Carga la hoja de observación del pretest para poder contrastar el tiempo de registro manual con el del MES."
          action={
            <Button variant="secondary" onClick={() => setModalAbierto(true)}>
              Cargar hoja
            </Button>
          }
        />
      )}

      <CargarPretestModal open={modalAbierto} onOpenChange={setModalAbierto} />
    </div>
  );
}

function TablaTri({ filas }: { filas: readonly RegistroTRI[] }) {
  return (
    <Table density="dense">
      <THead>
        <tr>
          <TH className="w-14">N.º</TH>
          <TH className="w-30">Fecha</TH>
          <TH>Evento registrado</TH>
          <TH className="w-45">Hora inicio registro</TH>
          <TH className="w-45" numeric>
            Tiempo de registro (min)
          </TH>
        </tr>
      </THead>
      <TBody>
        {filas.map((registro) => (
          <TRow key={registro.id} plain>
            <TCell muted>{registro.n}</TCell>
            <TCell muted className="tabular">
              {formatDate(registro.fecha)}
            </TCell>
            <TCell>{registro.eventoRegistrado}</TCell>
            <TCell muted className="tabular">
              {registro.horaInicioRegistro}
            </TCell>
            <TCell numeric className="font-medium">
              {formatNumber(registro.tiempoMin, 1)}
            </TCell>
          </TRow>
        ))}
      </TBody>
    </Table>
  );
}
