'use client';
import { useState } from 'react';
import { Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { DOH_EST, filtrarDoh, type EstadoRiesgo, type FilaRiesgo } from '@/lib/comercializadora/doh';

const POR_PAGINA = 25;
type Conteos = Record<EstadoRiesgo, number>;
const ventaDia = (x: number) =>
  x >= 10 ? Math.round(x).toLocaleString('es-MX') : numero(Math.round(x * 10) / 10);

/** Pantalla DOH (renderComDoh + _dohHtml + _dohFilas): todos los artículos con la definición de riesgo de quiebre. */
export function Doh(p: {
  filas: FilaRiesgo[];
  conteos: Conteos;
  ventana: number;
  inicial: EstadoRiesgo | 'todos';
}) {
  const [estado, setEstado] = useState<EstadoRiesgo | 'todos'>(p.inicial);
  const [cat, setCat] = useState('todos');
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const cats = [...new Set(p.filas.map((r) => r.cat))].sort();
  const lista = filtrarDoh(p.filas, { estado, cat, q });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DOH_EST.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={estado === e.id}
            onClick={() => (setEstado(e.id), setVer(POR_PAGINA))}
            className={`placa rounded-xl p-3 text-left ${estado === e.id ? 'ring-2 ring-line-strong' : ''}`}
          >
            <span className="block font-display text-2xl font-bold tabular-nums">{p.conteos[e.id]}</span>
            <Pill estado={e.tono}>{e.texto}</Pill>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Pedir ya: el inventario no alcanza hasta que llegue una compra nueva y no hay una OC que lo cubra.
        Venta de los últimos {p.ventana} días de los pedidos de la plataforma.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Buscar"
          placeholder="Buscar SKU o nombre..."
          className={`${claseCampo} max-w-64`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Categoría"
          className={`${claseCampo} max-w-56`}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="todos">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado"
          className={`${claseCampo} max-w-48`}
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoRiesgo | 'todos')}
        >
          <option value="todos">Todos</option>
          {DOH_EST.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </div>
      {!lista.length ? (
        <Vacio titulo="Sin resultados" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Categoría</th>
                <th className="text-right">Disponible</th>
                <th className="text-right">Venta/día</th>
                <th className="text-right">Alcanza</th>
                <th className="text-right">Lead time</th>
                <th>OC en camino</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((r) => {
                const e = DOH_EST.find((x) => x.id === r.estado)!;
                return (
                  <tr key={r.sku}>
                    <td>
                      <b>{r.nombre}</b>
                      <span className="block font-mono text-xs text-muted-foreground">{r.sku}</span>
                    </td>
                    <td className="text-muted-foreground">{r.cat}</td>
                    <td className="text-right tabular-nums">
                      <b>{numero(Math.round(r.inv))}</b>
                      <span className="block text-xs text-muted-foreground">
                        <span className={r.neg ? 'text-bad' : ''}>físico {numero(Math.round(r.fisico))}</span>
                        {r.comp > 0 ? ` · reservado ${numero(Math.round(r.comp))}` : ''}
                        {r.yulius > 0 ? ` · 3PL ${numero(Math.round(r.yulius))}` : ''}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{r.cons > 0 ? ventaDia(r.cons) : '—'}</td>
                    <td
                      className={`text-right tabular-nums ${r.dias !== null && r.dias <= r.lt ? 'font-semibold text-bad' : ''}`}
                    >
                      {r.dias !== null ? `${Math.round(r.dias)} d` : '—'}
                    </td>
                    <td className="text-right tabular-nums">{r.cons > 0 ? `${r.lt} d` : '—'}</td>
                    <td>
                      {r.oc > 0 ? (
                        <>
                          <b>{numero(Math.round(r.oc))}</b> pzas
                          <span className="block text-xs text-muted-foreground">
                            {r.llega ? `llega ${fechaCorta(r.llega)}` : 'sin fecha'}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <Pill estado={e.tono}>{e.texto}</Pill>
                      {r.motivo ? (
                        <span className="mt-1 block text-xs text-muted-foreground">{r.motivo}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
