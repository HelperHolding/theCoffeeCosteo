'use client';
import { useState } from 'react';
import { BarChart3, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableroMexicoVista } from './tablero-mexico';
import { ConsumoNacionalVista } from './consumo-nacional';

type Vista = 'ventas' | 'consumo';
const VISTAS: { id: Vista; nombre: string; icono: typeof BarChart3 }[] = [
  { id: 'ventas', nombre: 'Ventas', icono: BarChart3 },
  { id: 'consumo', nombre: 'Consumo', icono: Package },
];

/** Tablero de México en dos vistas; la elegida viaja en la URL (?vista=consumo), como las secciones de cada sucursal. */
export function VistasMexico({ vistaInicial }: { vistaInicial: Vista }) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const elegir = (v: Vista) => {
    setVista(v);
    const p = new URLSearchParams(window.location.search);
    if (v === 'ventas') p.delete('vista');
    else p.set('vista', v);
    const s = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  };
  return (
    <div className="space-y-6">
      <nav aria-label="Vistas del Tablero de México" className="rounded-2xl bg-ink p-1.5 shadow-card">
        <ul className="grid auto-cols-fr grid-flow-col gap-1.5">
          {VISTAS.map((x) => {
            const Icono = x.icono;
            const activa = x.id === vista;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  aria-current={activa ? 'page' : undefined}
                  onClick={() => elegir(x.id)}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-display text-sm font-bold',
                    activa ? 'bg-crema text-ink shadow-card' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icono size={18} aria-hidden="true" />
                  {x.nombre}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {vista === 'ventas' ? <TableroMexicoVista /> : <ConsumoNacionalVista />}
    </div>
  );
}
