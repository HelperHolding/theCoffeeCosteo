'use client';
import { useState } from 'react';
import { BarChart3, Calculator, Gauge, Milk, Package, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CiudadTablero } from '@/lib/sucursales/alcance';
import { TableroMexicoVista } from './tablero-mexico';
import { ConsumoNacionalVista } from './consumo-nacional';
import { ServicioNacionalVista } from './servicio-nacional';
import { CosteoCiudadVista } from './costeo-ciudad';
import { BarraSecciones, type Seccion } from './barra-secciones';
import { ProveedorCiudad } from './ciudad-tablero';
import { SucursalesEnlazables } from './enlace-sucursal';

export type Vista = 'ventas' | 'costeo' | 'consumo' | 'servicio';
const VISTAS: { id: Exclude<Vista, 'costeo'>; nombre: string; icono: typeof BarChart3 }[] = [
  { id: 'ventas', nombre: 'Ventas', icono: BarChart3 },
  { id: 'consumo', nombre: 'Consumo', icono: Package },
  // Rappi del portal: conectividad, reclamos y rechazos de todas las sucursales (docs/rappi-portal/08, fase 3).
  { id: 'servicio', nombre: 'Nivel de servicio', icono: Gauge },
];
/** Tablero de ciudad: las mismas secciones que una sucursal (docs/sucursales/19). */
const SECCIONES_CIUDAD: Seccion<Vista>[] = [
  { id: 'ventas', nombre: 'Ventas', detalle: 'Hoy, un día o un rango, y las semanas', icono: ReceiptText },
  { id: 'costeo', nombre: 'Costeo', detalle: 'Margen teórico por mes cerrado', icono: Calculator },
  { id: 'consumo', nombre: 'Consumo', detalle: 'Insumos que piden las recetas, por mes', icono: Milk },
  {
    id: 'servicio',
    nombre: 'Nivel de servicio',
    detalle: 'Rappi: conectividad, reclamos y menú',
    icono: Gauge,
  },
];

/**
 * Tablero de México en tres vistas; la elegida viaja en la URL (?vista=consumo|servicio), como las secciones de cada
 * sucursal. Con `ciudad` es el tablero de esa ciudad (docs/sucursales/19): las cuatro secciones de una sucursal (Costeo
 * solo con permiso), todas las sucursales de la ciudad y enlaces solo a las que el usuario tiene asignadas.
 */
export function VistasMexico({
  vistaInicial,
  ciudad = null,
  puedeCostear = false,
  asignadas = null,
}: {
  vistaInicial: Vista;
  ciudad?: CiudadTablero | null;
  puedeCostear?: boolean;
  asignadas?: number[] | null;
}) {
  const secciones = SECCIONES_CIUDAD.filter((s) => s.id !== 'costeo' || puedeCostear);
  const valida = (v: Vista) => (ciudad ? secciones.some((s) => s.id === v) : v !== 'costeo');
  const [vista, setVista] = useState<Vista>(valida(vistaInicial) ? vistaInicial : 'ventas');
  const elegir = (v: Vista) => {
    setVista(v);
    const p = new URLSearchParams(window.location.search);
    if (v === 'ventas') p.delete('vista');
    else p.set('vista', v);
    const s = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  };
  return (
    <ProveedorCiudad ciudad={ciudad}>
      <SucursalesEnlazables ids={ciudad ? asignadas : null}>
        <div className="space-y-6">
          {ciudad ? (
            <BarraSecciones
              etiqueta={`Secciones del Tablero ${ciudad.nombre}`}
              secciones={secciones}
              activa={vista}
              alElegir={elegir}
            />
          ) : (
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
                          activa
                            ? 'bg-crema text-ink shadow-card'
                            : 'text-white/75 hover:bg-white/10 hover:text-white',
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
          )}
          {vista === 'ventas' ? (
            <TableroMexicoVista ciudad={ciudad ?? undefined} />
          ) : vista === 'costeo' && ciudad ? (
            <CosteoCiudadVista ciudad={ciudad} />
          ) : vista === 'consumo' ? (
            <ConsumoNacionalVista />
          ) : (
            <ServicioNacionalVista />
          )}
        </div>
      </SucursalesEnlazables>
    </ProveedorCiudad>
  );
}
