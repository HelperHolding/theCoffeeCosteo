import { Download } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { bitacora, POR_PAGINA_BITACORA, type FiltrosBitacora } from '@/lib/crm/unificado/consultas';
import { Encabezado } from '@/components/portal/piezas';
import { VistaBitacora } from '@/components/crm/unificado/vistas/bitacora';

/** Trazabilidad global e inalterable: quién, qué, cuándo, desde dónde y por qué. */
export default async function Bitacora({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const filtros: FiltrosBitacora = {
    actor: p.actor || undefined,
    accion: p.accion || undefined,
    area: p.area || undefined,
    desde: p.desde || undefined,
    hasta: p.hasta || undefined,
    buscar: p.q || undefined,
    pagina: Number(p.pagina) || 1,
    conMuestra: p.muestra === '1',
  };
  const { db } = await sesionCrm();
  const [{ filas, total, pagina }, personas] = await Promise.all([
    bitacora(db, filtros),
    db.from('perfil_modulos').select('user_id').eq('modulo', 'crm'),
  ]);
  const ids = ((personas.data ?? []) as { user_id: string }[]).map((x) => x.user_id);
  const perfiles = ids.length
    ? (((await db.from('perfiles').select('user_id,nombre').in('user_id', ids)).data ?? []) as {
        user_id: string;
        nombre: string;
      }[])
    : [];
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_BITACORA));
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams(
      Object.fromEntries(Object.entries({ ...p, ...extra }).filter((x): x is [string, string] => !!x[1])),
    ).toString();
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Bitácora"
        descripcion="Cada movimiento con nombre, área, fecha y hora (Ciudad de México). Nadie la puede editar ni borrar."
      >
        <a
          href={`/crm/bitacora/exportar?${qs({})}`}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
        >
          <Download size={16} aria-hidden="true" /> Exportar CSV
        </a>
      </Encabezado>
      <VistaBitacora
        filas={filas}
        total={total}
        pagina={pagina}
        paginas={paginas}
        p={p}
        personas={perfiles}
      />
    </>
  );
}
