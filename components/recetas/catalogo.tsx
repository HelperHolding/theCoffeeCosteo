'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Search, Plus, Coffee, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Encabezado, Pill, textoEstado, type Estado } from '@/components/portal/piezas';
import { dinero, mayusculas, porcentaje } from '@/lib/portal/consultas';
// Un canal fusionado cuyos precios difieren guarda cada precio con el nombre de su canal.
export type PrecioCanal = number | null | { nombre: string; precio: number | null }[];
export type MargenRappi = { pct: number | null; importe: number | null; estado: Estado };
export type PreciosTamano = {
  tamano: string;
  costo: number | null;
  canales: Record<string, PrecioCanal>;
  margenRappi?: MargenRappi;
};
export type RecetaCatalogo = {
  id: string;
  nombre: string;
  activo: boolean;
  categoria?: string;
  detalle?: string;
  precios?: PreciosTamano[];
};
const texto = (tipo: 'producto' | 'subreceta', s: string) => (tipo === 'producto' ? mayusculas(s) : s);
function PorTamano({
  precios,
  valor,
}: {
  precios: PreciosTamano[];
  valor: (p: PreciosTamano) => PrecioCanal;
}) {
  if (!precios.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {precios.map((p) => (
        <li key={p.tamano} className="flex items-baseline justify-end gap-2 whitespace-nowrap">
          {precios.length > 1 && (
            <span className="text-[11px] text-muted-foreground">{mayusculas(p.tamano)}</span>
          )}
          <Precio valor={valor(p)} />
        </li>
      ))}
    </ul>
  );
}
/** Margen con comisión Rappi por tamaño: porcentaje, importe por venta y estado frente al objetivo. */
function MargenPorTamano({ precios }: { precios: PreciosTamano[] }) {
  if (!precios.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {precios.map((p) => {
        const m = p.margenRappi;
        const sinDato = !m || m.pct === null || m.importe === null;
        return (
          <li key={p.tamano} className="flex items-baseline justify-end gap-2 whitespace-nowrap">
            {precios.length > 1 && (
              <span className="text-[11px] text-muted-foreground">{mayusculas(p.tamano)}</span>
            )}
            {sinDato ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 tabular" title={textoEstado(m.estado)}>
                <Pill estado={m.estado} className="px-2 py-0.5">
                  {porcentaje(m.pct)}
                  <span className="sr-only">, {textoEstado(m.estado)}</span>
                </Pill>
                <span className="text-[11px] text-muted-foreground">{dinero(m.importe)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function Precio({ valor }: { valor: PrecioCanal }) {
  if (!Array.isArray(valor)) return <span className="tabular">{valor === null ? '—' : dinero(valor)}</span>;
  return (
    <span className="flex flex-col items-end">
      {valor.map((v) => (
        <span key={v.nombre} className="tabular">
          <span className="mr-1 text-[10px] text-muted-foreground">{mayusculas(v.nombre)}</span>
          {v.precio === null ? '—' : dinero(v.precio)}
        </span>
      ))}
    </span>
  );
}
export function CatalogoRecetas({
  filas,
  tipo,
  editable,
  canales = [],
  consulta = '',
  margenRappi = false,
}: {
  filas: RecetaCatalogo[];
  tipo: 'producto' | 'subreceta';
  editable: boolean;
  canales?: { id: string; nombre: string }[];
  consulta?: string;
  /** Columna extra que el servidor habilita por cuenta (lib/portal/vistas.ts). */
  margenRappi?: boolean;
}) {
  const conPrecios = tipo === 'producto' && canales.length > 0;
  const [buscar, setBuscar] = useState(consulta);
  const [estado, setEstado] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const ruta = tipo === 'producto' ? '/productos' : '/subrecetas';
  const filtradas = filas.filter(
    (r) =>
      r.nombre.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')) &&
      (estado === 'todos' || r.activo === (estado === 'activos')),
  );
  const paginas = Math.max(1, Math.ceil(filtradas.length / 25));
  const actual = Math.min(pagina, paginas - 1);
  const inicio = actual * 25;
  return (
    <>
      <Encabezado
        area={tipo === 'producto' ? 'Menú' : 'Menú · Preparaciones'}
        titulo={tipo === 'producto' ? 'Productos' : 'Sub-recetas'}
        descripcion={
          tipo === 'producto'
            ? 'Consulta y administra las recetas de tu menú.'
            : 'Organiza las preparaciones que comparten tus productos.'
        }
      >
        {tipo === 'producto' && (
          <Button asChild variant="outline" size="lg">
            <Link href="/productos/calculadora">
              <Calculator aria-hidden="true" />
              Calculadora de promociones
            </Link>
          </Button>
        )}
        {editable && (
          <Button asChild variant="accent" size="lg">
            <Link href={`${ruta}/${tipo === 'producto' ? 'nuevo' : 'nueva'}`}>
              <Plus aria-hidden="true" />
              Crear {tipo === 'producto' ? 'producto' : 'sub-receta'}
            </Link>
          </Button>
        )}
      </Encabezado>
      <section
        className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
        aria-label="Catálogo"
      >
        <div className="flex flex-col sm:flex-row gap-4 p-5 border-b">
          <div className="flex-1">
            <label htmlFor="buscar-recetas" className="sr-only">
              Buscar por nombre
            </label>
            <div className="relative">
              <Search
                size={18}
                aria-hidden="true"
                className="absolute left-3 top-3.5 text-muted-foreground"
              />
              <input
                id="buscar-recetas"
                type="search"
                value={buscar}
                placeholder="Buscar por nombre…"
                className="!pl-10"
                onChange={(e) => {
                  setBuscar(e.target.value);
                  setPagina(0);
                }}
              />
            </div>
          </div>
          <div className="sm:w-44">
            <label htmlFor="estado-recetas" className="sr-only">
              Estado
            </label>
            <select
              id="estado-recetas"
              value={estado}
              className="!rounded-lg"
              onChange={(e) => {
                setEstado(e.target.value);
                setPagina(0);
              }}
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
        </div>
        {/* relative: los textos sr-only (absolutos) quedan dentro del scroll y no ensanchan la página. */}
        <div className="relative overflow-x-auto">
          <table className="tabla [&_td]:py-2">
            <caption className="sr-only">
              {tipo === 'producto' ? 'Productos' : 'Sub-recetas'} y su estado
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col" className="hidden md:table-cell">
                  {tipo === 'producto' ? 'Categoría' : 'Rendimiento'}
                </th>
                {conPrecios && (
                  <>
                    <th scope="col" className="text-right">
                      Costo
                    </th>
                    {canales.map((c) => (
                      <th key={c.id} scope="col" className="text-right">
                        {c.nombre}
                      </th>
                    ))}
                    {margenRappi && (
                      <th scope="col" className="text-right">
                        Margen con comisión Rappi
                      </th>
                    )}
                  </>
                )}
                <th scope="col" className="w-36">
                  Estado
                </th>
                <th scope="col" className="w-12">
                  <span className="sr-only">Detalle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(inicio, inicio + 25).map((r) => (
                <tr key={r.id} className="group">
                  <td>
                    <Link
                      href={`${ruta}/${r.id}`}
                      className="inline-flex items-center gap-3 font-medium hover:underline"
                    >
                      <span className="hidden sm:grid size-8 shrink-0 place-items-center bg-crema-soft rounded-lg text-crema-strong">
                        <Coffee size={16} aria-hidden="true" />
                      </span>
                      {texto(tipo, r.nombre)}
                    </Link>
                  </td>
                  <td className="hidden md:table-cell text-ink-2">
                    {r.categoria ? texto(tipo, r.categoria) : (r.detalle ?? '—')}
                  </td>
                  {conPrecios && (
                    <>
                      <td className="text-right text-sm">
                        <PorTamano precios={r.precios ?? []} valor={(p) => p.costo} />
                      </td>
                      {canales.map((c) => (
                        <td key={c.id} className="text-right text-sm">
                          <PorTamano precios={r.precios ?? []} valor={(p) => p.canales[c.id] ?? null} />
                        </td>
                      ))}
                      {margenRappi && (
                        <td className="text-right text-sm">
                          <MargenPorTamano precios={r.precios ?? []} />
                        </td>
                      )}
                    </>
                  )}
                  <td>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${r.activo ? 'bg-ok-soft text-ok' : 'border border-line text-muted-foreground'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${r.activo ? 'bg-ok' : 'bg-line-strong'}`}
                      />
                      {r.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`${ruta}/${r.id}`}
                      aria-label={`Abrir ${r.nombre}`}
                      className="inline-flex p-2 rounded-md hover:bg-muted"
                    >
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtradas.length && (
          <div className="text-center py-14 px-5">
            <p className="font-semibold">No hay resultados</p>
            <p className="text-sm text-muted-foreground mt-2">
              Prueba otro nombre o cambia el filtro de estado.
            </p>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
          <p role="status" className="text-muted-foreground">
            {filtradas.length
              ? `${inicio + 1}–${Math.min(inicio + 25, filtradas.length)} de ${filtradas.length}`
              : '0 resultados'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {actual + 1} / {paginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={actual + 1 === paginas}
              onClick={() => setPagina(actual + 1)}
            >
              Siguiente
            </Button>
          </div>
        </footer>
      </section>
    </>
  );
}
