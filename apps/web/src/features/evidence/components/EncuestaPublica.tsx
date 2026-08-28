'use client';

import * as React from 'react';
import { Button, EmptyState, Icon, Input, Radio, RadioGroup, Skeleton } from '@mes/ui';
import { encuestaRespuestaSchema } from '@mes/types';
import { ApiClientError } from '@/services/api/client';
import { useEncuesta, useResponderEncuesta } from '../hooks';

/** Escala Likert del Anexo 04, con la etiqueta que ve el encuestado. */
const ESCALA = [
  { valor: '1', label: 'Muy bajo' },
  { valor: '2', label: 'Bajo' },
  { valor: '3', label: 'Normal' },
  { valor: '4', label: 'Alto' },
  { valor: '5', label: 'Muy alto' },
] as const;

/**
 * `Evidencia / Encuesta pública / 1024` — Figma 2163:15979.
 * Cuestionario de 8 ítems Likert sin sesión: consentimiento informado, escala
 * 1–5 por ítem, comentario opcional y pantalla de agradecimiento.
 */
export function EncuestaPublica({ token }: { token: string }) {
  const { data, isPending, error } = useEncuesta(token);
  const responder = useResponderEncuesta(token);

  const [respuestas, setRespuestas] = React.useState<Record<number, string>>({});
  const [comentario, setComentario] = React.useState('');
  const [errores, setErrores] = React.useState<number[]>([]);
  const [enviado, setEnviado] = React.useState(false);

  const estadoHttp = error instanceof ApiClientError ? error.statusCode : undefined;

  if (isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (estadoHttp === 404 || (error && estadoHttp !== 409)) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="forbidden" size={40} />}
        title="Enlace no válido"
        description="El enlace de la encuesta no existe o ya caducó. Pide uno nuevo al jefe de producción."
      />
    );
  }

  if (estadoHttp === 409 || data?.respondida || enviado) {
    return (
      <EmptyState
        icon={<Icon name="check-circle" size={40} />}
        title={enviado ? '¡Gracias por responder!' : 'Esta encuesta ya fue respondida'}
        description={
          enviado
            ? 'Tus respuestas quedaron registradas de forma anónima y alimentan el indicador de satisfacción del personal (TSP).'
            : 'El enlace es de un solo uso y ya se registró una respuesta con él.'
        }
      />
    );
  }

  if (!data) return null;

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    const faltantes = data.items.filter((item) => !respuestas[item.n]).map((item) => item.n);
    if (faltantes.length > 0) {
      setErrores(faltantes);
      document
        .getElementById(`item-${faltantes[0]}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrores([]);

    const payload = encuestaRespuestaSchema.safeParse({
      token,
      respuestas: data.items.map((item) => Number(respuestas[item.n])),
      comentario: comentario.trim() || undefined,
    });
    if (!payload.success) {
      setErrores(data.items.map((i) => i.n));
      return;
    }

    try {
      await responder.mutateAsync(payload.data);
      setEnviado(true);
    } catch (e) {
      if (e instanceof ApiClientError && e.statusCode === 409) {
        setEnviado(true);
        return;
      }
      setErrores([]);
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 text-text-primary">{data.titulo}</h1>
        <p className="text-body-lg text-text-secondary">{data.descripcion}</p>
      </header>

      <section className="flex flex-col gap-1.5 rounded-md bg-background-subtle px-4 py-3.5">
        <h2 className="text-body-md font-semibold text-text-primary">Consentimiento informado</h2>
        <p className="text-body-sm text-text-secondary">
          Al enviar este formulario aceptas participar voluntariamente en el estudio. Las respuestas
          son anónimas, no se registran datos que permitan identificarte y se usarán únicamente con
          fines académicos.
        </p>
      </section>

      <p className="text-body-sm text-primary">
        <span className="font-medium">Escala de valoración:</span>{' '}
        {ESCALA.map((e) => `${e.valor} ${e.label}`).join(' · ')}
      </p>

      <ol className="flex flex-col">
        {data.items.map((item) => {
          const invalido = errores.includes(item.n);
          return (
            <li
              key={item.n}
              id={`item-${item.n}`}
              className="flex flex-col gap-3 border-t border-divider py-4"
            >
              <fieldset className="flex flex-col gap-3">
                <legend className="text-body-md text-text-primary">
                  {item.n}. {item.texto}
                </legend>
                <RadioGroup
                  className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6"
                  value={respuestas[item.n] ?? ''}
                  onValueChange={(valor) => {
                    setRespuestas((prev) => ({ ...prev, [item.n]: valor }));
                    setErrores((prev) => prev.filter((n) => n !== item.n));
                  }}
                  aria-label={`Ítem ${item.n}`}
                  aria-invalid={invalido || undefined}
                >
                  {ESCALA.map((opcion) => (
                    <Radio
                      key={opcion.valor}
                      value={opcion.valor}
                      id={`item-${item.n}-${opcion.valor}`}
                      label={`${opcion.valor} ${opcion.label}`}
                    />
                  ))}
                </RadioGroup>
                {invalido && (
                  <p className="text-body-sm text-error-text">Responde este ítem para continuar.</p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>

      <Input
        label="Comentario adicional (opcional)"
        value={comentario}
        maxLength={500}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Escriba cualquier observación sobre el registro de producción, paradas o mermas"
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" type="submit" size="lg" loading={responder.isPending}>
          Enviar respuestas
        </Button>
        <span className="text-body-sm text-text-secondary">
          Las respuestas se registran de forma anónima (RF16 · EV8).
        </span>
      </div>
    </form>
  );
}
