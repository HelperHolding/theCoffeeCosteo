import { ChevronDown, Plus } from 'lucide-react';
import { sesion } from '@/lib/supabase/sesion';
import { todas, porcentaje, dinero } from '@/lib/portal/consultas';
import { campos, areas, type TablaEditable } from '@/lib/portal/configuracion';
import { puede } from '@/lib/portal/permisos';
import { FormularioRegistro } from '@/components/portal/formulario-registro';
import { AvisoComision } from '@/components/portal/aviso-comision';
import { Encabezado, Tarjeta, Pill } from '@/components/portal/piezas';
import { Pestanas } from '@/components/portal/pestanas';
const secciones: [TablaEditable, string, string][] = [
  ['parametros', 'Parámetros', 'IVA y margen objetivo que usan todos los cálculos.'],
  ['canales', 'Canales', 'Comisión, envase y tope de markup por canal. Los canales son fijos.'],
  ['tamanos', 'Tamaños', 'Catálogo de tamaños que pueden vender los productos.'],
  ['categorias_producto', 'Categorías de producto', 'Agrupan el menú en el tablero y el resumen.'],
  ['categorias_insumo', 'Categorías de insumo', 'Agrupan los insumos de Compras.'],
  ['proveedores', 'Proveedores', 'Proveedores de insumos.'],
];
type Fila = Record<string, unknown> & { id: string | number };
export default async function Configuracion({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db, perfil } = await sesion();
  const datos = Object.fromEntries(
    await Promise.all(
      secciones.map(async ([tabla]) => [tabla, (await todas(db, tabla, 'id')) as unknown as Fila[]] as const),
    ),
  ) as Record<TablaEditable, Fila[]>;
  const info = Object.fromEntries(secciones.map(([t, titulo, desc]) => [t, { titulo, desc }])) as Record<
    TablaEditable,
    { titulo: string; desc: string }
  >;
  const lista = (tabla: TablaEditable) => {
    const editable = puede(perfil.rol, areas[tabla]);
    return (
      <Tarjeta key={tabla} titulo={info[tabla].titulo} descripcion={info[tabla].desc}>
        <div className="space-y-2">
          {datos[tabla].map((r) => (
            <details
              key={String(r.id)}
              className="group rounded-xl border border-line bg-paper/40 open:bg-surface"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{'nombre' in r ? String(r.nombre) : 'Configuración general'}</span>
                {'activo' in r && (
                  <Pill estado={r.activo ? 'ok' : 'sin-precio'}>{r.activo ? 'Activo' : 'Inactivo'}</Pill>
                )}
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-line p-4">
                <FormularioRegistro
                  tabla={tabla}
                  id={r.id}
                  inicial={r}
                  campos={campos[tabla]}
                  editable={editable}
                />
              </div>
            </details>
          ))}
          {!['parametros', 'canales'].includes(tabla) && editable && (
            <details className="group rounded-xl border border-dashed border-line-strong">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-crema-strong [&::-webkit-details-marker]:hidden">
                <Plus size={16} aria-hidden="true" /> Crear nuevo registro
              </summary>
              <div className="border-t border-line p-4">
                <FormularioRegistro
                  tabla={tabla}
                  id={null}
                  inicial={{ orden: 0 }}
                  campos={campos[tabla]}
                  editable
                />
              </div>
            </details>
          )}
        </div>
      </Tarjeta>
    );
  };
  const parametros = datos.parametros[0] as { iva?: number; margen_objetivo?: number } | undefined;
  const canales = datos.canales as unknown as {
    id: string;
    nombre: string;
    comision_pct: number;
    comision_confirmada: boolean;
    costo_envase: number;
    markup_max_pct: number | null;
    regla_precio: string;
  }[];
  return (
    <>
      <Encabezado
        area="Ajustes"
        titulo="Configuración"
        descripcion="Cada área edita sus catálogos. Los canales son fijos y los tamaños se crean o editan."
      />
      <Pestanas
        key={tab ?? 'general'}
        inicial={tab}
        pestanas={[
          {
            id: 'canales',
            nombre: 'Parámetros y canales',
            contenido: (
              <>
                <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-ink p-5 text-white shadow-card xl:col-span-1">
                    <p className="text-sm text-neutral-400">IVA</p>
                    <p className="mt-1 font-display text-3xl font-black tabular">
                      {porcentaje(parametros?.iva ?? null)}
                    </p>
                    <p className="mt-4 text-sm text-neutral-400">Margen objetivo</p>
                    <p className="mt-1 font-display text-3xl font-black text-crema tabular">
                      {porcentaje(parametros?.margen_objetivo ?? null)}
                    </p>
                  </div>
                  {canales.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-line bg-surface p-5 shadow-card xl:col-span-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h2>{c.nombre}</h2>
                        {!c.comision_confirmada && <Pill estado="bajo">Por confirmar</Pill>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.regla_precio === 'castigado' ? 'Precio castigado con tope' : 'Precio de mostrador'}
                      </p>
                      <dl className="mt-4 space-y-2 text-sm">
                        {[
                          ['Comisión', porcentaje(c.comision_pct)],
                          ['Envase', dinero(c.costo_envase)],
                          ['Tope markup', c.markup_max_pct === null ? '—' : porcentaje(c.markup_max_pct)],
                        ].map(([k, v]) => (
                          <div
                            key={k}
                            className="flex justify-between border-b border-line pb-2 last:border-0"
                          >
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="font-semibold tabular">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  {lista('parametros')}
                  {lista('canales')}
                </div>
              </>
            ),
          },
          {
            id: 'catalogos',
            nombre: 'Catálogos',
            contenido: (
              <div className="grid gap-5 xl:grid-cols-3">
                {lista('tamanos')}
                {lista('categorias_producto')}
                {lista('categorias_insumo')}
              </div>
            ),
          },
          {
            id: 'proveedores',
            nombre: 'Proveedores',
            contador: datos.proveedores.length,
            contenido: lista('proveedores'),
          },
        ]}
      />
    </>
  );
}
