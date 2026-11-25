'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { normalizarNombre, type Proveedor } from '@/lib/sucursales-propias/empate';
import type { AccionesPagos } from './tipos';

/** Proveedor desconocido: el usuario elige el de Zoho; la equivalencia CLABE → proveedor se guarda (spec §4). */
export function ElegirProveedor({ id, acciones }: { id: number; acciones: AccionesPagos }) {
  const router = useRouter();
  const [lista, setLista] = useState<Proveedor[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const visibles = useMemo(() => {
    const q = normalizarNombre(filtro);
    return (lista ?? []).filter((p) => !q || normalizarNombre(p.nombre).includes(q)).slice(0, 30);
  }, [lista, filtro]);

  async function abrir() {
    try {
      const r = await acciones.leerProveedores();
      if ('error' in r) setError(r.error);
      else setLista(r.proveedores);
    } catch {
      setError('No se pudo cargar. Intenta de nuevo.');
    }
  }

  async function elegir(p: Proveedor) {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await acciones.asignarProveedor(id, p);
      if ('error' in r) setError(r.error);
      else router.refresh();
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (!lista)
    return (
      <div className="mt-2">
        <Button type="button" variant="outline" size="sm" onClick={abrir}>
          Elegir proveedor de Zoho
        </Button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    );
  return (
    <div className="mt-2 space-y-2">
      <input
        aria-label="Buscar proveedor"
        className="w-full rounded-md border border-line px-2 py-1 text-sm"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar proveedor…"
      />
      <ul className="max-h-48 overflow-auto text-sm">
        {visibles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={guardando}
              className="w-full px-2 py-1 text-left hover:bg-surface-2"
              onClick={() => elegir(p)}
            >
              {p.nombre}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
