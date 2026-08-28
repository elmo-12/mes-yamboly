import { EmptyState, Icon } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';

export default function Page() {
  return (
    <>
      <AppPageHeader title="Pasteurización" subtitle="Control de baldes enviados a pasteurización" />
      <EmptyState
        icon={<Icon name="ice-cream" size={40} />}
        title="Módulo conservado"
        description="El módulo de pasteurización se mantiene tal cual está en el sistema actual de Yamboly: no forma parte del rediseño de la tesis y se sigue operando desde la aplicación existente. Las mermas marcadas como «Enviar a pasteurización» en la captura rápida se registran igualmente y quedan disponibles allí."
      />
    </>
  );
}
