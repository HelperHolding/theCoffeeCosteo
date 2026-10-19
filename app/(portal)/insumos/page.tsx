import Link from 'next/link';
import { Package, PackageX, Archive, Truck, Search, Plus, X, Pencil } from 'lucide-react';
import { sesion } from '@/lib/supabase/sesion';
import { todas, dinero, mayusculas } from '@/lib/portal/consultas';
import { campos } from '@/lib/portal/configuracion';
import { puede } from '@/lib/portal/permisos';
import { dependientes } from '@/lib/portal/dependencias';
import { FormularioRegistro } from '@/components/portal/formulario-registro';
import { Encabezado, Tarjeta, Kpi, Barra, Insignia, Pill, Vacio } from '@/components/portal/piezas';
import { Button } from '@/components/ui/button';
export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    uso?: string;
    estado?: string;
    proveedor?: string;
    categoria?: string;
    pagina?: string;
    editar?: string;
  }>;
}) {
  const p = await searchParams;
  const { db, perfil } = await sesion();
  const [insumos, proveedores, categorias, lineas, recetas] = await Promise.all([
    todas(db, 'insumos', 'nombre,id'),
    todas(db, 'proveedores', 'nombre,id'),
    todas(db, 'categorias_insumo', 'nombre,id'),
    todas(db, 'receta_lineas', 'id'),
    todas(db, 'recetas', 'id'),
  ]);
  const permisos = puede(perfil.rol, 'insumos');
  const usos = new Map(insumos.map((i) => [i.id, dependientes(lineas, recetas, i.id, 'insumo')]));
  const productos = (id: string) => usos.get(id)?.filter((r) => r.tipo === 'producto').length ?? 0;
  const nombreDe = (xs: { id: string; nombre: string }[], id: string) =>
    xs.find((x) => x.id === id)?.nombre ?? '—';
  const filtrados = insumos.filter(
    (i) =>
      i.nombre.toLocaleLowerCase('es').includes((p.q ?? '').toLocaleLowerCase('es')) &&
      (p.uso !== 'sin' || !usos.get(i.id)?.length) &&
      (p.estado === 'todos' || i.activo === (p.estado !== 'inactivos')) &&
      (!p.proveedor || i.proveedor_id === p.proveedor) &&
      (!p.categoria || i.categoria_id === p.categoria),
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / 25));
  const pagina = Math.min(paginas, Math.max(1, Number(p.pagina) || 1));
  const conParams = (cambios: Record<string, string | undefined>) => {
    const q = new URLSearchParams(
      Object.entries({ ...p, ...cambios }).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
      ),
    );
    return `?${q}`;
  };
  const camposInsumo = (actual?: (typeof insumos)[number]) =>
    campos.insumos.map((c) =>
      c.nombre === 'proveedor_id' || c.nombre === 'categoria_id'
        ? {
            ...c,
            opciones: (c.nombre === 'proveedor_id' ? proveedores : categorias)
              .filter((x) => x.activo || x.id === actual?.[c.nombre as 'proveedor_id' | 'categoria_id'])
              // Solo para mostrar: las categorías se leen en mayúsculas sin cambiar lo guardado.
              .map((x) => ({
                id: x.id,
                nombre:
                  (c.nombre === 'categoria_id' ? mayusculas(x.nombre) : x.nombre) +
                  (x.activo ? '' : ' (inactivo)'),
              })),
          }
        : c,
    );
  const activos = insumos.filter((i) => i.activo);
  const sinUso = activos.filter((i) => !usos.get(i.id)?.length).length;
  const impacto = [...activos].sort((a, b) => productos(b.id) - productos(a.id)).slice(0, 6);
  const editando = p.editar === 'nuevo' ? 'nuevo' : insumos.find((i) => i.id === p.editar);
  return (
    <>
      <Encabezado
        area="Compras"
        titulo="Insumos"
        descripcion="Costo por unidad, proveedor y cuántos productos dependen de cada insumo."
      >
        {permisos && (
          <Button asChild variant="accent" size="lg">
            <Link href={conParams({ editar: 'nuevo' })}>
              <Plus aria-hidden="true" /> Crear insumo
            </Link>
          </Button>
        )}
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Insumos activos" valor={activos.length} icono={Package} />
        <Kpi
          etiqueta="Sin uso"
          valor={sinUso}
          icono={PackageX}
          tono={sinUso ? 'bajo' : 'ok'}
          nota="Activos que ninguna receta usa"
          href={conParams({ uso: 'sin', pagina: undefined })}
        />
        <Kpi
          etiqueta="Inactivos"
          valor={insumos.length - activos.length}
          icono={Archive}
          tono="sin-precio"
          href={conParams({ estado: 'inactivos', pagina: undefined })}
        />
        <Kpi etiqueta="Proveedores" valor={proveedores.filter((x) => x.activo).length} icono={Truck} />
      </div>

      <div className={`grid gap-5 ${editando ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
        <div className="min-w-0 space-y-5">
          <form className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_auto] xl:items-end">
            <label>
              Buscar
              <span className="relative block">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="absolute left-3 top-[1.2rem] text-muted-foreground"
                />
                <input name="q" defaultValue={p.q} placeholder="Nombre…" className="!pl-9" />
              </span>
            </label>
            <label>
              Uso
              <select name="uso" defaultValue={p.uso}>
                <option value="">Todos</option>
                <option value="sin">Sin uso</option>
              </select>
            </label>
            <label>
              Estado
              <select name="estado" defaultValue={p.estado}>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <label>
              Proveedor
              <select name="proveedor" defaultValue={p.proveedor}>
                <option value="">Todos</option>
                {proveedores.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoría
              <select name="categoria" defaultValue={p.categoria}>
                <option value="">Todas</option>
                {categorias.map((x) => (
                  <option key={x.id} value={x.id}>
                    {mayusculas(x.nombre)}
                  </option>
                ))}
              </select>
            </label>
            <Button>Aplicar filtros</Button>
          </form>

          <section
            className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
            aria-label="Insumos"
          >
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Proveedor</th>
                    <th className="text-right">Paquete</th>
                    <th className="text-right">Costo unitario</th>
                    <th className="text-right">Productos</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.slice((pagina - 1) * 25, pagina * 25).map((i) => (
                    <tr
                      key={`${i.id}:${i.updated_at}`}
                      className={editando !== 'nuevo' && editando?.id === i.id ? '!bg-crema-soft/50' : ''}
                    >
                      <td>
                        <Link
                          href={conParams({ editar: i.id })}
                          className="font-semibold hover:text-crema-strong hover:underline"
                        >
                          {i.nombre}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {nombreDe(categorias, i.categoria_id)}
                        </span>
                      </td>
                      <td className="text-ink-2">{nombreDe(proveedores, i.proveedor_id)}</td>
                      <td className="numero">
                        {dinero(i.costo_paquete)}
                        <span className="block text-xs text-muted-foreground">
                          {i.presentacion} {i.unidad}
                        </span>
                      </td>
                      <td className="numero font-semibold">
                        {new Intl.NumberFormat('es-MX', {
                          style: 'currency',
                          currency: 'MXN',
                          maximumFractionDigits: 4,
                        }).format(i.costo_unitario)}
                        <span className="font-normal text-muted-foreground"> / {i.unidad}</span>
                      </td>
                      <td className="numero">
                        {productos(i.id) ? (
                          <Insignia>{productos(i.id)}</Insignia>
                        ) : (
                          <span className="text-xs text-warn">Sin uso</span>
                        )}
                      </td>
                      <td>
                        <Pill estado={i.activo ? 'ok' : 'sin-precio'}>
                          {i.activo ? 'Activo' : 'Inactivo'}
                        </Pill>
                      </td>
                      <td>
                        <Link
                          href={conParams({ editar: i.id })}
                          aria-label={`Abrir ${i.nombre}`}
                          className="inline-flex rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtrados.length && (
                <Vacio titulo="No hay resultados">Cambia la búsqueda o los filtros.</Vacio>
              )}
            </div>
            <nav
              className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"
              aria-label="Páginas de insumos"
            >
              <span className="text-muted-foreground tabular">
                {filtrados.length} insumos · Página {pagina} de {paginas}
              </span>
              <span className="flex gap-2">
                {pagina > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <a href={conParams({ pagina: String(pagina - 1) })}>Anterior</a>
                  </Button>
                )}
                {pagina < paginas && (
                  <Button asChild variant="outline" size="sm">
                    <a href={conParams({ pagina: String(pagina + 1) })}>Siguiente</a>
                  </Button>
                )}
              </span>
            </nav>
          </section>

          {!editando && (
            <Tarjeta
              titulo="Insumos con más impacto"
              descripcion="Un cambio de costo en estos insumos mueve más productos."
            >
              <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {impacto.map((i) => (
                  <li
                    key={i.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm"
                  >
                    <Link href={conParams({ editar: i.id })} className="truncate font-medium hover:underline">
                      {i.nombre}
                    </Link>
                    <span className="text-xs font-semibold tabular">{productos(i.id)} productos</span>
                    <Barra
                      valor={productos(i.id)}
                      max={productos(impacto[0]?.id ?? '') || 1}
                      className="col-span-2 h-1.5"
                    />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        {editando && (
          <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-[420px] overflow-y-auto border-l border-line bg-surface shadow-lift xl:sticky xl:top-24 xl:z-auto xl:h-fit xl:max-w-none xl:rounded-2xl xl:border">
            <header className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div>
                <p className="eyebrow">
                  {editando === 'nuevo' ? 'Nuevo' : permisos ? 'Editar insumo' : 'Detalle'}
                </p>
                <h2 className="mt-1 text-lg">{editando === 'nuevo' ? 'Crear insumo' : editando.nombre}</h2>
              </div>
              <Link
                href={conParams({ editar: undefined })}
                aria-label="Cerrar panel"
                className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-ink"
              >
                <X size={18} aria-hidden="true" />
              </Link>
            </header>
            <div className="space-y-5 p-5">
              {editando === 'nuevo' ? (
                <FormularioRegistro
                  tabla="insumos"
                  id={null}
                  inicial={{ unidad: 'gr', activo: true }}
                  campos={camposInsumo()}
                  editable={permisos}
                />
              ) : (
                <>
                  <FormularioRegistro
                    key={`${editando.id}:${editando.updated_at}`}
                    tabla="insumos"
                    id={editando.id}
                    inicial={editando as unknown as Record<string, unknown>}
                    campos={camposInsumo(editando)}
                    editable={permisos}
                    impacto={usos.get(editando.id)?.map((r) => r.nombre)}
                  />
                  <div>
                    <p className="text-xs font-semibold text-ink-2">Usado en</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {usos.get(editando.id)?.map((r) => (
                        <Link
                          key={r.id}
                          href={`/${r.tipo === 'producto' ? 'productos' : 'subrecetas'}/${r.id}`}
                          className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-crema hover:bg-crema-soft"
                        >
                          {r.nombre}
                        </Link>
                      ))}
                      {!usos.get(editando.id)?.length && (
                        <span className="text-sm text-muted-foreground">Sin uso</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
