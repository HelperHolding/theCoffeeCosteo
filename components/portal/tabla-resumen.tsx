'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, X, Rows3, LayoutGrid } from 'lucide-react';
import type { Resumen, Alerta } from '@/lib/supabase/database.types';
import { dinero, porcentaje, mayusculas } from '@/lib/portal/consultas';
import { esCanal, fusionarCanales } from '@/lib/portal/canales';
import { Button } from '@/components/ui/button';
import { Pill, estadoMargen, Insignia, Vacio } from '@/components/portal/piezas';
type Fila = Resumen & { alerta: string | null };
const columns: ColumnDef<Fila>[] = [
  {
    accessorKey: 'producto',
    header: 'Producto',
    cell: ({ row }) => (
      <Link
        className="font-semibold hover:text-crema-strong hover:underline"
        href={`/productos/${row.original.producto_id}`}
      >
        {mayusculas(row.original.producto)}
      </Link>
    ),
  },
  {
    accessorKey: 'categoria',
    header: 'Categoría',
    cell: ({ getValue }) => <span className="text-ink-2">{mayusculas(getValue<string>())}</span>,
  },
  {
    accessorKey: 'tamano',
    header: 'Tamaño',
    cell: ({ getValue }) => <Insignia>{mayusculas(getValue<string>())}</Insignia>,
  },
  { accessorKey: 'canal', header: 'Canal', cell: ({ getValue }) => mayusculas(getValue<string>()) },
  {
    accessorKey: 'costo',
    header: 'Costo',
    meta: { numero: true },
    cell: ({ row }) => dinero(row.original.costo),
  },
  {
    accessorKey: 'precio_canal',
    header: 'Precio',
    meta: { numero: true },
    sortUndefined: 'last',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        {row.original.precio_manual !== null && (
          <span className="rounded bg-crema-soft px-1 text-[10px] font-semibold uppercase text-crema-strong">
            Manual
          </span>
        )}
        {dinero(row.original.precio_canal)}
      </span>
    ),
  },
  // Oculta: los márgenes se consultan en la ficha de cada producto; solo sirve para ?orden=margen.
  { accessorKey: 'margen_pct', header: 'Margen', sortUndefined: 'last' },
  {
    accessorKey: 'alerta',
    header: 'Alerta',
    cell: ({ row }) =>
      row.original.alerta ? (
        <span className="text-xs text-ink-2">{row.original.alerta}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];
function exportar(data: Fila[]) {
  void import('xlsx').then((XLSX) => {
    const hoja = XLSX.utils.json_to_sheet(
      data.map((f) => ({
        Producto: f.producto,
        Categoría: f.categoria,
        Tamaño: f.tamano,
        Canal: f.canal,
        Costo: f.costo,
        'Precio canal': f.precio_canal,
        'Precio manual': f.precio_manual,
        'Margen bruto $': f.margen_bruto,
        'Margen bruto %': f.margen_bruto_pct,
        'Comisión $': f.comision,
        'Margen con comisión $': f.margen,
        'Margen con comisión %': f.margen_pct,
        Alerta: f.alerta ?? '',
      })),
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Resumen');
    XLSX.writeFile(libro, `resumen-costeo-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}
export function TablaResumen({
  filas,
  alertas,
  filtros = {},
}: {
  filas: Resumen[];
  alertas: Alerta[];
  filtros?: Record<string, string | undefined>;
}) {
  const [buscar, setBuscar] = useState(filtros.buscar ?? ''),
    [categoria, setCategoria] = useState(filtros.categoria ?? ''),
    [canal, setCanal] = useState(filtros.canal ?? ''),
    [tamano, setTamano] = useState(filtros.tamano ?? ''),
    [alerta, setAlerta] = useState(filtros.alerta ?? ''),
    [estado, setEstado] = useState(filtros.estado ?? 'activos'),
    [vista, setVista] = useState(filtros.vista ?? 'detalle'),
    [sorting, setSorting] = useState<SortingState>(
      filtros.orden === 'margen' ? [{ id: 'margen_pct', desc: false }] : [],
    );
  function cambiar(clave: string, setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      const params = new URLSearchParams(window.location.search);
      if (value) params.set(clave, value);
      else params.delete(clave);
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    };
  }
  const data = useMemo(() => {
    const mapa = new Map(alertas.map((a) => [`${a.producto_id}:${a.canal_id}`, a.alerta]));
    return fusionarCanales(
      filas.map((f) => ({ ...f, alerta: mapa.get(`${f.producto_id}:${f.canal_id}`) ?? null })),
      { unir: (m, a) => ({ alerta: m.alerta ?? a.alerta }) },
    ).filter(
      (f) =>
        f.producto.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')) &&
        (!categoria || f.categoria === categoria) &&
        (!canal || esCanal(f.canal, canal)) &&
        (!tamano || f.tamano === tamano) &&
        (!alerta || f.alerta === alerta) &&
        (estado === 'todos' || f.activo === (estado === 'activos')),
    );
  }, [filas, alertas, buscar, categoria, canal, tamano, alerta, estado]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: { margen_pct: false } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
    initialState: { pagination: { pageSize: 25 } },
  });
  const filtrosActivos = [categoria, canal, tamano, alerta, buscar].filter(Boolean).length;
  const limpiar = () => {
    for (const [k, s] of [
      ['buscar', setBuscar],
      ['categoria', setCategoria],
      ['canal', setCanal],
      ['tamano', setTamano],
      ['alerta', setAlerta],
    ] as const)
      cambiar(k, s)('');
  };
  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]">
          <label>
            Buscar producto
            <span className="relative block">
              <Search
                size={16}
                aria-hidden="true"
                className="absolute left-3 top-[1.2rem] text-muted-foreground"
              />
              <input
                value={buscar}
                onChange={(e) => cambiar('buscar', setBuscar)(e.target.value)}
                placeholder="Nombre…"
                className="!pl-9"
              />
            </span>
          </label>
          {(
            [
              ['Categoría', 'categoria', categoria, setCategoria, filas.map((f) => f.categoria)],
              ['Canal', 'canal', canal, setCanal, fusionarCanales(filas).map((f) => f.canal)],
              ['Tamaño', 'tamano', tamano, setTamano, filas.map((f) => f.tamano)],
              ['Alerta', 'alerta', alerta, setAlerta, alertas.flatMap((a) => (a.alerta ? [a.alerta] : []))],
            ] as const
          ).map(([nombre, clave, valor, setter, valores]) => (
            <label key={nombre}>
              {nombre}
              <select
                value={valor}
                onChange={(e) => cambiar(clave, setter)(e.target.value)}
                className={valor ? '!border-crema !bg-crema-soft/40' : ''}
              >
                <option value="">Todos</option>
                {[...new Set([...valores, ...(valor ? [valor] : [])])].map((v) => (
                  <option key={v} value={v}>
                    {clave === 'alerta' ? v : mayusculas(v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Estado
            <select value={estado} onChange={(e) => cambiar('estado', setEstado)(e.target.value)}>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex rounded-[10px] border border-line-strong bg-surface p-0.5 shadow-card"
          role="group"
          aria-label="Vista"
        >
          {(
            [
              ['detalle', 'Detalle', Rows3],
              ['producto', 'Por producto', LayoutGrid],
            ] as const
          ).map(([v, nombre, Icono]) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => cambiar('vista', setVista)(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${vista === v ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2'}`}
            >
              <Icono size={14} aria-hidden="true" /> {nombre}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-ink tabular">{data.length}</span> filas de producto × tamaño ×
          canal
        </p>
        {filtrosActivos > 0 && (
          <Button variant="ghost" size="sm" onClick={limpiar}>
            <X /> Limpiar filtros
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => exportar(table.getSortedRowModel().rows.map((r) => r.original))}
          disabled={!data.length}
        >
          <Download /> Exportar a Excel
        </Button>
      </div>

      {vista === 'producto' ? (
        <VistaProducto data={data} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                {table.getHeaderGroups().map((g) => (
                  <tr key={g.id}>
                    {g.headers.map((h) => {
                      const numero = (h.column.columnDef.meta as { numero?: boolean } | undefined)?.numero;
                      const orden = h.column.getIsSorted();
                      const Icono = orden === 'asc' ? ArrowUp : orden === 'desc' ? ArrowDown : ArrowUpDown;
                      return (
                        <th
                          key={h.id}
                          className={numero ? 'text-right' : ''}
                          aria-sort={orden ? (orden === 'asc' ? 'ascending' : 'descending') : undefined}
                        >
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className={`inline-flex items-center gap-1 uppercase hover:text-ink ${numero ? 'flex-row-reverse' : ''}`}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icono
                              size={12}
                              aria-hidden="true"
                              className={orden ? 'text-crema-strong' : 'opacity-40'}
                            />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr key={r.id}>
                    {r.getVisibleCells().map((c) => (
                      <td
                        key={c.id}
                        className={
                          (c.column.columnDef.meta as { numero?: boolean } | undefined)?.numero
                            ? 'numero'
                            : ''
                        }
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.length && (
              <Vacio titulo="No hay resultados con estos filtros">
                Prueba con otro nombre o limpia los filtros.
              </Vacio>
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
            <p className="text-muted-foreground tabular">
              {data.length
                ? `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, data.length)} de ${data.length}`
                : '0 resultados'}
            </p>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filas por página"
                value={pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="!w-auto !py-1.5 text-xs"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground tabular">
                Página {pageIndex + 1} de {Math.max(1, table.getPageCount())}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Siguiente
              </Button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

function VistaProducto({ data }: { data: Fila[] }) {
  const canales = [...new Map(data.map((f) => [f.canal, f.canal_orden])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([c]) => c);
  const grupos = new Map<string, Fila[]>();
  for (const f of data) {
    const k = `${f.producto_id}:${f.tamano_id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const filas = [...grupos.values()].sort(
    (a, b) => a[0].producto.localeCompare(b[0].producto, 'es') || a[0].tamano_orden - b[0].tamano_orden,
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Tamaño</th>
              <th className="text-right">Costo</th>
              {canales.map((c) => (
                <th key={c} className="text-center">
                  {mayusculas(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((xs) => (
              <tr key={`${xs[0].producto_id}:${xs[0].tamano_id}`}>
                <td>
                  <Link
                    className="font-semibold hover:text-crema-strong hover:underline"
                    href={`/productos/${xs[0].producto_id}`}
                  >
                    {mayusculas(xs[0].producto)}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{mayusculas(xs[0].categoria)}</span>
                </td>
                <td>
                  <Insignia>{mayusculas(xs[0].tamano)}</Insignia>
                </td>
                <td className="numero">{dinero(xs[0].costo)}</td>
                {canales.map((c) => {
                  const f = xs.find((x) => x.canal === c);
                  return (
                    <td key={c} className="text-center">
                      {f ? (
                        <span className="inline-flex flex-col items-center gap-1">
                          <span className="text-sm font-medium tabular">{dinero(f.precio_canal)}</span>
                          <Pill estado={estadoMargen(f)}>{porcentaje(f.margen_pct)}</Pill>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <Vacio titulo="No hay resultados con estos filtros" />}
      </div>
    </div>
  );
}
