import { Suspense } from 'react';
import Link from 'next/link';
import type { Db } from '@/lib/portal/consultas';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { armarCards, candadosTodos, etapasGenerales, pipeline } from '@/lib/crm/unificado/consultas';
import { estadoCandado, puedeMoverEtapa, tramos } from '@/lib/crm/unificado/modelo';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import {
  EsqueletoEntradas,
  VistaEntradasPipeline,
  type EntradaTramo,
} from '@/components/crm/unificado/vistas/entradas-pipeline';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { PanelCifras } from '@/components/crm/unificado/piezas';
import { PipelineGeneral, TablaCards } from '@/components/crm/unificado/pipeline';
import { NuevoFranquiciatario } from '@/components/crm/unificado/nuevo-franquiciatario';

const POR_PAGINA = 100;
const TRAMOS = ['ventas', 'locales', 'proyectos', 'cierre'] as const;

export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; etapa?: string; pagina?: string; tramo?: string }>;
}) {
  const p = await searchParams;
  const { db, perfil, accesos } = await sesionCrm();
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
          .order('id')
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

  // Sin tramo elegido: atajos por tramo antes del tablero completo (doc 41 §7). El encabezado sale de
  // inmediato y las cifras (que leen crm_v_candados completa) llegan en cuanto están.
  if (!p.tramo) {
    return (
      <>
        <Encabezado
          area="CRM Franquicias"
          titulo="Pipeline"
          descripcion="Elige un tramo para ver sus cards, o abre el tablero completo."
        >
          {editable && <NuevoFranquiciatario />}
        </Encabezado>
        <Suspense fallback={<EsqueletoEntradas />}>
          <EntradasConCifras db={db} />
        </Suspense>
      </>
    );
  }

  const [{ etapas, cards, totales }, usuario] = await Promise.all([
    pipeline(db),
    usuarioCrm(db, perfil, accesos),
  ]);
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
      <PanelCifras
        cifras={[
          {
            etiqueta: 'Bloqueadas',
            valor: conteo('bloqueada'),
            tono: 'bad',
            nota: 'de las cards a la vista',
          },
          { etiqueta: 'Listas para avanzar', valor: conteo('lista'), tono: 'ok', nota: 'todo validado' },
          { etiqueta: 'Candados liberados', valor: conteo('liberada'), tono: 'warn', nota: 'por consumir' },
          { etiqueta: 'Vencen en 14 días', valor: vencen, nota: 'COF, 5 días hábiles, 120 días' },
        ]}
      />
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
          movibles={etapas.filter((e) => puedeMoverEtapa(usuario, e)).map((e) => e.id)}
          tramoInicial={tramo}
        />
      )}
    </>
  );
}

async function EntradasConCifras({ db }: { db: Db }) {
  const [etapas, cs] = await Promise.all([
    etapasGenerales(db),
    candadosTodos(db, ['etapa_id', 'total', 'listos', 'liberado', 'carril_total', 'carril_listos'] as const),
  ]);
  const entradas: EntradaTramo[] = tramos(etapas).map((t) => {
    const ids = new Set(t.etapas.map((e) => e.id));
    const de = cs.filter((c) => ids.has(c.etapa_id));
    const abierta = (id: string) => t.etapas.find((e) => e.id === id)?.tipo === 'abierta';
    return {
      clave: t.clave,
      nombre: t.nombre,
      area: t.area,
      total: de.length,
      bloqueadas: de.filter((c) => abierta(c.etapa_id) && !c.liberado && c.listos < c.total).length,
      listas: de.filter((c) => abierta(c.etapa_id) && (c.liberado || c.listos >= c.total)).length,
      principales: t.etapas
        .map((e) => ({
          nombre: e.nombre,
          numero: e.numero ? String(e.numero) : (e.paso ?? ''),
          n: de.filter((c) => c.etapa_id === e.id).length,
        }))
        .filter((e) => e.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3),
    };
  });
  const enCarril = cs.filter((c) => c.carril_total > 0);
  return (
    <VistaEntradasPipeline
      tramos={entradas}
      carril={{
        total: enCarril.length,
        completos: enCarril.filter((c) => c.carril_listos >= c.carril_total).length,
      }}
    />
  );
}
