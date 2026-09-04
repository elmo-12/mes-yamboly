'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Input, Overline, Select, Switch, toast } from '@mes/ui';
import { productoSchema } from '@mes/types';
import type { Producto, ProductoInput } from '@mes/types';
import { useActualizarProducto, useCrearProducto, useSabores } from '@/features/catalogs/hooks';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

const SIN_SABOR = '__sin_sabor__';
const ANCHO_DRAWER = 560;

const DEFAULT_VALUES: ProductoInput = {
  codigo: '',
  descripcionLarga: '',
  descripcionCorta: '',
  nombre: '',
  alias: null,
  marca: null,
  presentacion: null,
  unidadesPorCaja: 1,
  pesoKg: 0,
  saborId: null,
  sabor: '',
  estado: 'activo',
};

function valoresDesde(producto: Producto): ProductoInput {
  return {
    codigo: producto.codigo,
    descripcionLarga: producto.descripcionLarga,
    descripcionCorta: producto.descripcionCorta,
    nombre: producto.nombre,
    alias: producto.alias ?? null,
    marca: producto.marca ?? null,
    presentacion: producto.presentacion ?? null,
    unidadesPorCaja: producto.unidadesPorCaja,
    pesoKg: producto.pesoKg,
    saborId: producto.saborId ?? null,
    sabor: producto.sabor,
    estado: producto.estado,
  };
}

/** `2.54` → `"2,54"`; vacío si aún no hay valor. */
function textoPeso(valor: number): string {
  return valor ? String(valor).replace('.', ',') : '';
}

/** Vacía a `null`, para no mandar cadenas vacías donde el maestro usa `null`. */
function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

export interface ProductoDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Producto a editar; si se omite, el drawer abre en modo alta. */
  producto?: Producto;
}

/**
 * `Configuración / Productos y velocidades` — drawer de alta y edición del
 * maestro de productos (Figma 2165:11984, mismo patrón que `LineaDrawer`).
 * El código (7 dígitos del maestro original) no se edita una vez creado; la
 * descripción corta hace de `nombre` visible en tablas y selects, así que no
 * se pide por separado, se sincroniza en cada cambio.
 */
