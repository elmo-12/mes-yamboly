'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  SectionTitle,
  Skeleton,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  Input,
  toast,
} from '@mes/ui';
import { formatNumber } from '@mes/shared';
import { useActualizarProducto, useLineas, useProductos } from '@/features/catalogs/hooks';

/**
 * Pestaña "Productos y velocidades": la velocidad estándar es la referencia del
 * factor Desempeño del OEE, por eso se edita en línea (Input sm + Guardar).
 */
export function ProductosVelocidadesTab() {
  const { data, isPending, error, refetch } = useProductos();
  const { data: lineas } = useLineas();
  const actualizar = useActualizarProducto();
  const [borrador, setBorrador] = React.useState<Record<string, string>>({});

  const nombreLinea = (id: string) => {
    const l = (lineas?.data ?? []).find((x) => x.id === id);
    return l ? `${l.codigo} · ${l.nombre}` : id;
  };

  const guardar = async (id: string, codigo: string) => {
    const valor = Number(borrador[id]);
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error('Velocidad inválida', { description: 'Introduce un número mayor que 0.' });
      return;
    }
    try {
      await actualizar.mutateAsync({ id, velocidadEstandar: valor });
      setBorrador((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([clave]) => clave !== id)),
      );
      toast.success(`Velocidad de ${codigo} actualizada`, {
        description: `Nuevo estándar ${formatNumber(valor)} u/min para el cálculo de desempeño.`,
      });
    } catch (err) {
      toast.error('No se pudo guardar la velocidad', {
        description: err instanceof Error ? err.message : 'Inténtalo de nuevo.',
      });
    }
  };

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el catálogo de productos"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Productos y velocidades estándar"
        description="La velocidad estándar (u/min) es la referencia del factor Desempeño del OEE."
      />

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-[140px]">Código</TH>
              <TH className="min-w-[220px]">Producto</TH>
              <TH className="w-[130px]">Sabor</TH>
              <TH className="w-[170px]">Línea</TH>
              <TH className="w-[110px]">Estado</TH>
              <TH className="w-[190px]">Velocidad estándar</TH>
              <TH className="w-[110px]">
                <span className="sr-only">Guardar</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {(data?.data ?? []).map((p) => {
              const editado = borrador[p.id] !== undefined;
              return (
                <TRow key={p.id}>
                  <TCell className="font-medium tabular">{p.codigo}</TCell>
                  <TCell>{p.nombre}</TCell>
                  <TCell className="text-neutral-text">{p.sabor}</TCell>
                  <TCell className="text-neutral-text">{nombreLinea(p.lineaId)}</TCell>
                  <TCell>
                    <Badge color={p.estado === 'activo' ? 'success' : 'neutral'}>
                      {p.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TCell>
                  <TCell>
                    <Input
                      size="sm"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      suffix="u/min"
                      aria-label={`Velocidad estándar de ${p.nombre}`}
                      className="max-w-[150px]"
                      wrapperClassName="max-w-[150px]"
                      value={borrador[p.id] ?? String(p.velocidadEstandar)}
                      onChange={(e) =>
                        setBorrador((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  </TCell>
                  <TCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!editado || actualizar.isPending}
                      onClick={() => void guardar(p.id, p.codigo)}
                    >
                      Guardar
                    </Button>
                  </TCell>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
