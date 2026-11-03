import { PaginaExpediente } from '@/components/crm/unificado/pagina-expediente';

export default async function ExpedienteFranquiciatario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return <PaginaExpediente tipo="franquiciatario" id={id} tab={tab} />;
}
