'use client';

import Link from 'next/link';
import { Button, toast } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import type { TiempoRealResumen } from '@mes/types';
import { formatDateLong, saludoPorHora } from '@mes/shared';

export interface HomeHeaderProps {
  /** Nombre completo del usuario; el header saluda con el nombre de pila. */
  nombre: string;
  /** Migaja final: `Jefe de producción` / `Maquinista`. */
  rolLabel: string;
  /** Subtítulo ya compuesto; por defecto turno · fecha · líneas activas. */
  subtitulo?: string;
  resumen?: TiempoRealResumen;
  /** Sustituye la botonera (el panel del maquinista usa otras acciones). */
  actions?: React.ReactNode;
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(' ')[0] ?? nombre;
}

/** `Turno Mañana · Viernes 28 ago 2026 · 5 líneas activas` */
function subtituloJefe(resumen: TiempoRealResumen | undefined): string | undefined {
  if (!resumen) return undefined;
  const activas = resumen.lineas.filter((l) => l.estado !== 'sin_orden').length;
  return [
    `Turno ${resumen.turnoLabel}`,
    formatDateLong(resumen.actualizadoEn),
    `${activas} ${activas === 1 ? 'línea activa' : 'líneas activas'}`,
  ].join(' · ');
}

/**
 * `MES / Page header` del Home (Figma 2163:17513 y 2165:847): breadcrumb
 * Inicio / Panel / rol, saludo por hora, subtítulo de contexto y acciones
 * Secondary + un único Primary.
 */
export function HomeHeader({ nombre, rolLabel, subtitulo, resumen, actions }: HomeHeaderProps) {
  const accionesJefe = (
    <>
      <Button
        variant="secondary"
        onClick={() =>
          toast.success('Exportación en preparación', {
            description:
              'El resumen del turno se está generando; lo encontrarás en Reportes › Exportar.',
          })
        }
      >
        Exportar del día
      </Button>
      <Button variant="primary" asChild>
        <Link href="/tiempo-real">Ver tiempo real</Link>
      </Button>
    </>
  );

  return (
    <AppPageHeader
      breadcrumb={[{ label: 'Inicio', href: '/' }, { label: 'Panel' }, { label: rolLabel }]}
      linkComponent={Link}
      title={`${saludoPorHora(new Date().getHours())}, ${primerNombre(nombre)}`}
      subtitle={subtitulo ?? subtituloJefe(resumen)}
      actions={actions ?? accionesJefe}
    />
  );
}
