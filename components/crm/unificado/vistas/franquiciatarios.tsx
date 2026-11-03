import Link from 'next/link';
import { Search, Store } from 'lucide-react';
import type { EtapaGeneral } from '@/lib/crm/unificado/modelo';
import { ChipEtapa } from '@/components/crm/unificado/card-pipeline';
import { Avatar, Segmentos, VacioBreve } from '@/components/crm/unificado/piezas';

export interface FilaFranquiciatario {
  id: string;
  nombre: string;
  ciudad: string | null;
  etapa: EtapaGeneral | null;
  sucursales: number;
  vendedor: string | null;
  muestra: boolean;
  formalizado: boolean;
}

export interface DatosFranquiciatarios {
  filas: FilaFranquiciatario[];
  q?: string;
  estado: '' | 'formalizados' | 'en_proceso';
  conteos: { todos: number; formalizados: number; en_proceso: number };
  total: number;
  pagina: number;
  paginas: number;
}

const enlace = (d: Pick<DatosFranquiciatarios, 'q'>, estado: string, pagina = 1) =>
  `/crm/franquiciatarios?${new URLSearchParams({
    ...(d.q ? { q: d.q } : {}),
    ...(estado ? { estado } : {}),
    ...(pagina > 1 ? { pagina: String(pagina) } : {}),
  })}`;

/** Directorio de franquiciatarios en fichas: quién es, en qué etapa va, cuántas sucursales y quién lo lleva. */
export function VistaFranquiciatarios(d: DatosFranquiciatarios) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmentos
          etiqueta="Estado"
          activo={d.estado}
          opciones={[
            { valor: '', texto: 'Todos', href: enlace(d, ''), contador: d.conteos.todos },
            {
              valor: 'en_proceso',
              texto: 'En proceso',
              href: enlace(d, 'en_proceso'),
              contador: d.conteos.en_proceso,
            },
            {
              valor: 'formalizados',
              texto: 'Formalizados',
              href: enlace(d, 'formalizados'),
              contador: d.conteos.formalizados,
            },
          ]}
        />
        <form className="min-w-56 flex-1" role="search">
          {d.estado && <input type="hidden" name="estado" value={d.estado} />}
          <label className="relative block">
            <span className="sr-only">Buscar franquiciatario</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              name="q"
              type="search"
              defaultValue={d.q}
              placeholder="Buscar por nombre"
              className="!pl-9"
            />
          </label>
        </form>
      </div>

      {d.filas.length === 0 ? (
        <VacioBreve>
          Sin franquiciatarios con estos filtros. Prueba con otro nombre o quita el filtro.
        </VacioBreve>
      ) : (
        <ul role="list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {d.filas.map((f) => (
            <li key={f.id}>
              <Link
                href={`/crm/franquiciatarios/${f.id}`}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
              >
                <span className="flex items-start gap-3">
                  <Avatar nombre={f.nombre} area={f.etapa?.area} tam={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold group-hover:underline">{f.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.ciudad ?? 'Sin ciudad de interés'}
                    </span>
                  </span>
                  {f.formalizado ? (
                    <span className="shrink-0 rounded-md bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                      Formalizado
                    </span>
                  ) : f.muestra ? (
                    <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Muestra
                    </span>
                  ) : null}
                </span>
                {f.etapa && <ChipEtapa etapa={f.etapa} className="self-start" />}
                <span className="mt-auto flex items-center gap-3 border-t border-line pt-2.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5" title="Sucursales">
                    <Store size={13} aria-hidden="true" />
                    <span className="font-semibold tabular text-ink-2">{f.sucursales}</span>
                    {f.sucursales === 1 ? 'sucursal' : 'sucursales'}
                  </span>
                  <span className="ml-auto inline-flex min-w-0 items-center gap-1.5">
                    {f.vendedor && <Avatar nombre={f.vendedor} tam={18} />}
                    <span className="truncate">{f.vendedor ?? 'Sin vendedor'}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Páginas" className="placa flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="text-muted-foreground tabular">
          {d.total.toLocaleString('es-MX')} franquiciatarios · página {d.pagina} de {d.paginas}
        </span>
        <span className="flex gap-3">
          {d.pagina > 1 && (
            <Link className="font-semibold hover:underline" href={enlace(d, d.estado, d.pagina - 1)}>
              Anterior
            </Link>
          )}
          {d.pagina < d.paginas && (
            <Link className="font-semibold hover:underline" href={enlace(d, d.estado, d.pagina + 1)}>
              Siguiente
            </Link>
          )}
        </span>
      </nav>
    </>
  );
}
