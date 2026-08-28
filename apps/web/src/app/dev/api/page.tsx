'use client';

import { useAlertasResumen } from '@/features/alerts/hooks';
import { useAnaliticaResumen } from '@/features/analytics/hooks';
import { useEvidenciaResumen } from '@/features/evidence/hooks';
import { useOrdenes } from '@/features/orders/hooks';
import { useTiempoReal } from '@/features/realtime/hooks';

/**
 * Página de QA del contrato de datos (no forma parte del producto).
 * Comprueba de un vistazo que msw intercepta y que los hooks devuelven
 * exactamente los valores de las specs.
 */

function Bloque({
  titulo,
  cargando,
  error,
  children,
}: {
  titulo: string;
  cargando: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{titulo}</h2>
      {cargando && <p>Cargando…</p>}
      {Boolean(error) && <p style={{ color: '#DC2626' }}>Error: {String(error)}</p>}
      {!cargando && !error && children}
    </section>
  );
}

export default function DevApiPage() {
  const tiempoReal = useTiempoReal();
  const ordenes = useOrdenes({ page: 1, pageSize: 5, lineaId: 'LIN-02', periodo: 'mes' });
  const alertas = useAlertasResumen();
  const evidencia = useEvidenciaResumen();
  const analitica = useAnaliticaResumen();

  return (
    <main style={{ padding: 32, fontFamily: 'var(--font-inter), system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>QA · Contratos y mocks</h1>

      <Bloque titulo="1 · Tiempo real (GET /tiempo-real/lineas)" cargando={tiempoReal.isPending} error={tiempoReal.error}>
        <ul>
          {tiempoReal.data?.lineas.map((l) => (
            <li key={l.lineaId}>
              {l.lineaCodigo} {l.lineaNombre} — <strong>{l.estado}</strong> · {l.producido}/{l.plan} ·{' '}
              {l.velocidad} u/min{l.alerta ? ` · riesgo ${l.alerta.riesgo} %` : ''}
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque
        titulo="2 · Órdenes paginadas con filtro (GET /ordenes?lineaId=LIN-02&periodo=mes)"
        cargando={ordenes.isPending}
        error={ordenes.error}
      >
        <p>
          Total {ordenes.data?.meta.total} · página {ordenes.data?.meta.page} de{' '}
          {ordenes.data?.meta.totalPages}
        </p>
        <ul>
          {ordenes.data?.data.map((o) => (
            <li key={o.id}>
              {o.codigo} · {o.productoNombre} · {o.producido}/{o.planificado} · OEE {o.oee.oee} % ·{' '}
              {o.estado}
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="3 · Alertas resumen (GET /alertas/resumen)" cargando={alertas.isPending} error={alertas.error}>
        <p>
          Activas {alertas.data?.activas} · Atendidas hoy {alertas.data?.atendidasHoy} · Pendientes de
          confirmar {alertas.data?.pendientesConfirmar} · Vencidas {alertas.data?.vencidas} · EP{' '}
          {alertas.data?.epAcumulada} %
        </p>
      </Bloque>

      <Bloque
        titulo="4 · Evidencia resumen (GET /evidencia/resumen)"
        cargando={evidencia.isPending}
        error={evidencia.error}
      >
        <ul>
          {evidencia.data?.kpis.map((k) => (
            <li key={k.id}>
              {k.id} · {k.valor} {k.unidad} · meta {k.meta} · {k.estado} · {k.detalle}
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque
        titulo="5 · Analítica resumen (GET /analitica/resumen)"
        cargando={analitica.isPending}
        error={analitica.error}
      >
        <p>
          Modelo {analitica.data?.modelo.version} · {analitica.data?.modelo.eventos} eventos · EP{' '}
          {analitica.data?.kpis.ep} % · Precisión {analitica.data?.kpis.precision} % · Recall{' '}
          {analitica.data?.kpis.recall} % · Alertas 30 d {analitica.data?.kpis.alertas30d}
        </p>
        <ul>
          {analitica.data?.insights.map((i) => (
            <li key={i.id}>{i.texto}</li>
          ))}
        </ul>
      </Bloque>
    </main>
  );
}
