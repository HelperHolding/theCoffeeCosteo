'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { pesos } from '@/lib/comercializadora/formato';
import type { Factura } from '@/lib/sucursales-propias/empate';
import type { AccionesPagos, FilaVista } from './tipos';

/** No cuadra: el usuario marca qué facturas cubre la transferencia y cuánto abona a cada una (spec §4). */
export function EditarAsignacion({ fila, acciones }: { fila: FilaVista; acciones: AccionesPagos }) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [montos, setMontos] = useState<Record<string, string>>(
    Object.fromEntries(fila.asignaciones.map((a) => [a.billId, a.monto.toFixed(2)])),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suma = Object.values(montos).reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;

  async function abrir() {
    try {
      const r = await acciones.leerFacturasProveedor(fila.id);
      if ('error' in r) setError(r.error);
      else setFacturas(r.facturas);
    } catch {
      setError('No se pudo cargar. Intenta de nuevo.');
    }
  }

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const asignaciones = Object.entries(montos)
        .filter(([, v]) => Number(v) > 0)
        .map(([billId, v]) => ({ billId, monto: Number(v) }));
      const r = await acciones.guardarAsignaciones(fila.id, asignaciones);
      if ('error' in r) setError(r.error);
      else router.refresh();
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (!facturas)
    return (
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" onClick={abrir}>
          Ajustar facturas
        </Button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    );
  return (
    <div className="mt-2 space-y-2 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Factura</th>
              <th>Sucursal</th>
              <th>Saldo</th>
              <th>Abono</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.billId}>
                <td>{f.numero}</td>
                <td>{f.ubicacion}</td>
                <td className="tabular-nums">{pesos(f.saldo)}</td>
                <td>
                  <input
                    aria-label={`Abono a ${f.numero}`}
                    inputMode="decimal"
                    className="w-28 rounded-md border border-line px-2 py-1 text-right"
                    value={montos[f.billId] ?? ''}
                    onChange={(e) => setMontos((m) => ({ ...m, [f.billId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={Math.round(suma * 100) === Math.round(fila.monto * 100) ? 'text-ok' : 'text-warn'}>
        Asignado {pesos(suma)} de {pesos(fila.monto)}
      </p>
      <Button type="button" disabled={guardando} onClick={guardar}>
        Guardar reparto
      </Button>
      {error ? <p className="text-bad">{error}</p> : null}
    </div>
  );
}
