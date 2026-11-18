'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { preseleccionar, type ResultadoPiezas } from '@/lib/comercializadora/piezas';
import { aplicarPiezasApertura } from '@/app/(comercializadora)/comercializadora/acciones';

const dos = (x: number) => numero(Math.round(x * 100) / 100);

/** "Sugerir piezas por apertura" (_planPzasApCalcular/_planPzasApAplicar): solo sugiere; nada se guarda sin Aplicar. */
export function PiezasApertura(p: {
  res: ResultadoPiezas;
  n: number;
  editable: boolean;
  aviso: string | null;
  degradado: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(p.editable ? p.res.filas.filter(preseleccionar).map((f) => f.sku) : []),
  );
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.res.filas.map((f) => [f.sku, String(f.sug)])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const marcar = (sku: string, si: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(sku);
      else n.delete(sku);
      return n;
    });
  const aplicar = () => {
    const cambios = p.res.filas
      .filter((f) => marcados.has(f.sku))
      .map((f) => ({ sku: f.sku, valor: valores[f.sku] ?? '', antes: f.actual }));
    if (!cambios.length) return setMsg({ ok: false, t: 'No hay filas marcadas' });
    if (!confirm(`Se guardarán las piezas por apertura de ${cambios.length} artículo(s). ¿Continuar?`))
      return;
    iniciar(async () => {
      const r = await aplicarPiezasApertura(cambios);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({
        ok: !r.fallas.length,
        t:
          `Guardadas: ${r.guardados}.` +
          (r.fallas.length ? ` No se guardaron ${r.fallas.length}: ${r.fallas.join(' · ')}` : ''),
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {p.aviso ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.aviso}
        </p>
      ) : null}
      {p.degradado ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <b>No se pudieron leer las aperturas o los pedidos de apertura</b>: las sugerencias pueden salir con
          una muestra distinta o incompleta. Revísalas con cuidado antes de aplicar.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Calculado con los <b>pedidos de apertura (kits)</b> de las {p.res.N} aperturas más recientes (de{' '}
        {p.res.totalAperturas} con kit registrado). <b>Sugerido</b> = lo que pidió en promedio cada apertura
        (las que no lo piden cuentan como 0), con tope de 3 veces la mediana de las que sí lo piden. El plan
        lo multiplica por las aperturas que vienen. <b>No se guarda nada hasta que pulses Aplicar</b>; los
        marcados son los que tienen al menos 3 aperturas y cambian más de 15% frente a lo capturado.
        {p.res.sinAtribuir ? (
          <span className="text-warn">
            {' '}
            {p.res.sinAtribuir} pedido(s) de kit sin sucursal vinculada no se pudieron atribuir a una
            apertura.
          </span>
        ) : null}
      </p>
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="n-aperturas">Aperturas recientes a considerar</label>
        <input
          id="n-aperturas"
          name="n"
          type="number"
          min={3}
          max={200}
          defaultValue={p.n}
          className={`${claseCampo} w-20`}
        />
        <button type="submit" className="font-semibold underline">
          Recalcular
        </button>
        {p.editable ? null : (
          <span className="text-warn">Tu acceso es de solo lectura: puedes ver las sugerencias.</span>
        )}
      </form>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? '' : 'text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {!p.res.filas.length ? (
        <Vacio titulo="No hay pedidos de apertura con artículos del catálogo en el historial" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th />
                <th>Artículo</th>
                <th className="text-right">Capturado hoy</th>
                <th className="text-right">Lo piden</th>
                <th className="text-right">Mediana (mín–máx)</th>
                <th className="text-right">Promedio</th>
                <th className="text-right">Sugerido</th>
              </tr>
            </thead>
            <tbody>
              {p.res.filas.map((f) => (
                <tr key={f.sku}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Aplicar ${f.sku}`}
                      checked={marcados.has(f.sku)}
                      disabled={!p.editable}
                      onChange={(e) => marcar(f.sku, e.target.checked)}
                    />
                  </td>
                  <td>
                    <b>{f.nombre}</b>
                    <span className="block font-mono text-xs text-muted-foreground">{f.sku}</span>
                  </td>
                  <td className={`text-right tabular-nums ${f.actual === 0 ? 'text-muted-foreground' : ''}`}>
                    {f.actual === 0 ? 'sin capturar' : dos(f.actual)}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.n} de {f.N}
                    {f.n < 3 ? <span className="block text-xs text-warn">pocos</span> : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {dos(f.mediana)}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({dos(f.min)}–{dos(f.max)})
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{dos(f.prom)}</td>
                  <td className="text-right">
                    <input
                      aria-label={`Sugerido de ${f.sku}`}
                      inputMode="decimal"
                      className={`${claseCampo} w-24 text-right`}
                      value={valores[f.sku]}
                      disabled={!p.editable}
                      onChange={(e) => setValores({ ...valores, [f.sku]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.editable && p.res.filas.length ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={aplicar}
          className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
        >
          {pendiente ? 'Guardando…' : 'Aplicar los marcados'}
        </button>
      ) : null}
    </div>
  );
}
