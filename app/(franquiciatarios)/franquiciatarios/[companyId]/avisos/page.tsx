import Link from 'next/link';
import { Download } from 'lucide-react';
import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { diaOperacion, esFecha, sumarDias } from '@/lib/franquiciatarios/dia';
import type { FranqAviso } from '@/lib/franquiciatarios/tipos';
import { Encabezado } from '@/components/portal/piezas';
import { Avisos } from '@/components/franquiciatarios/avisos';
import { diaCorto } from '@/components/franquiciatarios/formato';

export default async function PaginaAvisos({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const c = await contextoGestor(params);
  const q = await searchParams;
  const hoy = diaOperacion();
  let hasta = esFecha(q.hasta) && q.hasta <= hoy ? q.hasta : hoy;
  let desde = esFecha(q.desde) ? q.desde : sumarDias(hasta, -6);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde < sumarDias(hasta, -62)) desde = sumarDias(hasta, -62);
  const base = `/franquiciatarios/${c.companyId}`;
  const r = await c.db.rpc('franq_avisos', { p_company: c.companyId, p_desde: desde, p_hasta: hasta });
  const avisos = (r.data ?? []) as FranqAviso[];
  const dias: string[] = [];
  for (let d = hasta; d >= desde && dias.length < 63; d = sumarDias(d, -1)) dias.push(d);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Avisos e historial"
        descripcion="Los «No» vigentes con su observación y las incidencias del periodo. Una corrección queda junto al registro original."
      >
        <a
          href={`/api/franquiciatarios/${c.companyId}/avisos?desde=${desde}&hasta=${hasta}`}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-card hover:border-ink/40"
        >
          <Download size={16} aria-hidden="true" /> Descargar CSV
        </a>
      </Encabezado>
      <form className="flex flex-wrap items-end gap-2" action={`${base}/avisos`}>
        <label className="text-sm font-medium text-ink">
          Desde
          <input type="date" name="desde" defaultValue={desde} max={hoy} className="mt-1 block h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm" />
        </label>
        <label className="text-sm font-medium text-ink">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} max={hoy} className="mt-1 block h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm" />
        </label>
        <button className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-ink/40">
          Ver periodo
        </button>
      </form>
      {r.error ? (
        <p className="error">No se pudieron leer los avisos. Intenta de nuevo.</p>
      ) : (
        <Avisos companyId={c.companyId} avisos={avisos} />
      )}
      <section aria-labelledby="historial" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h2 id="historial" className="text-lg">
          Checklists por día
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Abre el checklist completo de cualquier día del periodo.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {dias.map((d) => (
            <li key={d}>
              <Link
                href={`${base}/checklist?dia=${d}`}
                className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-ink hover:border-line-strong"
              >
                {diaCorto(d)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
