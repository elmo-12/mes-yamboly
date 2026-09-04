'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  EmptyState,
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
import type { EvidenciaTSP, InvitacionTSP } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { NuevaInvitacionModal } from './NuevaInvitacionModal';
import { KpiAnexoCard, KpiRow, PieAnexo } from './evidencia-format';

/**
 * `Evidencia / TSP (Anexo 04)` — Figma 2163:14157.
 * Invitaciones nominales con enlace de un solo uso, KPI PO/PT y resultados por
 * ítem. Los agregados aparecen solo cuando hay al menos una respuesta.
 */
export function TspTab({ tsp }: { tsp: EvidenciaTSP }) {
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const hayRespuestas = tsp.respuestas > 0;

  const puntajeObtenido = hayRespuestas
    ? Math.round((tsp.promedio ?? 0) * tsp.respuestas * tsp.items.length)
    : 0;
  const puntajeTotal = tsp.respuestas * tsp.items.length * 5;

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        <KpiAnexoCard
          label="TSP postest"
          value={tsp.pctAcuerdo === null ? null : `${formatNumber(tsp.pctAcuerdo, 1)} %`}
          meta={tsp.meta}
          estado={tsp.estado}
          context={
            hayRespuestas
              ? `${tsp.respuestas} respuestas · promedio ${formatNumber(tsp.promedio ?? 0, 2)} / 5`
              : 'Se calcula con las respuestas recibidas'
          }
        />
        <KpiAnexoCard
          label="Puntaje obtenido (PO)"
          value={hayRespuestas ? puntajeObtenido : null}
          meta={
            hayRespuestas
              ? `Meta ≥ ${Math.round(puntajeTotal * 0.8)} de ${puntajeTotal}`
              : 'Meta ≥ 80 % del puntaje total'
          }
          estado={hayRespuestas ? tsp.estado : 'sin_datos'}
          context="suma de las respuestas Likert"
        />
        <KpiAnexoCard
          label="Respuestas recibidas"
          value={`${tsp.respuestas} / ${tsp.invitados}`}
          meta={tsp.invitados > 0 ? `Meta = ${tsp.invitados} invitados` : 'Sin invitaciones creadas'}
          estado={
            tsp.invitados === 0
              ? 'sin_datos'
              : tsp.respuestas >= tsp.invitados
                ? 'cumple'
                : 'en_riesgo'
          }
          context={
            tsp.invitados === 0
              ? 'crea una invitación para empezar'
              : tsp.respuestas >= tsp.invitados
                ? 'cobertura total'
                : 'faltan respuestas por recibir'
          }
        />
        <KpiAnexoCard
          label="Promedio general"
          value={tsp.promedio === null ? null : `${formatNumber(tsp.promedio, 2)} / 5`}
          meta="Escala Likert 1–5"
          estado={hayRespuestas ? 'referencia' : 'sin_datos'}
          context={`${tsp.items.length} ítems del cuestionario`}
        />
      </KpiRow>

      <SectionTitle
        title="Invitaciones a la encuesta"
        description="Cada invitación genera un enlace público de un solo uso. Las respuestas son anónimas: solo se guarda si el token ya fue usado."
        className="border-b border-divider pb-3"
        actions={
          <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setModalAbierto(true)}>
            Nueva invitación
          </Button>
        }
      />

      {tsp.invitaciones.length === 0 ? (
        <EmptyState
          icon={<Icon name="user-group" size={40} />}
          title="Todavía no hay invitaciones"
          description="Crea una invitación por cada operario, maquinista, supervisor o jefe que deba responder el cuestionario del Anexo 04."
          action={
            <Button variant="secondary" onClick={() => setModalAbierto(true)}>
              Nueva invitación
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table density="dense">
            <THead>
              <tr>
                <TH>Invitado</TH>
                <TH className="w-40">Rol</TH>
                <TH className="w-30">Estado</TH>
                <TH className="w-35">Respondida</TH>
                <TH className="w-45">Enlace</TH>
              </tr>
            </THead>
            <TBody>
              {tsp.invitaciones.map((invitacion) => (
                <FilaInvitacion key={invitacion.token} invitacion={invitacion} />
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <SectionTitle
        title="Resultados por ítem — Cuestionario de satisfacción (Anexo 04)"
        description="Escala Likert: 1 Muy bajo · 2 Bajo · 3 Normal · 4 Alto · 5 Muy alto. Aplicado a operarios, maquinistas, supervisores y jefes de producción."
        className="border-b border-divider pb-3"
      />

      {!hayRespuestas ? (
        <EmptyState
          icon={<Icon name="clipboard" size={40} />}
          title="Sin respuestas recibidas"
          description="Los promedios por ítem y el % de acuerdo se calculan cuando la primera persona responde la encuesta desde su enlace."
        />
      ) : (
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
                        value={((item.promedio ?? 0) / 5) * 100}
                        tone="primary"
                        className="flex-1"
                        label={`Promedio ${formatNumber(item.promedio ?? 0, 1)} de 5`}
                      />
                      <span className="w-9 shrink-0 text-right font-medium tabular">
                        {formatNumber(item.promedio ?? 0, 1)}
                      </span>
                    </span>
                  </TCell>
                  <TCell numeric className="font-medium">
                    {formatNumber(item.pctAcuerdo ?? 0, 0)} %
                  </TCell>
                </TRow>
              ))}
            </TBody>
          </Table>

          <PieAnexo
            texto={`Promedio general ${formatNumber(tsp.promedio ?? 0, 2)} / 5 · PO = ${puntajeObtenido} · PT = ${puntajeTotal} (${
              tsp.respuestas
            } usuarios × ${tsp.items.length * 5}) · TSP = (${puntajeObtenido} / ${puntajeTotal}) × 100 = ${formatNumber(
              tsp.pctAcuerdo ?? 0,
              1,
            )} %`}
          />
        </div>
      )}

      <NuevaInvitacionModal open={modalAbierto} onOpenChange={setModalAbierto} />
    </div>
  );
}

/** Fila de invitación: estado y enlace copiable al portapapeles. */
function FilaInvitacion({ invitacion }: { invitacion: InvitacionTSP }) {
  const [copiado, setCopiado] = React.useState(false);

  const enlace = React.useMemo(() => {
    if (invitacion.url.startsWith('http')) return invitacion.url;
    if (typeof window === 'undefined') return invitacion.url;
    return `${window.location.origin}${invitacion.url.startsWith('/') ? '' : '/'}${invitacion.url}`;
  }, [invitacion.url]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      toast.success('Enlace copiado', { description: enlace });
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('No se pudo copiar el enlace', { description: enlace });
    }
  };

  return (
    <TRow plain>
      <TCell className="font-medium">{invitacion.invitado}</TCell>
      <TCell muted>{invitacion.rol || '—'}</TCell>
      <TCell>
        <Badge color={invitacion.respondida ? 'success' : 'warning'}>
          {invitacion.respondida ? 'Respondida' : 'Pendiente'}
        </Badge>
      </TCell>
      <TCell muted className="tabular">
        {invitacion.respondidaEn ? formatDate(invitacion.respondidaEn) : '—'}
      </TCell>
      <TCell>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name={copiado ? 'check' : 'clipboard'} />}
          onClick={() => void copiar()}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </TCell>
    </TRow>
  );
}
