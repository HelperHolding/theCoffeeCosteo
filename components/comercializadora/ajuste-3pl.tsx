'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { cantidadConteo, pegarConteo, type FilaInventario } from '@/lib/comercializadora/inventario';
import { ajustar3pl } from '@/app/(comercializadora)/comercializadora/acciones';

const MOTIVOS = ['Conteo físico', 'Merma', 'Reposición', 'Corrección de error', 'Ingreso 3PL', 'Otro'];
type Linea = { sku: string; modo: 'diff' | 'set'; cantidad: string };

export function Ajuste3pl(p: {
  filas: FilaInventario[];
  saldos: Record<string, number | null>;
  autorizadores: string[];
  hoy: string;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState('');
  const [fecha, setFecha] = useState(p.hoy);
  const [motivo, setMotivo] = useState('Conteo físico');
  const [lineas, setLineas] = useState<Linea[]>([{ sku: '', modo: 'set', cantidad: '' }]);
  const [pegado, setPegado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const porSku = new Map(p.filas.map((f) => [f.sku, f]));
  const calc = (l: Linea) => {
    const actual = p.saldos[l.sku] ?? null;
    const c = l.modo === 'diff' ? Number(String(l.cantidad).replace(',', '.')) : cantidadConteo(l.cantidad);
    if (!l.sku || c == null || !Number.isFinite(c)) return null;
    const nuevo = l.modo === 'set' ? c : (actual ?? 0) + c;
    return { actual, nuevo, costo: porSku.get(l.sku)?.costo ?? null };
  };
  const impacto = lineas.reduce((s, l) => {
    const r = calc(l);
    return r && r.costo != null ? s + (r.nuevo - (r.actual ?? 0)) * r.costo : s;
  }, 0);

  const guardar = () =>
    iniciar(async () => {
      const lote = [];
      for (const l of lineas.filter((x) => x.sku || x.cantidad)) {
        if (!porSku.has(l.sku)) return setError(`SKU no encontrado: ${l.sku || '(vacío)'}`);
        const r = calc(l);
        if (!r) return setError(`${l.sku}: cantidad inválida (usa un número)`);
        lote.push({ sku: l.sku, actual: r.actual, nuevo: Math.round(r.nuevo * 1e4) / 1e4, costo: r.costo });
      }
      const res = await ajustar3pl({ realizado: '', autorizado, fecha_conteo: fecha, motivo, lineas: lote });
      if ('error' in res) return setError(res.error);
      p.alCerrar();
      router.refresh();
    });

  return (
    <Tarjeta
      titulo="Ajuste o conteo del 3PL"
      descripcion="El CEDIS se ajusta en Zoho Books; aquí solo el 3PL."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Autoriza
          <select className={claseCampo} value={autorizado} onChange={(e) => setAutorizado(e.target.value)}>
            <option value="">Elige…</option>
            {p.autorizadores.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Fecha del conteo
          <input
            type="date"
            max={p.hoy}
            className={claseCampo}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Motivo
          <select className={claseCampo} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {lineas.map((l, i) => {
          const r = calc(l);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                aria-label={`SKU ${i + 1}`}
                list="skus-3pl"
                className={`${claseCampo} max-w-48`}
                value={l.sku}
                onChange={(e) =>
                  setLineas(lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value.trim() } : x)))
                }
              />
              <select
                aria-label={`Modo ${i + 1}`}
                className={`${claseCampo} max-w-44`}
                value={l.modo}
                onChange={(e) =>
                  setLineas(
                    lineas.map((x, j) => (j === i ? { ...x, modo: e.target.value as Linea['modo'] } : x)),
                  )
                }
              >
                <option value="set">Fijar saldo final</option>
                <option value="diff">Sumar / restar</option>
              </select>
              <input
                aria-label={`Cantidad ${i + 1}`}
                inputMode="decimal"
                className={`${claseCampo} max-w-32`}
                value={l.cantidad}
                onChange={(e) =>
                  setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))
                }
              />
              <span className="text-muted-foreground">{r ? `${r.actual ?? 0} → ${r.nuevo}` : ''}</span>
            </div>
          );
        })}
        <datalist id="skus-3pl">
          {p.filas.map((f) => (
            <option key={f.sku} value={f.sku}>
              {f.nombre}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => setLineas([...lineas, { sku: '', modo: 'set', cantidad: '' }])}
          className="text-sm font-semibold underline"
        >
          Agregar línea
        </button>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Pegar desde Excel (SKU y cantidad)</summary>
        <textarea
          aria-label="Pegar conteo"
          className={`${claseCampo} mt-2 h-24`}
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
        />
        <button
          type="button"
          onClick={() =>
            setLineas(
              pegarConteo(pegado).map((x) => ({ sku: x.sku, modo: 'set', cantidad: String(x.cantidad) })),
            )
          }
          className="mt-2 text-sm font-semibold underline"
        >
          Usar lo pegado
        </button>
      </details>
      <p className="mt-3 text-sm">
        Impacto: <b>{pesos(impacto)}</b>
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={guardar}
          className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
        >
          {pendiente ? 'Guardando…' : 'Guardar ajuste'}
        </button>
        <button
          type="button"
          onClick={p.alCerrar}
          className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold"
        >
          Cerrar
        </button>
      </div>
    </Tarjeta>
  );
}
