'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Pill, Tarjeta, Vacio, type Estado } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import {
  afectados,
  estadoCierre,
  MOTIVOS,
  ultimoDiaPedir,
  uPeriodo,
  validarCierre,
  type FormCierre,
} from '@/lib/comercializadora/cierres';
import { difDias, fechaCorta, masDias } from '@/lib/comercializadora/fechas';
import { cancelarCierre, guardarCierre } from '@/app/(comercializadora)/comercializadora/acciones';
import type { CierreFila } from '@/app/(comercializadora)/comercializadora/proveedores-sin-stock/page';

const TONO: Record<string, Estado> = {
  cancelado: 'neutro',
  terminado: 'neutro',
  encierre: 'neutro',
  tarde: 'pierde',
  ultimo: 'bajo',
  proximo: 'ok',
};
const vacio = (): FormCierre => ({
  vendor_id: '',
  vendor_name: '',
  ini: '',
  fin: '',
  motivo: 'vacaciones',
  todo: true,
  skus: [],
  notas: '',
});

export function Cierres(p: {
  cierres: CierreFila[];
  resumen: { id: number; u: string | null; ini: string; fin: string; monto_adelanto?: number }[];
  proveedores: { vendor_id: string; nombre: string | null }[];
  catalogo: { sku: string; nombre: string | null; zoho_vendor_id: string | null; estatus: string | null }[];
  leadTimes: Record<string, number>;
  hoy: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const filas = useMemo(
    () =>
      p.cierres.map((c) => {
        const arts = afectados(c, p.catalogo);
        const uLocal = arts.reduce<string | null>((m, a) => {
          const u = ultimoDiaPedir(c.ini, p.leadTimes[a.sku] ?? 0);
          return m == null || u < m ? u : m;
        }, null);
        const s = p.resumen.find((x) => x.id === c.id);
        const u = uPeriodo(c, s, uLocal);
        return { c, arts, u, estado: estadoCierre(c, p.hoy, u), monto: s?.monto_adelanto ?? 0 };
      }),
    [p],
  );
  const proximos = filas.filter((f) => ['proximo', 'ultimo', 'tarde'].includes(f.estado.k));
  const enCurso = filas.filter((f) => f.estado.k === 'encierre');
  const pasados = filas.filter(
    (f) => ['terminado', 'cancelado'].includes(f.estado.k) && f.c.fin.slice(0, 10) >= masDias(p.hoy, -90),
  );

  const guardar = () =>
    iniciar(async () => {
      if (!form) return;
      const v = validarCierre(form, p.hoy, !form.id);
      if (v) return setError(v);
      const r = await guardarCierre(form);
      if ('error' in r) return setError(r.error);
      setForm(null);
      setError(null);
      setAviso(
        r.recalculo
          ? 'Guardado. La simulación ya se recalculó.'
          : 'Guardado, pero no se pudo recalcular la simulación: se hará en la corrida diaria.',
      );
      router.refresh();
    });
  const cancelar = (id: number) =>
    iniciar(async () => {
      const r = await cancelarCierre(id);
      if ('error' in r) return setAviso(r.error);
      setAviso(
        r.recalculo
          ? 'Cancelado. La simulación ya se recalculó.'
          : 'Cancelado, pero no se pudo recalcular la simulación.',
      );
      router.refresh();
    });

  const tabla = (titulo: string, lista: typeof filas) => (
    <Tarjeta titulo={titulo} cuerpo={false}>
      {lista.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Ninguno.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Fechas</th>
                <th>Motivo</th>
                <th>Alcance</th>
                <th>Último día para pedir</th>
                <th className="text-right">Monto adelantado</th>
                <th>Estado</th>
                {p.editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {lista.map(({ c, arts, u, estado, monto }) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.vendor_name}</div>
                    {c.notas ? <div className="text-xs text-muted-foreground">{c.notas}</div> : null}
                  </td>
                  <td>
                    {fechaCorta(c.ini)} al {fechaCorta(c.fin)}
                  </td>
                  <td>{MOTIVOS.find(([k]) => k === c.motivo)?.[1] ?? c.motivo}</td>
                  <td>
                    {c.skus?.length ? `${arts.length} artículo(s)` : `Todo el proveedor (${arts.length})`}
                  </td>
                  <td>
                    {u ? `${fechaCorta(u)}${u >= p.hoy ? ` · faltan ${difDias(p.hoy, u)} días` : ''}` : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto)}
                  </td>
                  <td>
                    <Pill estado={TONO[estado.k]}>{estado.txt}</Pill>
                  </td>
                  {p.editable ? (
                    <td className="whitespace-nowrap text-right">
                      {!c.cancelado && estado.k !== 'terminado' ? (
                        <>
                          <button
                            type="button"
                            className="text-sm font-semibold underline"
                            onClick={() =>
                              setForm({
                                id: c.id,
                                vendor_id: c.vendor_id,
                                vendor_name: c.vendor_name,
                                ini: c.ini.slice(0, 10),
                                fin: c.fin.slice(0, 10),
                                motivo: c.motivo,
                                todo: !c.skus?.length,
                                skus: c.skus ?? [],
                                notas: c.notas ?? '',
                              })
                            }
                          >
                            Editar
                          </button>{' '}
                          <button
                            type="button"
                            className="text-sm font-semibold text-bad underline"
                            disabled={pendiente}
                            onClick={() => cancelar(c.id)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );

  const articulosDelProveedor = form
    ? p.catalogo.filter((a) => a.zoho_vendor_id === form.vendor_id && a.estatus !== 'Inactivo')
    : [];
  return (
    <div className="space-y-5">
      {aviso ? (
        <p role="status" className="placa px-4 py-3 text-sm">
          {aviso}
        </p>
      ) : null}
      {p.editable && !form ? (
        <button
          type="button"
          onClick={() => {
            setForm(vacio());
            setError(null);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
        >
          <Plus size={15} aria-hidden="true" /> Registrar periodo sin stock
        </button>
      ) : null}
      {form ? (
        <Tarjeta titulo={form.id ? 'Editar periodo' : 'Nuevo periodo sin stock'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Proveedor
              <select
                className={claseCampo}
                value={form.vendor_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    vendor_id: e.target.value,
                    vendor_name: p.proveedores.find((x) => x.vendor_id === e.target.value)?.nombre ?? '',
                    skus: [],
                  })
                }
              >
                <option value="">Elige…</option>
                {p.proveedores.map((x) => (
                  <option key={x.vendor_id} value={x.vendor_id}>
                    {x.nombre ?? x.vendor_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Motivo
              <select
                className={claseCampo}
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              >
                {MOTIVOS.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Desde
              <input
                type="date"
                className={claseCampo}
                value={form.ini}
                onChange={(e) => setForm({ ...form, ini: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Hasta
              <input
                type="date"
                className={claseCampo}
                value={form.fin}
                onChange={(e) => setForm({ ...form, fin: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.todo}
                onChange={(e) => setForm({ ...form, todo: e.target.checked })}
              />{' '}
              Todo el proveedor
            </label>
            {!form.todo ? (
              <fieldset className="max-h-48 overflow-y-auto rounded-[10px] border border-line p-3 text-sm sm:col-span-2">
                <legend className="px-1">Artículos</legend>
                {articulosDelProveedor.map((a) => (
                  <label key={a.sku} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.skus.includes(a.sku)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          skus: e.target.checked
                            ? [...form.skus, a.sku]
                            : form.skus.filter((s) => s !== a.sku),
                        })
                      }
                    />{' '}
                    {a.nombre ?? a.sku} <span className="text-muted-foreground">{a.sku}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="text-sm sm:col-span-2">
              Notas
              <textarea
                maxLength={500}
                className={claseCampo}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </label>
          </div>
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
      {filas.length === 0 ? (
        <Vacio titulo="Sin periodos registrados">
          Registra cuando un proveedor no vaya a entregar (vacaciones, inventario, agotado).
        </Vacio>
      ) : (
        <>
          {tabla('Próximos', proximos)}
          {tabla('En curso', enCurso)}
          {tabla('Pasados (90 días)', pasados)}
        </>
      )}
    </div>
  );
}
