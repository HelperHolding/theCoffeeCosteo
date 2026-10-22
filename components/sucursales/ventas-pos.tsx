'use client';
import { useState } from 'react';
import type { SucursalInfo } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Pestanas } from '@/components/portal/pestanas';
import { EnVivo } from './en-vivo';
import { Pedidos } from './pedidos';
import { Productos } from './productos';
import { Tendencias } from './tendencias';
import { Rappi } from './rappi';

export const PESTANAS = [
  { id: 'vivo', nombre: 'En vivo' },
  { id: 'tendencias', nombre: 'Tendencias' },
  { id: 'productos', nombre: 'Productos' },
  { id: 'pedidos', nombre: 'Pedidos' },
  { id: 'rappi', nombre: 'Rappi' },
] as const;

/**
 * Ventas POS de una sucursal. El filtro de origen es global: lo comparten KPIs, gráficas y tablas.
 * Solo se monta la pestaña activa, y cada lectura va con su clave (sucursal + filtros), así que cambiar
 * de sucursal, origen o pestaña nunca deja datos de otra combinación en pantalla.
 */
export function VentasPos({
  sucursal,
  tabInicial,
  origenInicial,
}: {
  sucursal: SucursalInfo;
  tabInicial: string;
  origenInicial: FiltroOrigen;
}) {
  const [tab, setTab] = useState<string>(PESTANAS.some((p) => p.id === tabInicial) ? tabInicial : 'vivo');
  const [origen, setOrigen] = useState<FiltroOrigen>(origenInicial);
  const elegirOrigen = (o: FiltroOrigen) => {
    setOrigen(o);
    const params = new URLSearchParams(window.location.search);
    if (o === 'todos') params.delete('origen');
    else params.set('origen', o);
    const s = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  };
  const clave = `${sucursal.companyId}-${origen}`;
  const contenido = (id: string) => {
    if (id !== tab) return null;
    if (id === 'vivo') return <EnVivo key={clave} companyId={sucursal.companyId} origen={origen} />;
    if (id === 'tendencias') return <Tendencias key={clave} companyId={sucursal.companyId} origen={origen} />;
    if (id === 'productos')
      return <Productos key={clave} companyId={sucursal.companyId} origen={origen} zona={sucursal.zona} />;
    if (id === 'rappi') return <Rappi companyId={sucursal.companyId} />;
    return <Pedidos key={clave} companyId={sucursal.companyId} origen={origen} zona={sucursal.zona} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-ink px-2.5 py-1 font-semibold text-white">
            POS · API The Coffee · {sucursal.moneda}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-2">
            Hora local · {sucursal.zona}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-2" title={sucursal.alcance}>
            Sin Rappi (ver apartado Rappi)
          </span>
        </div>
        <fieldset className={`flex items-center gap-2 ${tab === 'rappi' ? 'hidden' : ''}`}>
          <legend className="sr-only">Origen de los pedidos</legend>
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            Origen
          </span>
          <div className="flex rounded-[10px] border border-line-strong bg-paper p-0.5">
            {filtrosOrigen.map((o) => (
              <label
                key={o}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${
                  origen === o ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="origen"
                  value={o}
                  checked={origen === o}
                  onChange={() => elegirOrigen(o)}
                  className="sr-only"
                />
                {etiquetaOrigen[o]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="placa px-3 py-2 text-xs text-muted-foreground">{sucursal.alcance}</p>
      <Pestanas
        inicial={tab}
        alCambiar={setTab}
        pestanas={PESTANAS.map((p) => ({ id: p.id, nombre: p.nombre, contenido: contenido(p.id) }))}
      />
    </div>
  );
}
