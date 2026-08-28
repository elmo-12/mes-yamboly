import { EmptyState, Icon } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';

export default function Page() {
  return (
    <>
      <AppPageHeader title="Personal" subtitle="Colaboradores, turnos y asistencia" />
      <EmptyState
        icon={<Icon name="user-group" size={40} />}
        title="Módulo conservado"
        description="El módulo de personal se mantiene tal cual está en el sistema actual de Yamboly: no forma parte del rediseño de la tesis y se sigue operando desde la aplicación existente. Los maquinistas y supervisores que aparecen en las órdenes se leen de ese maestro."
      />
    </>
  );
}
