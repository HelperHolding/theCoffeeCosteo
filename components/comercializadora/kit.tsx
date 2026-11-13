'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { guardarKitManual, recalcularKit } from '@/app/(comercializadora)/comercializadora/acciones';
import type { KitFila } from '@/app/(comercializadora)/comercializadora/kit/page';

export function Kit({
  kits,
  nombres,
  editable,
}: {
  kits: KitFila[];
  nombres: Record<string, string>;
  editable: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; t: string }>>({});
  const [general, setGeneral] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  if (!kits.length)
    return <Vacio titulo="Todavía no hay kit calculado">Se calcula con la corrida diaria del mín/máx.</Vacio>;
  return (
    <div className="space-y-5">
      {editable ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await recalcularKit();
              setGeneral(
                'error' in r
                  ? { ok: false, t: r.error }
                  : { ok: true, t: `Recalculado: ${r.skus} artículos.` },
              );
              router.refresh();
            })
          }
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
        >
          {pendiente ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      ) : null}
      {general ? (
        <p
          role={general.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-sm ${general.ok ? 'placa' : 'bg-bad-soft text-bad'}`}
        >
          {general.t}
        </p>
      ) : null}
      <div className="placa overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="text-right">Promedio calculado</th>
              <th className="text-right">Aperturas en la muestra</th>
              <th className="text-right">Manual</th>
              <th className="text-right">Kit que se usa</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.sku}>
                <td>
                  <div className="font-medium">{nombres[k.sku] || k.sku}</div>
                  <div className="text-xs text-muted-foreground">{k.sku}</div>
                </td>
                <td className="text-right tabular-nums">{numero(Number(k.promedio_calc))}</td>
                <td className="text-right tabular-nums">{k.aperturas_muestra}</td>
                <td className="min-w-28 text-right">
                  {editable ? (
                    <input
                      // La llave incluye el valor: tras guardar, muestra el normalizado y no se vuelve a guardar.
                      key={`${k.sku}:${k.manual ?? ''}`}
                      aria-label={`Kit manual de ${k.sku}`}
                      inputMode="decimal"
                      defaultValue={k.manual ?? ''}
                      placeholder="calculado"
                      onBlur={(e) => {
                        if (e.target.value !== (k.manual == null ? '' : String(k.manual)))
                          iniciar(async () => {
                            const r = await guardarKitManual(k.sku, e.target.value);
                            setMsg((m) => ({
                              ...m,
                              [k.sku]: 'error' in r ? { ok: false, t: r.error } : { ok: true, t: 'Guardado' },
                            }));
                            if (!('error' in r)) router.refresh();
                          });
                      }}
                      className={`${claseCampo} h-9 text-right`}
                    />
                  ) : (
                    <span className="tabular-nums">{k.manual == null ? '—' : numero(Number(k.manual))}</span>
                  )}
                  {msg[k.sku] ? (
                    <div
                      role={msg[k.sku].ok ? 'status' : 'alert'}
                      className={`text-xs ${msg[k.sku].ok ? 'text-muted-foreground' : 'text-bad'}`}
                    >
                      {msg[k.sku].t}
                    </div>
                  ) : null}
                </td>
                <td className="text-right font-semibold tabular-nums">
                  {k.kit == null ? '—' : numero(Number(k.kit))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
