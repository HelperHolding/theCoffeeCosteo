'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claseCampo } from '@/lib/crm/formato';
import { KPI_AB_CAMPOS, KPI_AB_DEF } from '@/lib/comercializadora/indicadores';
import { guardarMetasKpi } from '@/app/(comercializadora)/comercializadora/acciones';

const aTexto = (o: Record<string, number>) =>
  Object.fromEntries(KPI_AB_CAMPOS.map(([k]) => [k, String(o[k])]));

/** Metas de los indicadores (_kpiAbMetasAbrir/_kpiAbMetasGuardar): se guardan para todo el equipo, con historial. */
export function MetasKpi(p: { metas: Record<string, number>; version: number; editable: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(aTexto(p.metas));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = () =>
    iniciar(async () => {
      const r = await guardarMetasKpi(vals, p.version);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({
        ok: true,
        t: r.cambios
          ? `Metas guardadas (${r.cambios} cambio${r.cambios === 1 ? '' : 's'})`
          : 'Las metas ya estaban así',
      });
      router.refresh();
    });
  return (
    <details className="placa rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {p.editable ? 'Editar metas' : 'Ver metas'}
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Define contra qué se mide cada indicador. Se guardan para todo el equipo y cada cambio queda en el
        historial de la configuración del plan.
        {p.editable ? '' : ' Tu acceso es de solo lectura.'}
      </p>
      <div className="mt-3 divide-y divide-line">
        {KPI_AB_CAMPOS.map(([k, etiqueta, unidad, ayuda, min, max, entero]) => (
          <label key={k} className="grid grid-cols-[1fr_6rem_3rem] items-center gap-2 py-2">
            <span>
              <b className="text-sm">{etiqueta}</b>
              <span className="block text-xs text-muted-foreground">{ayuda}</span>
            </span>
            <input
              aria-label={etiqueta}
              inputMode="decimal"
              className={`${claseCampo} text-right`}
              value={vals[k]}
              min={min}
              max={max}
              step={entero ? 1 : 'any'}
              disabled={!p.editable}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">{unidad}</span>
          </label>
        ))}
      </div>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? '' : 'text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {p.editable ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            disabled={pendiente}
            onClick={guardar}
          >
            {pendiente ? 'Guardando…' : 'Guardar metas'}
          </button>
          <button type="button" className="text-sm underline" onClick={() => setVals(aTexto(KPI_AB_DEF))}>
            Restablecer valores sugeridos
          </button>
        </div>
      ) : null}
    </details>
  );
}
