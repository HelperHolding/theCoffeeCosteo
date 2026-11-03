import Link from 'next/link';
import { CalendarClock, CircleCheck, Lock, LockOpen } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { armarCards, etapasGenerales, pipeline } from '@/lib/crm/unificado/consultas';
import { estadoCandado } from '@/lib/crm/unificado/modelo';
import { Encabezado, Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { PipelineGeneral, TablaCards } from '@/components/crm/unificado/pipeline';
import { NuevoFranquiciatario } from '@/components/crm/unificado/nuevo-franquiciatario';

const POR_PAGINA = 100;
const TRAMOS = ['ventas', 'locales', 'proyectos', 'legal', 'cierre'] as const;

export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; etapa?: string; pagina?: string; tramo?: string }>;
}) {
  const p = await searchParams;
  const { db, accesos } = await sesionCrm();
  const editable = puedeEditarCrm(accesos);

  // Tabla de una etapa completa («Ver las N en tabla»), paginada en el servidor.
  if (p.vista === 'tabla' && p.etapa) {
    const etapas = await etapasGenerales(db);
    const etapa = etapas.find((e) => e.clave === p.etapa);
    const pagina = Math.max(1, Number(p.pagina) || 1);
    const tabla = etapa?.card === 'sucursal' ? 'crm_tiendas' : 'crm_franquiciatarios';
    const r = etapa
      ? await db
          .from(tabla)
          .select('id', { count: 'exact' })
          .eq('etapa_id', etapa.id)
          .is('archivado_en', null)
          .order('actualizado_en', { ascending: false })
          .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      : { data: [], count: 0 };
    const tipo = etapa?.card === 'sucursal' ? ('sucursal' as const) : ('franquiciatario' as const);
    const cards = await armarCards(
      db,
      ((r.data ?? []) as { id: string }[]).map((x) => ({ id: x.id, tipo })),
    );
    const total = r.count ?? 0;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    return (
      <>
        <Encabezado
          area="CRM Franquicias"
          titulo={etapa ? etapa.nombre : 'Etapa no encontrada'}
          descripcion={`${total.toLocaleString('es-MX')} cards en esta etapa, las más recientes primero.`}
          migas={[
            { href: '/crm', nombre: 'CRM' },
            { href: '/crm/pipeline', nombre: 'Pipeline' },
          ]}
        />
        <TablaCards cards={cards} etapas={etapas} />
        <nav aria-label="Páginas" className="placa flex items-center justify-between gap-3 px-4 py-2 text-sm">
          <span className="text-muted-foreground tabular">
            Página {pagina} de {paginas}
          </span>
          <span className="flex gap-3">
            {pagina > 1 && (
              <Link
                className="font-semibold hover:underline"
                href={`/crm/pipeline?vista=tabla&etapa=${p.etapa}&pagina=${pagina - 1}`}
              >
                Anterior
              </Link>
            )}
            {pagina < paginas && (
              <Link
                className="font-semibold hover:underline"
                href={`/crm/pipeline?vista=tabla&etapa=${p.etapa}&pagina=${pagina + 1}`}
              >
                Siguiente
              </Link>
            )}
          </span>
        </nav>
      </>
    );
  }

  const { etapas, cards, totales } = await pipeline(db);
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const conteo = (estado: string) =>
    cards.filter((c) => estadoCandado(c, etapaDe.get(c.etapaId)) === estado).length;
  const vencen = cards.filter((c) => c.vencimiento && c.vencimiento.dias <= 14).length;
  const tramo = TRAMOS.find((t) => t === p.tramo) ?? 'todos';
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Pipeline"
        descripcion="De la recepción del lead a la apertura. Cada etapa se cierra con sus requisitos."
      >
        {editable && <NuevoFranquiciatario />}
      </Encabezado>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Bloqueadas"
          valor={conteo('bloqueada')}
          icono={Lock}
          tono="sin-precio"
          nota="de las cards a la vista"
        />
        <Kpi
          etiqueta="Listas para avanzar"
          valor={conteo('lista')}
          icono={CircleCheck}
          tono="ok"
          nota="todo validado"
        />
        <Kpi
          etiqueta="Candados liberados"
          valor={conteo('liberada')}
          icono={LockOpen}
          tono="bajo"
          nota="por consumir"
        />
        <Kpi
          etiqueta="Vencen en 14 días"
          valor={vencen}
          icono={CalendarClock}
          nota="COF, 5 días hábiles, 120 días"
        />
      </div>
      {cards.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Aún no hay cards en el Pipeline">
            {editable
              ? 'Registra el primer lead con «Registrar lead».'
              : 'Cuando Ventas registre leads aparecerán aquí.'}
          </Vacio>
        </Tarjeta>
      ) : (
        <PipelineGeneral
          etapas={etapas}
          cards={cards}
          totales={totales}
          editable={editable}
          tramoInicial={tramo}
        />
      )}
    </>
  );
}
