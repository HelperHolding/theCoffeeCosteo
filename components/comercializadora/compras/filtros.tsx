// components/comercializadora/compras/filtros.tsx
'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { hrefCompras } from '@/lib/comercializadora/compras/filtros';
import { ETIQUETA_CAT, type Cat, type FiltrosCompras as F, type TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const CLASE = 'rounded-[10px] border border-line bg-surface px-2 py-1.5 text-sm text-ink';

export function FiltrosCompras({ filtros, opciones }: { filtros: F; opciones: TableroCompras['opciones'] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const ir = (cambio: Partial<F>) => iniciar(() => router.push(hrefCompras(filtros, cambio)));
  const campo = (etiqueta: string, valor: string, cambio: (v: string) => Partial<F>, opcionesHtml: React.ReactNode) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {etiqueta}
      <select aria-label={etiqueta} className={CLASE} value={valor} disabled={pendiente} onChange={(e) => ir(cambio(e.target.value))}>{opcionesHtml}</select>
    </label>
  );
  return (
    <div className="mb-4 grid items-end gap-3 *:min-w-0 sm:grid-cols-2 lg:grid-cols-5">
      {campo('Periodo', filtros.periodo, (v) => ({ periodo: v }), opciones.periodos.map((p) => <option key={p.clave} value={p.clave}>{p.tipo === 'mes' ? `Mes · ${p.etiqueta}` : p.etiqueta}</option>))}
      {campo('Categoría', filtros.categoria ?? '', (v) => ({ categoria: (v || null) as Cat | null }), [<option key="" value="">Todas</option>, ...Object.entries(ETIQUETA_CAT).map(([k, e]) => <option key={k} value={k}>{e}</option>)])}
      {campo('Proveedor', filtros.proveedor ?? '', (v) => ({ proveedor: v || null }), [<option key="" value="">Todos</option>, ...opciones.proveedores.map((p) => <option key={p} value={p}>{p}</option>)])}
      {campo('Comprador', filtros.comprador ?? '', (v) => ({ comprador: v || null }), [<option key="" value="">Todos</option>, ...opciones.compradores.map((p) => <option key={p} value={p}>{p}</option>)])}
      <Link href="/comercializadora/compras" className="pb-2 text-sm font-semibold underline">Restablecer filtros</Link>
    </div>
  );
}
