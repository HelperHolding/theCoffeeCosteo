'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { filtrarMapeo, type FilaMapeo } from '@/lib/comercializadora/mapeo';
import { borrarMapeo, guardarMapeo } from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;

export function Mapeo(p: {
  filas: FilaMapeo[];
  catalogo: { sku: string; nombre: string | null; categoria: string | null }[];
  editable: boolean;
  aviso: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'' | 'mapeado' | 'pendiente'>('');
  const [categoria, setCategoria] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [editando, setEditando] = useState<{ nombre: string; sku: string; notas: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pendientes = p.filas.filter((f) => !f.mapeado).length;
  const categorias = [...new Set(p.catalogo.map((c) => c.categoria).filter((c): c is string => !!c))].sort();
  const lista = filtrarMapeo(p.filas, { texto, estado, categoria });

  const correr = (fn: () => Promise<{ error: string } | { ok: true }>, ok: string) =>
    iniciar(async () => {
      const r = await fn();
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: ok });
      if (!('error' in r)) setEditando(null);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Liga el nombre con el que llega cada producto en los pedidos con su SKU. Sin SKU, su venta no cuenta
        para el mín/máx ni para el plan.
      </p>
      {p.aviso ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.aviso} Se muestran solo los nombres ya mapeados.
        </p>
      ) : null}
      {pendientes ? (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <b>
            {pendientes} producto{pendientes === 1 ? '' : 's'} sin mapear
          </b>
        </p>
      ) : null}
      <p className="text-sm">
        {p.filas.length} productos · {p.filas.length - pendientes} mapeados · {pendientes} pendientes
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Buscar"
          placeholder="Buscar nombre o SKU"
          className={`${claseCampo} max-w-64`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select
          aria-label="Estado"
          className={`${claseCampo} max-w-44`}
          value={estado}
          onChange={(e) => setEstado(e.target.value as typeof estado)}
        >
          <option value="">Todos</option>
          <option value="mapeado">Mapeados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <select
          aria-label="Categoría"
          className={`${claseCampo} max-w-56`}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {msg ? (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}
        >
          {msg.t}
        </p>
      ) : null}
      {!lista.length ? (
        <Vacio titulo="Sin productos con ese filtro" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre en pedidos</th>
                <th>SKU</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((f) => (
                <tr key={f.nombre}>
                  <td>{f.nombre}</td>
                  <td>
                    {editando?.nombre === f.nombre ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`SKU para ${f.nombre}`}
                          className={`${claseCampo} max-w-64`}
                          value={editando.sku}
                          onChange={(e) => setEditando({ ...editando, sku: e.target.value })}
                        >
                          <option value="">Elige…</option>
                          {p.catalogo.map((c) => (
                            <option key={c.sku} value={c.sku}>
                              {c.sku} · {c.nombre}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Notas"
                          placeholder="Notas (opcional)"
                          className={`${claseCampo} max-w-48`}
                          value={editando.notas}
                          onChange={(e) => setEditando({ ...editando, notas: e.target.value })}
                        />
                        <button
                          type="button"
                          disabled={pendiente || !editando.sku}
                          className="text-sm font-semibold underline"
                          onClick={() =>
                            correr(
                              () => guardarMapeo(f.nombre, editando.sku, editando.notas),
                              `${f.nombre} → ${editando.sku}`,
                            )
                          }
                        >
                          {pendiente ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" className="text-sm underline" onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : f.sku ? (
                      <span>
                        <b>{f.sku}</b>
                        <span className="block text-xs text-muted-foreground">
                          {f.nombreSku ?? ''}
                          {f.categoria ? ` · ${f.categoria}` : ''}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Pill estado={f.mapeado ? 'ok' : 'bajo'}>{f.mapeado ? 'Mapeado' : 'Pendiente'}</Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {p.editable && editando?.nombre !== f.nombre ? (
                      <>
                        <button
                          type="button"
                          className="text-sm font-semibold underline"
                          onClick={() =>
                            setEditando({ nombre: f.nombre, sku: f.sku ?? '', notas: f.notas ?? '' })
                          }
                        >
                          {f.sku ? 'Cambiar' : 'Asignar SKU'}
                        </button>
                        {f.sku ? (
                          <button
                            type="button"
                            className="ml-3 text-sm text-bad underline"
                            onClick={() =>
                              confirm(`¿Quitar el SKU de "${f.nombre}"?`) &&
                              correr(() => borrarMapeo(f.nombre), `${f.nombre}: mapeo quitado`)
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button
              type="button"
              className="m-3 text-sm font-semibold underline"
              onClick={() => setVer(ver + POR_PAGINA)}
            >
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
