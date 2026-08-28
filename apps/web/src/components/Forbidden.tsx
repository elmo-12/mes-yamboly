import { EmptyState, Icon } from '@mes/ui';

export interface ForbiddenProps {
  /** Qué se intentó abrir, para dar contexto al usuario. */
  recurso?: string;
}

/** Estado `forbidden` de una vista (BRIEF §Estados obligatorios). */
export function Forbidden({ recurso }: ForbiddenProps) {
  return (
    <EmptyState
      variant="error"
      icon={<Icon name="forbidden" size={40} />}
      title="Sin permiso"
      description={
        recurso
          ? `Tu rol no tiene acceso a ${recurso}. Solicítalo al jefe de producción.`
          : 'Tu rol no tiene acceso a esta sección. Solicítalo al jefe de producción.'
      }
    />
  );
}
