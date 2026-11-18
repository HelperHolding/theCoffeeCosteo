'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Tarjeta } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Corrida } from '@/lib/comercializadora/ocauto';
import { correrOcAuto } from '@/app/(comercializadora)/comercializadora/acciones';

export function OcAutomaticas({
  corridas,
  modo,
  editable,
}: {
  corridas: Corrida[];
  modo: 'simulacion' | 'real';
  editable: boolean;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = (m: 'simulacion' | 'real') =>
    iniciar(async () => {
      const r = await correrOcAuto(m);
      setMsg(
        'error' in r
          ? { ok: false, t: r.error }
          : { ok: true, t: `Listo: ${r.ocs} OC(s) en ${r.modo === 'real' ? 'modo real' : 'simulación'}.` },
      );
      router.refresh();
    });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Modo actual:{' '}
        <b>{modo === 'real' ? 'Real (crea borradores en Zoho)' : 'Simulación (no crea nada en Zoho)'}</b>
      </p>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr('simulacion')}
            className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
          >
            {pendiente ? 'Corriendo…' : 'Simular ahora'}
          </button>
          {modo === 'real' ? (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => confirm('Se crearán borradores reales en Zoho. ¿Continuar?') && correr('real')}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            >
              Correr ahora (real)
            </button>
          ) : null}
        </div>
      ) : null}
      {msg ? (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}
        >
          {msg.t}
        </p>
      ) : null}
      {corridas.map((c) => (
        <Tarjeta
          key={c.corrida_id}
          titulo={`${fechaCorta(c.fecha)} · ${c.origen === 'cron' ? 'Automática' : 'Manual'} · ${c.modo === 'real' ? 'Real' : 'Simulación'}`}
          descripcion={`${c.ocs.length} proveedor(es) · ${pesos(c.monto)}${c.errores ? ` · ${c.errores} con error` : ''}`}
          cuerpo={false}
        >
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>OC Zoho</th>
                  <th className="text-right">Artículos</th>
                  <th className="text-right">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {c.ocs.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => setAbierta(abierta === String(o.id) ? null : String(o.id))}
                  >
                    <td className="font-medium">
                      {o.vendor_name ?? o.vendor_id}
                      {o.lineas.some((l) => l.bajo_minimo) ? (
                        <>
                          {' '}
                          <Pill estado="pierde">No llega al mínimo</Pill>
                        </>
                      ) : null}
                      {abierta === String(o.id) ? (
                        <ul className="mt-2 space-y-1 text-xs font-normal">
                          {o.lineas.map((l) => (
                            <li key={l.sku}>
                              {l.nombre ?? l.sku} · {l.cantidad} pzas
                              {l.monto != null ? ` · ${pesos(l.monto)}` : ''}
                              {l.adelanto_cierre ? ' · adelanto por cierre' : ''}
                              {l.cierre_tarde ? ' · cierre: ya no llega' : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td>{o.po_number ?? o.zoho_po_id ?? '—'}</td>
                    <td className="text-right tabular-nums">{o.lineas.length}</td>
                    <td className="text-right tabular-nums">{pesos(o.monto)}</td>
                    <td>
                      {o.estado === 'error' ? (
                        <Pill estado="pierde">{o.error ?? 'Error'}</Pill>
                      ) : (
                        <Pill estado={o.estado === 'creada' ? 'ok' : 'neutro'}>
                          {o.estado === 'creada' ? 'Creada' : 'Simulada'}
                        </Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ))}
    </div>
  );
}
