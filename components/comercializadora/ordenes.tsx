'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Pill, Tarjeta, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { textoDestino, validarOc, type FormOc, type OcGrupo } from '@/lib/comercializadora/ordenes';
import { eliminarOc, guardarOc, recibirOc } from '@/app/(comercializadora)/comercializadora/acciones';

const TONO: Record<OcGrupo['estado'], Estado> = { emitida: 'neutro', parcial: 'bajo', recibida: 'ok' };
const NOMBRE: Record<OcGrupo['estado'], string> = {
  emitida: 'Emitida',
  parcial: 'Parcial',
  recibida: 'Recibida',
};
const POR_PAGINA = 25;

export function Ordenes(p: {
  grupos: OcGrupo[];
  estado?: string;
  mes?: string;
  proveedores: string[];
  catalogo: { sku: string; nombre: string | null }[];
  ultimoSync: string | null;
  editable: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [recibido, setRecibido] = useState<Record<string, number>>({});
  const [form, setForm] = useState<(FormOc & { anterior?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ver, setVer] = useState(POR_PAGINA);
  const [pendiente, iniciar] = useTransition();
  const minutos = p.ultimoSync ? Math.round((Date.now() - new Date(p.ultimoSync).getTime()) / 60000) : null;

  const correr = (fn: () => Promise<{ error: string } | { ok: true }>, alTerminar?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if ('error' in r) return setError(r.error);
      setError(null);
      alTerminar?.();
      router.refresh();
    });
  const nueva = (): FormOc => ({
    folio: '',
    proveedor: '',
    fecha: p.hoy,
    fecha_arribo: '',
    destino: 'CEDIS',
    monto: 0,
    lineas: [{ sku: '', cantidad: 0 }],
  });

  return (
    <div className="space-y-5">
      <p
        className={`text-sm ${minutos != null && minutos > 120 ? 'text-warn' : 'text-muted-foreground'}`}
        role="status"
      >
        {minutos == null
          ? 'Todavía no hay sincronización con Zoho.'
          : `Última sincronización con Zoho: hace ${minutos} min${minutos > 120 ? ' (revisa la conexión)' : ''}.`}
      </p>
      <form action="/comercializadora/ordenes" className="flex flex-wrap items-center gap-2">
        <select
          name="estado"
          defaultValue={p.estado ?? ''}
          aria-label="Estado"
          className={`${claseCampo} max-w-48`}
        >
          <option value="">Todos los estados</option>
          <option value="emitida">Emitida</option>
          <option value="parcial">Parcial</option>
          <option value="recibida">Recibida</option>
        </select>
        <input
          type="month"
          name="mes"
          defaultValue={p.mes ?? ''}
          aria-label="Mes"
          className={`${claseCampo} max-w-48`}
        />
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          Filtrar
        </button>
        {p.editable && !form ? (
          <button
            type="button"
            onClick={() => {
              setForm(nueva());
              setError(null);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
          >
            <Plus size={15} aria-hidden="true" /> Nueva OC
          </button>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}

      {form ? (
        <Tarjeta titulo={form.anterior ? `Editar ${form.anterior}` : 'Nueva orden de compra'}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Folio
              <input
                className={claseCampo}
                value={form.folio}
                onChange={(e) => setForm({ ...form, folio: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Proveedor
              <select
                className={claseCampo}
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
              >
                <option value="">Elige…</option>
                {p.proveedores.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Destino
              <select
                className={claseCampo}
                value={form.destino}
                onChange={(e) => setForm({ ...form, destino: e.target.value })}
              >
                <option value="CEDIS">CEDIS</option>
                <option value="Yulius">3PL</option>
              </select>
            </label>
            <label className="text-sm">
              Fecha
              <input
                type="date"
                className={claseCampo}
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Fecha de arribo
              <input
                type="date"
                className={claseCampo}
                value={form.fecha_arribo}
                onChange={(e) => setForm({ ...form, fecha_arribo: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Monto total (MXN)
              <input
                type="number"
                min="0"
                step="0.01"
                className={claseCampo}
                value={form.monto || ''}
                onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
              />
            </label>
          </div>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-semibold">Artículos</legend>
            {form.lineas.map((l, i) => (
              <div key={i} className="flex gap-2">
                <select
                  aria-label={`Artículo ${i + 1}`}
                  className={claseCampo}
                  value={l.sku}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lineas: form.lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)),
                    })
                  }
                >
                  <option value="">Elige…</option>
                  {p.catalogo.map((a) => (
                    <option key={a.sku} value={a.sku}>
                      {a.nombre ?? a.sku} · {a.sku}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Cantidad ${i + 1}`}
                  type="number"
                  min="0"
                  className={`${claseCampo} max-w-32`}
                  value={l.cantidad || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lineas: form.lineas.map((x, j) =>
                        j === i ? { ...x, cantidad: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, lineas: [...form.lineas, { sku: '', cantidad: 0 }] })}
              className="text-sm font-semibold underline"
            >
              Agregar artículo
            </button>
          </fieldset>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                const v = validarOc(form);
                if (v) return setError(v);
                const { anterior, ...datos } = form;
                correr(
                  () => guardarOc(datos, anterior),
                  () => setForm(null),
                );
              }}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            >
              {pendiente ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold"
            >
              Cerrar
            </button>
          </div>
        </Tarjeta>
      ) : null}

      {p.grupos.length === 0 ? (
        <Vacio titulo="Sin órdenes con estos filtros" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Folio</th>
                <th>Proveedor</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Uds.</th>
                <th className="text-right">Monto</th>
                <th>Destino</th>
                <th>F. Arribo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {p.grupos.slice(0, ver).map((g) => (
                <tr key={g.folio} className="align-top">
                  <td>{g.fecha ? fechaCorta(g.fecha) : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="font-semibold underline"
                      aria-expanded={abierto === g.folio}
                      onClick={() => {
                        setAbierto(abierto === g.folio ? null : g.folio);
                        setRecibido({});
                      }}
                    >
                      {g.folio}
                    </button>
                    {abierto === g.folio ? (
                      <div className="mt-2 space-y-2 text-xs">
                        {g.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-2">
                            <span className="min-w-24">{it.sku}</span>
                            <span>{it.cantidad} pedidas ·</span>
                            {p.editable ? (
                              <input
                                aria-label={`Recibido ${it.sku}`}
                                type="number"
                                min="0"
                                className={`${claseCampo} h-8 max-w-24`}
                                defaultValue={it.cantidad_recibida ?? 0}
                                onChange={(e) =>
                                  setRecibido({ ...recibido, [it.id]: Number(e.target.value) })
                                }
                              />
                            ) : (
                              <span>{it.cantidad_recibida ?? 0} recibidas</span>
                            )}
                          </div>
                        ))}
                        {p.editable ? (
                          <div className="flex gap-3">
                            <button
                              type="button"
                              disabled={pendiente || !Object.keys(recibido).length}
                              onClick={() =>
                                correr(
                                  () => recibirOc(g.folio, recibido),
                                  () => setRecibido({}),
                                )
                              }
                              className="font-semibold underline"
                            >
                              Guardar recepción
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setForm({
                                  anterior: g.folio,
                                  folio: g.folio,
                                  proveedor: g.proveedor ?? '',
                                  fecha: g.fecha ?? p.hoy,
                                  fecha_arribo: g.fecha_arribo ?? '',
                                  destino: g.destino ?? 'CEDIS',
                                  monto: g.monto,
                                  lineas: g.items.map((x) => ({
                                    sku: x.sku,
                                    cantidad: Number(x.cantidad) || 0,
                                  })),
                                })
                              }
                              className="font-semibold underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={pendiente}
                              onClick={() =>
                                confirm(`¿Eliminar la OC ${g.folio}?`) && correr(() => eliminarOc(g.folio))
                              }
                              className="font-semibold text-bad underline"
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td>{g.proveedor ?? '—'}</td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{g.uds}</td>
                  <td className="text-right tabular-nums">{pesos(g.monto)}</td>
                  <td>{textoDestino(g.destino)}</td>
                  <td>{g.fecha_arribo ? fechaCorta(g.fecha_arribo) : '—'}</td>
                  <td>
                    <Pill estado={TONO[g.estado]}>{NOMBRE[g.estado]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.grupos.length > ver ? (
        <button
          type="button"
          onClick={() => setVer(ver + POR_PAGINA)}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
        >
          Ver más
        </button>
      ) : null}
    </div>
  );
}
