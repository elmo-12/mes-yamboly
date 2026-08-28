import { EncuestaPublica } from '@/features/evidence/components/EncuestaPublica';

/**
 * `Evidencia / Encuesta pública / 1024` (Figma 2163:15979): cuestionario de
 * satisfacción (TSP, Anexo 04) fuera del shell y sin sesión.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EncuestaPublica token={token} />;
}
