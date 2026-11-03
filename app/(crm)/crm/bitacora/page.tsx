import Link from 'next/link';
import { Download } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { bitacora, POR_PAGINA_BITACORA, type FiltrosBitacora } from '@/lib/crm/unificado/consultas';
import { AREAS, cuando } from '@/lib/crm/unificado/modelo';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import type { ClaveArea } from '@/lib/crm/tipos';

const ACCIONES: Record<string, string> = {
  etapa: 'Cambio de etapa',
  requisito_cumplido: 'Requisito registrado',
  requisito_validado: 'Requisito validado',
  requisito_revertido: 'Requisito corregido',
  requisito_no_aplica: 'Requisito no aplica',
  candado_liberado: 'Candado liberado',
  sucursal_creada: 'Sucursal creada',
  creado: 'Alta',
  editado: 'Edición de datos',
  responsable: 'Cambio de responsable',
  nota: 'Nota',
  archivo: 'Archivo',
  archivo_version: 'Nueva versión de archivo',
  archivo_retirado: 'Archivo retirado',
  archivo_descargado: 'Descarga',
  checklist: 'Checklist',
  acceso: 'Acceso',
  aviso: 'Aviso automático',
  eliminado: 'Eliminación',
  configuracion: 'Configuración',
};

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
      <form className="placa grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          Buscar en el resumen
          <input name="q" type="search" defaultValue={p.q} placeholder="Card, requisito, etapa…" />
        </label>
        <label>
          Persona
          <select name="actor" defaultValue={p.actor ?? ''}>
            <option value="">Todas</option>
            {perfiles.map((x) => (
              <option key={x.user_id} value={x.user_id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select name="area" defaultValue={p.area ?? ''}>
            <option value="">Todas</option>
            {(['ventas', 'legal', 'proyectos'] as ClaveArea[]).map((a) => (
              <option key={a} value={a}>
                {AREAS[a].nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Acción
          <select name="accion" defaultValue={p.accion ?? ''}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            Desde
            <input name="desde" type="date" defaultValue={p.desde} />
          </label>
          <label>
            Hasta
            <input name="hasta" type="date" defaultValue={p.hasta} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium lg:col-span-3">
          <input type="checkbox" name="muestra" value="1" defaultChecked={p.muestra === '1'} />
          Incluir la importación de Zoho (datos de muestra)
        </label>
        <div className="flex items-end gap-2 lg:col-span-3 lg:justify-end">
          <Link
            href="/crm/bitacora"
            className="h-10 px-3 py-2 text-sm font-semibold text-ink-2 hover:underline"
          >
            Limpiar
          </Link>
          <button className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </div>
      </form>
      {filas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Sin movimientos con estos filtros">Amplía las fechas o quita algún filtro.</Vacio>
        </Tarjeta>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Cuándo</th>
                <th className="px-4 py-2.5 font-semibold">Quién</th>
                <th className="px-4 py-2.5 font-semibold">Qué</th>
                <th className="px-4 py-2.5 font-semibold">Card</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filas.map((h) => {
                const area = h.actor_area?.split(',')[0] as ClaveArea | undefined;
                const card =
                  h.franquiciatario_id && !h.tienda_id
                    ? `/crm/franquiciatarios/${h.franquiciatario_id}`
                    : h.tienda_id
                      ? `/crm/sucursales/${h.tienda_id}`
                      : null;
                return (
                  <tr key={h.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular">
                      <time dateTime={h.fecha}>{cuando(h.fecha)}</time>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="font-semibold">
                        {h.actor_nombre ?? (h.origen === 'zoho' ? 'Zoho' : 'Sistema')}
                      </span>
                      {area && AREAS[area] && (
                        <span className="block text-muted-foreground">{AREAS[area].nombre}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block text-xs text-muted-foreground">
                        {ACCIONES[h.accion] ?? h.accion}
                      </span>
                      {h.resumen}
                      {h.motivo && (
                        <span className="mt-1 block rounded-md bg-warn-soft px-2 py-1 text-xs">
                          Motivo: {h.motivo}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {card ? (
                        <Link href={card} className="font-semibold hover:underline">
                          Abrir
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Páginas" className="placa flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="text-muted-foreground tabular">
          {total.toLocaleString('es-MX')} movimientos · página {pagina} de {paginas}
        </span>
        <span className="flex gap-3">
          {pagina > 1 && (
            <Link
              className="font-semibold hover:underline"
              href={`/crm/bitacora?${qs({ pagina: String(pagina - 1) })}`}
            >
              Anterior
            </Link>
          )}
          {pagina < paginas && (
            <Link
              className="font-semibold hover:underline"
              href={`/crm/bitacora?${qs({ pagina: String(pagina + 1) })}`}
            >
              Siguiente
            </Link>
          )}
        </span>
      </nav>
    </>
  );
}
