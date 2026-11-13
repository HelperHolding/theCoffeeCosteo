'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Tarjeta, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { textoDestino } from '@/lib/comercializadora/ordenes';
import { cantidadConteo } from '@/lib/comercializadora/inventario';
import {
  detalleTraspaso,
  folioTraspaso,
  LUGARES,
  validarTraspaso,
  type GrupoTraspaso,
} from '@/lib/comercializadora/traspasos';
import {
  crearTraspaso,
  eliminarTraspaso,
  ingresarTraspaso,
} from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;
type Linea = { sku: string; cantidad: string };

export function Traspasos(p: {
  grupos: GrupoTraspaso[];
  catalogo: { sku: string; nombre: string | null }[];
  editable: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | 'ordenado' | 'ingresado'>('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [nuevo, setNuevo] = useState(false);
  const [folio, setFolio] = useState('');
  const [fecha, setFecha] = useState(p.hoy);
  const [origen, setOrigen] = useState<string>('CEDIS');
  const [destino, setDestino] = useState<string>('Yulius');
  const [lineas, setLineas] = useState<Linea[]>([{ sku: '', cantidad: '' }]);
  const [ingreso, setIngreso] = useState<{ folio: string; valores: Record<string, string> } | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const skus = new Set(p.catalogo.map((c) => c.sku));
  const lista = p.grupos.filter((g) => !filtro || g.estado === filtro);

  const abrirNuevo = () => {
    setFolio(folioTraspaso(p.hoy));
    setFecha(p.hoy);
    setLineas([{ sku: '', cantidad: '' }]);
    setMsg(null);
    setNuevo(true);
  };
  const guardar = () => {
    const f = {
      folio,
      fecha,
      origen,
      destino,
      // Igual que al ingresar: "1,500" son 1500 piezas; vacío = 0 (se descarta); texto = NaN (error de validación).
      lineas: lineas.map((l) => ({
        sku: l.sku,
        cantidad: l.cantidad.trim() === '' ? 0 : (cantidadConteo(l.cantidad) ?? NaN),
      })),
    };
    const error = validarTraspaso(f, skus);
    if (error) return setMsg({ ok: false, t: error });
    iniciar(async () => {
      const r = await crearTraspaso(f);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setNuevo(false);
      setMsg({ ok: true, t: `Traspaso ${f.folio.trim()} guardado.` });
      router.refresh();
    });
  };
  const guardarIngreso = (g: GrupoTraspaso) =>
    iniciar(async () => {
      if (!ingreso) return;
      const r = await ingresarTraspaso(g.folio, ingreso.valores);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setIngreso(null);
      setMsg({
        ok: true,
        t:
          g.destino === 'Yulius'
            ? `Ingreso de ${g.folio} guardado: se sumó al 3PL.`
            : `Ingreso de ${g.folio} guardado. Regístralo en Zoho para que se refleje en el CEDIS.`,
      });
      router.refresh();
    });
  const eliminar = (g: GrupoTraspaso) => {
    if (!confirm(`¿Eliminar el traspaso ${g.folio}?`)) return;
    iniciar(async () => {
      const r = await eliminarTraspaso(g.folio);
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: `Traspaso ${g.folio} eliminado.` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {p.editable ? (
          <button
            type="button"
            onClick={abrirNuevo}
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
          >
            Nuevo traspaso
          </button>
        ) : null}
        <select
          aria-label="Estado"
          className={`${claseCampo} max-w-44`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
        >
          <option value="">Todos</option>
          <option value="ordenado">Ordenados</option>
          <option value="ingresado">Ingresados</option>
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

      {nuevo ? (
        <Tarjeta titulo="Nuevo traspaso" descripcion="Entre el CEDIS y el 3PL. El 3PL se suma al ingresarlo.">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm">
              Referencia
              <input className={claseCampo} value={folio} onChange={(e) => setFolio(e.target.value)} />
            </label>
            <label className="text-sm">
              Fecha
              <input
                type="date"
                className={claseCampo}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Origen
              <select className={claseCampo} value={origen} onChange={(e) => setOrigen(e.target.value)}>
                {LUGARES.map((l) => (
                  <option key={l} value={l}>
                    {textoDestino(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Destino
              <select className={claseCampo} value={destino} onChange={(e) => setDestino(e.target.value)}>
                {LUGARES.map((l) => (
                  <option key={l} value={l}>
                    {textoDestino(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  aria-label={`SKU ${i + 1}`}
                  list="skus-traspaso"
                  className={`${claseCampo} max-w-48`}
                  value={l.sku}
                  onChange={(e) =>
                    setLineas(lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
                  }
                />
                <input
                  aria-label={`Cantidad ${i + 1}`}
                  inputMode="decimal"
                  className={`${claseCampo} max-w-32`}
                  value={l.cantidad}
                  onChange={(e) =>
                    setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <datalist id="skus-traspaso">
              {p.catalogo.map((c) => (
                <option key={c.sku} value={c.sku}>
                  {c.nombre}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              className="text-sm font-semibold underline"
              onClick={() => setLineas([...lineas, { sku: '', cantidad: '' }])}
            >
              Agregar línea
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={guardar}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            >
              {pendiente ? 'Guardando…' : 'Guardar traspaso'}
            </button>
            <button
              type="button"
              onClick={() => setNuevo(false)}
              className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold"
            >
              Cerrar
            </button>
          </div>
        </Tarjeta>
      ) : null}

      {!lista.length ? (
        <Vacio titulo="Sin traspasos">Los traspasos entre el CEDIS y el 3PL aparecen aquí.</Vacio>
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Piezas</th>
                <th>Ruta</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((g) => (
                <tr key={g.folio}>
                  <td>{g.fecha ? fechaCorta(g.fecha) : '—'}</td>
                  <td>
                    <div className="font-medium">{g.folio}</div>
                    {detalle === g.folio ? (
                      <table className="mt-1 text-xs">
                        <tbody>
                          {g.items.map((i) => {
                            const d = detalleTraspaso(i);
                            return (
                              <tr key={i.id}>
                                <td className="pr-3">{i.sku}</td>
                                <td className="pr-3 text-right">ordenado {numero(d.ord)}</td>
                                <td className="pr-3 text-right">
                                  ingresado {d.ing == null ? '—' : numero(d.ing)}
                                </td>
                                <td
                                  className={
                                    d.dif == null ? '' : d.dif < 0 ? 'text-bad' : d.dif > 0 ? 'text-ok' : ''
                                  }
                                >
                                  {d.dif == null ? '—' : `${d.dif > 0 ? '+' : ''}${numero(d.dif)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : null}
                    {ingreso?.folio === g.folio ? (
                      <div className="mt-2 space-y-1">
                        {g.items.map((i) => (
                          <div key={i.id} className="flex items-center gap-2 text-xs">
                            <span className="w-24">{i.sku}</span>
                            <span className="text-muted-foreground">
                              ordenado {numero(detalleTraspaso(i).ord)}
                            </span>
                            <input
                              aria-label={`Recibido de ${i.sku}`}
                              inputMode="decimal"
                              className={`${claseCampo} h-8 max-w-24 text-right`}
                              value={ingreso.valores[i.id] ?? ''}
                              onChange={(e) =>
                                setIngreso({
                                  ...ingreso,
                                  valores: { ...ingreso.valores, [i.id]: e.target.value },
                                })
                              }
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => guardarIngreso(g)}
                            className="text-sm font-semibold underline"
                          >
                            {pendiente ? 'Guardando…' : 'Guardar ingreso'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIngreso(null)}
                            className="text-sm underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{numero(g.uds)}</td>
                  <td>
                    {textoDestino(g.origen)} → {textoDestino(g.destino)}
                  </td>
                  <td>
                    <Pill estado={g.estado === 'ingresado' ? 'ok' : 'bajo'}>
                      {g.estado === 'ingresado' ? 'Ingresado' : 'Ordenado'}
                    </Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => setDetalle(detalle === g.folio ? null : g.folio)}
                    >
                      {detalle === g.folio ? 'Ocultar' : 'Detalle'}
                    </button>
                    {p.editable && g.estado === 'ordenado' ? (
                      <>
                        <button
                          type="button"
                          className="ml-3 text-sm font-semibold underline"
                          onClick={() =>
                            setIngreso({
                              folio: g.folio,
                              valores: Object.fromEntries(
                                g.items.map((i) => [i.id, String(Number(i.cantidad) || 0)]),
                              ),
                            })
                          }
                        >
                          Ingresar
                        </button>
                        <button
                          type="button"
                          className="ml-3 text-sm text-bad underline"
                          onClick={() => eliminar(g)}
                        >
                          Eliminar
                        </button>
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