export function ProductoDrawer({ open, onOpenChange, producto }: ProductoDrawerProps) {
  const { data: sabores } = useSabores();
  const crear = useCrearProducto();
  const actualizar = useActualizarProducto();
  const enEdicion = Boolean(producto);
  const [pesoTexto, setPesoTexto] = React.useState('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductoInput>({
    resolver: zodResolver(productoSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    if (open) {
      const valores = producto ? valoresDesde(producto) : DEFAULT_VALUES;
      reset(valores);
      setPesoTexto(textoPeso(valores.pesoKg));
    } else {
      reset(DEFAULT_VALUES);
      setPesoTexto('');
    }
  }, [open, producto, reset]);

  /* La descripción corta hace de `nombre`: se mantiene sincronizada, sin
     pedirla como campo aparte del formulario. */
  const descripcionCorta = watch('descripcionCorta');
  React.useEffect(() => {
    setValue('nombre', descripcionCorta, { shouldValidate: false });
  }, [descripcionCorta, setValue]);

  const escribirPeso = (texto: string) => {
    const limpio = texto.replace(/[^0-9,]/g, '').replace(/(,.*),/g, '$1');
    setPesoTexto(limpio);
    setValue('pesoKg', Number(limpio.replace(',', '.')) || 0, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (valores) => {
    try {
      if (producto) {
        const actualizado = await actualizar.mutateAsync({ id: producto.id, input: valores });
        toast.success(`Producto ${actualizado.codigo} actualizado`);
      } else {
        const creado = await crear.mutateAsync(valores);
        toast.success(`Producto ${creado.codigo} creado`, {
          description: 'Asígnale una velocidad estándar por línea para poder usarlo en una orden.',
        });
      }
      onOpenChange(false);
    } catch (error) {
      const campos = aplicarErroresApi<ProductoInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'El producto no se guardó.' });
        return;
      }
      toast.error(enEdicion ? 'No se pudo actualizar el producto' : 'No se pudo crear el producto', {
        description: mensajeDeError(error, 'Revisa los datos del formulario.'),
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={enEdicion ? 'Editar producto' : 'Nuevo producto'}
        style={{ width: ANCHO_DRAWER }}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-producto" loading={isSubmitting}>
              {enEdicion ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Overline>Datos del maestro</Overline>

          <form id="form-producto" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Código de producto"
              placeholder="1110001"
              maxLength={7}
              disabled={enEdicion}
              autoFocus={!enEdicion}
              {...register('codigo')}
              destructive={Boolean(errors.codigo)}
              hint={errors.codigo?.message ?? 'Código de 7 dígitos del maestro original; no se edita.'}
            />
            <Input
              label="Descripción larga"
              placeholder="CUBETA YAMBOLY HELADO CREMA CAPUCCINO 1 X 5 L"
              {...register('descripcionLarga')}
              destructive={Boolean(errors.descripcionLarga)}
              hint={errors.descripcionLarga?.message}
            />
            <Input
              label="Descripción corta"
              placeholder="CUB-YAM-CAPUCCINO 1X5L"
              {...register('descripcionCorta')}
              destructive={Boolean(errors.descripcionCorta)}
              hint={errors.descripcionCorta?.message ?? 'Es el nombre que se muestra en tablas y selects.'}
            />
            <Input
              label="Alias interno"
              placeholder="Opcional"
              {...register('alias', { setValueAs: textoOpcional })}
              destructive={Boolean(errors.alias)}
              hint={errors.alias?.message ?? 'Opcional; solo si la planta usa un nombre corto propio.'}
            />
            <Input
              label="Marca"
              placeholder="YAMBOLY"
              {...register('marca', { setValueAs: textoOpcional })}
              destructive={Boolean(errors.marca)}
              hint={errors.marca?.message}
            />
            <Input
              label="Presentación"
              placeholder="2.54 kg(5L)"
              {...register('presentacion', { setValueAs: textoOpcional })}
              destructive={Boolean(errors.presentacion)}
              hint={errors.presentacion?.message}
            />
            <Input
              label="Unidades por caja"
              type="number"
              inputMode="numeric"
              min={1}
              {...register('unidadesPorCaja', { valueAsNumber: true })}
              destructive={Boolean(errors.unidadesPorCaja)}
              hint={errors.unidadesPorCaja?.message}
            />
            <Input
              label="Peso neto"
              inputMode="decimal"
              placeholder="2,54"
              value={pesoTexto}
              onChange={(e) => escribirPeso(e.target.value)}
              destructive={Boolean(errors.pesoKg)}
              hint={errors.pesoKg?.message ?? 'Peso neto por unidad.'}
              suffix="kg"
            />
            <Controller
              control={control}
              name="saborId"
              render={({ field }) => (
                <Select
                  label="Sabor"
                  options={[
                    { value: SIN_SABOR, label: 'Sin sabor' },
                    ...(sabores?.data ?? []).map((s) => ({
                      value: s.id,
                      label: `${s.codigo} · ${s.nombre}`,
                    })),
                  ]}
                  value={field.value ?? SIN_SABOR}
                  onValueChange={(v) => field.onChange(v === SIN_SABOR ? null : v)}
                />
              )}
            />
            <Controller
              control={control}
              name="estado"
              render={({ field }) => (
                <Switch
                  label="Producto activo"
                  supporting="Los productos inactivos no aparecen para asignar velocidad ni al iniciar una orden."
                  checked={field.value === 'activo'}
                  onCheckedChange={(checked) => field.onChange(checked ? 'activo' : 'inactivo')}
                />
              )}
            />
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
