'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { estadoMinimo, origenMinimo, type MinimoProveedor } from '@/lib/comercializadora/minimos';
import { guardarMinimo } from '@/app/(comercializadora)/comercializadora/acciones';

type Filtro = 'todos' | 'con' | 'sin' | 'pendientes';
const TONO: Record<string, Estado> = { ok: 'ok', pendiente: 'bajo', error: 'pierde' };
const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'],
  ['con', 'Con mínimo'],
  ['sin', 'Sin mínimo'],
  ['pendientes', 'Pendientes o con error'],
];

export function Minimos(p: {
  proveedores: (MinimoProveedor & { vendor_id: string })[];
  ocsBajo: Record<string, number>;
  minimoCampo: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [pendiente, iniciar] = useTransition();
  const texto = q.trim().toLowerCase();
  const lista = p.proveedores
    .filter((x) => {
      const m = Number(x.minimo_compra) || 0;
      const e = estadoMinimo(x).k;
      return (
        filtro === 'todos' ||
        (filtro === 'con' && m > 0) ||
        (filtro === 'sin' && m === 0) ||
        (filtro === 'pendientes' && e !== 'ok')
      );
    })
    .filter(
      (x) =>
        !texto ||
        String(x.nombre ?? x.vendor_id)
          .toLowerCase()
          .includes(texto),
    )
    .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));

  const guardar = (vendor: string, monto: string) =>
    iniciar(async () => {
      const r = await guardarMinimo(vendor, monto);
      setMsg((m) => ({
        ...m,
        [vendor]:
          'error' in r
            ? { ok: false, t: r.error }
            : {
                ok: true,
                t: r.enviado
                  ? 'Guardado y enviado a Zoho.'
                  : `Guardado; queda pendiente de enviar${r.aviso ? `: ${r.aviso}` : '.'}`,
              },
      }));
      if (!('error' in r)) router.refresh();
    });

  return (
    <div className="space-y-5">
      {p.minimoCampo === 'falta' ? (
        <p role="note" className="placa border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          En Zoho no existe el campo «Mínimo de compra (MXN)» en los proveedores: los mínimos se guardan aquí
          y quedan pendientes de enviar.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtro" className="flex gap-1">
          {FILTROS.map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filtro === k}
              onClick={() => setFiltro(k)}
              className={`h-10 rounded-[10px] px-3 text-sm font-semibold ${filtro === k ? 'bg-ink text-white' : 'border border-line-strong bg-surface'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Buscar proveedor"
          placeholder="Buscar proveedor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${claseCampo} max-w-xs`}
        />
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Sin proveedores con este filtro" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Mínimo (MXN)</th>
                <th>Origen</th>
                <th>Estado</th>
                <th className="text-right">OCs bajo el mínimo (30 días)</th>
                {p.editable ? <th>Editar</th> : null}
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => {
                const e = estadoMinimo(x);
                const m = msg[x.vendor_id];
                return (
                  <tr key={x.vendor_id}>
                    <td className="font-medium">{x.nombre ?? x.vendor_id}</td>
                    <td className="text-right tabular-nums">
                      {Number(x.minimo_compra) > 0 ? pesos(Number(x.minimo_compra)) : '—'}
                    </td>
                    <td>{origenMinimo(x)}</td>
                    <td>
                      <Pill estado={TONO[e.k]}>{e.txt}</Pill>
                    </td>
                    <td className="text-right tabular-nums">{p.ocsBajo[x.vendor_id] ?? 0}</td>
                    {p.editable ? (
                      <td className="min-w-64">
                        <div className="flex gap-2">
                          <input
                            aria-label={`Mínimo de ${x.nombre ?? x.vendor_id}`}
                            inputMode="decimal"
                            className={`${claseCampo} h-9 max-w-32`}
                            placeholder="0.00"
                            value={edicion[x.vendor_id] ?? ''}
                            onChange={(ev) => setEdicion({ ...edicion, [x.vendor_id]: ev.target.value })}
                          />
                          <button
                            type="button"
                            disabled={pendiente || !edicion[x.vendor_id]}
                            onClick={() => guardar(x.vendor_id, edicion[x.vendor_id])}
                            className="h-9 rounded-[10px] bg-ink px-3 text-sm font-semibold text-white"
                          >
                            Guardar
                          </button>
                          {e.k !== 'ok' ? (
                            <button
                              type="button"
                              disabled={pendiente}
                              onClick={() => guardar(x.vendor_id, String(Number(x.minimo_compra) || 0))}
                              className="h-9 text-sm font-semibold underline"
                            >
                              Reintentar
                            </button>
                          ) : null}
                        </div>
                        {m ? (
                          <p
                            role={m.ok ? 'status' : 'alert'}
                            className={`mt-1 text-xs ${m.ok ? 'text-muted-foreground' : 'text-bad'}`}
                          >
                            {m.t}
                          </p>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
