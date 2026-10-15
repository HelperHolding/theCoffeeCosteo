import { Ficha } from '@/components/recetas/ficha';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return <Ficha tipo="producto" id={(await params).id} tab={(await searchParams).tab} />;
}
