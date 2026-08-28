'use client';

import * as React from 'react';
import {
  Button,
  Icon,
  ProgressBar,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import type { EncuestaTSP } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { KpiAnexoCard, KpiRow, NotaAnexo, PieAnexo } from './evidencia-format';

/**
 * `Evidencia / TSP (Anexo 04)` — Figma 2163:14157.
 * KPI PO/PT, resultados por ítem con barra de promedio (1–5) y % de acuerdo, y
 * bloque de la encuesta pública con el enlace de un solo uso.
 */
export function TspTab({ tsp }: { tsp: EncuestaTSP }) {
  const [copiado, setCopiado] = React.useState(false);
  const puntajeObtenido = Math.round(tsp.promedio * tsp.respuestas * tsp.items.length);
  const puntajeTotal = tsp.respuestas * tsp.items.length * 5;

  const enlaceAbsoluto = React.useMemo(() => {
    if (tsp.enlace.startsWith('http')) return tsp.enlace;
    if (typeof window === 'undefined') return tsp.enlace;
    return `${window.location.origin}${tsp.enlace.startsWith('/') ? '' : '/'}${tsp.enlace}`;
  }, [tsp.enlace]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlaceAbsoluto);
      setCopiado(true);
      toast.success('Enlace copiado', { description: enlaceAbsoluto });
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('No se pudo copiar el enlace', { description: enlaceAbsoluto });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="TSP postest"
          value={`${formatNumber(tsp.pctAcuerdo, 1)} %`}
          meta={tsp.meta}
          estado={tsp.estado}
          context={`${tsp.respuestas} respuestas · promedio ${formatNumber(tsp.promedio, 2)} / 5`}
        />
        <KpiAnexoCard
          label="Puntaje obtenido (PO)"
          value={puntajeObtenido}
          meta={`Meta ≥ ${Math.round(puntajeTotal * 0.8)} de ${puntajeTotal}`}
          estado={tsp.estado}
          context="suma de las respuestas Likert"
        />
        <KpiAnexoCard
          label="Respuestas recibidas"
          value={`${tsp.respuestas} / ${tsp.invitados}`}
          meta={`Meta = ${tsp.invitados} usuarios`}
          estado={tsp.respuestas >= tsp.invitados ? 'cumple' : 'en_riesgo'}
          context={
            tsp.respuestas >= tsp.invitados ? 'cobertura total' : 'faltan respuestas por recibir'
          }
        />
        <KpiAnexoCard
          label="Promedio general"
          value={`${formatNumber(tsp.promedio, 2)} / 5`}
          meta="Escala Likert 1–5"
          estado="referencia"
          context={`${tsp.items.length} ítems del cuestionario`}
        />
      </KpiRow>

      <SectionTitle
        title="Resultados por ítem — Cuestionario de satisfacción (Anexo 04)"
        description="Escala Likert: 1 Muy bajo · 2 Bajo · 3 Normal · 4 Alto · 5 Muy alto. Aplicado a operarios, maquinistas, supervisores y jefes de producción."
        className="border-b border-divider pb-3"
      />

      <div className="flex flex-col">
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-14">N.º</TH>
              <TH>Ítem del cuestionario</TH>
              <TH className="w-60">Promedio postest (1–5)</TH>
              <TH className="w-40" numeric>
                % de acuerdo (4–5)
              </TH>
            </tr>
          </THead>
          <TBody>
            {tsp.items.map((item) => (
              <TRow key={item.n} plain>
                <TCell muted>{item.n}</TCell>
                <TCell className="whitespace-normal">{item.texto}</TCell>
                <TCell>
                  <span className="flex items-center gap-3">
                    <ProgressBar
                      value={(item.promedio / 5) * 100}
                      tone="primary"
                      className="flex-1"
                      label={`Promedio ${formatNumber(item.promedio, 1)} de 5`}
                    />
                    <span className="w-9 shrink-0 text-right font-medium tabular">
                      {formatNumber(item.promedio, 1)}
                    </span>
                  </span>
                </TCell>
                <TCell numeric className="font-medium">
                  {formatNumber(item.pctAcuerdo, 0)} %
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>

        <PieAnexo
          texto={`Promedio general ${formatNumber(tsp.promedio, 2)} / 5 · PO = ${puntajeObtenido} · PT = ${puntajeTotal} (${
            tsp.respuestas
          } usuarios × ${tsp.items.length * 5}) · TSP = (${puntajeObtenido} / ${puntajeTotal}) × 100 = ${formatNumber(
            tsp.pctAcuerdo,
            1,
          )} %`}
        />
      </div>

      <NotaAnexo
        titulo="Encuesta pública de satisfacción (RF16)"
        detalle={
          <>
            {enlaceAbsoluto} · Respuestas anónimas · {tsp.respuestas} de {tsp.invitados} respuestas
            recibidas
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Icon name={copiado ? 'check' : 'clipboard'} />}
              onClick={copiar}
            >
              {copiado ? 'Enlace copiado' : 'Copiar enlace de encuesta'}
            </Button>
            <AppLink
              href={tsp.enlace.startsWith('http') ? tsp.enlace : tsp.enlace}
              target="_blank"
              className="text-btn-sm"
            >
              Ver formulario
            </AppLink>
          </>
        }
      />
    </div>
  );
}
