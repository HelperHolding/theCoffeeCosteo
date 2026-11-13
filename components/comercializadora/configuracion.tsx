'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import {
  CAMPOS_CONFIG,
  SECCIONES,
  difConfig,
  leerRuta,
  ponerRuta,
  validarCorreos,
  type CampoConfig,
  type Config,
} from '@/lib/comercializadora/config';
import { guardarConfig } from '@/app/(comercializadora)/comercializadora/acciones';
import type { HistorialFila } from '@/app/(comercializadora)/comercializadora/configuracion/page';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const txt = (v: unknown) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function Configuracion(p: {
  config: Config;
  version: number;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
  historial: HistorialFila[];
  credito: { vendor_id: string; nombre: string | null; dias_credito: number }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<Config>(p.config);
  const [correos, setCorreos] = useState((p.config.auto?.correos ?? []).join(', '));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const cambios = difConfig(p.config, borrador);
  const poner = (ruta: string, valor: unknown) => setBorrador((b) => ponerRuta(b, ruta, valor));

  const control = (c: CampoConfig) => {
    const v = leerRuta(borrador, c.ruta);
    const id = `cfg-${c.ruta}`;
    if (c.tipo === 'chk')
      return (
        <label key={c.ruta} className="flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            disabled={!p.editable}
            checked={v === true}
            onChange={(e) => poner(c.ruta, e.target.checked)}
          />{' '}
          {c.etiqueta}
        </label>
      );
    return (
      <label key={c.ruta} htmlFor={id} className="text-sm">
        {c.etiqueta}
        {c.tipo === 'sel' ? (
          <select
            id={id}
            disabled={!p.editable}
            className={claseCampo}
            value={String(v)}
            onChange={(e) =>
              poner(c.ruta, c.ruta === 'seg.servicio' ? Number(e.target.value) : e.target.value)
            }
          >
            {c.opciones.map(([val, et]) => (
              <option key={val} value={val}>
                {et}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type="number"
            disabled={!p.editable}
            min={c.min}
            max={c.max}
            step={c.entero ? 1 : 'any'}
            className={claseCampo}
            value={String(v ?? '')}
            onChange={(e) => poner(c.ruta, e.target.value === '' ? null : Number(e.target.value))}
          />
        )}
        {c.ayuda ? <span className="block text-xs text-muted-foreground">{c.ayuda}</span> : null}
      </label>
    );
  };

  const guardar = () =>
    iniciar(async () => {
      const v = validarCorreos(correos);
      if ('error' in v) return setMsg({ ok: false, t: v.error });
      const r = await guardarConfig(ponerRuta(borrador, 'auto.correos', v.correos), p.version);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({
        ok: true,
        t: `Guardado (${r.cambios} cambio(s)).${r.recalculo === false ? ' No se pudo recalcular ahora: entra en la corrida diaria.' : r.recalculo ? ' El cálculo ya se actualizó.' : ''}`,
      });
      router.refresh();
    });

  const eventos = (leerRuta(borrador, 'eventos') as Config[]) ?? [];
  const mes = (leerRuta(borrador, 'temp.mes') as number[]) ?? [];

  return (
    <div className="space-y-5">
      {!p.editable ? (
        <p className="placa px-4 py-3 text-sm">Tu acceso puede ver esta configuración pero no cambiarla.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Modo de las OCs automáticas: <b>{p.config.auto?.modo === 'real' ? 'Real' : 'Simulación'}</b> · se
        cambia en el cutover, no desde aquí.
        {p.actualizadoPor ? ` Última edición: ${p.actualizadoPor}.` : ''}
      </p>
      {SECCIONES.map((sec) => (
        <Tarjeta key={sec} titulo={sec}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS_CONFIG.filter((c) => c.seccion === sec).map(control)}
          </div>
          {sec === 'OCs automáticas' ? (
            <label className="mt-3 block text-sm">
              Correos que reciben el resumen (separados por coma)
              <input
                disabled={!p.editable}
                className={claseCampo}
                value={correos}
                onChange={(e) => setCorreos(e.target.value)}
              />
            </label>
          ) : null}
          {sec === 'Avanzado' ? (
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Factor de temporalidad por mes</legend>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                {MESES.map((m, i) => (
                  <label key={m} className="text-xs">
                    {m}
                    <input
                      type="number"
                      step="0.05"
                      min={0.1}
                      max={5}
                      disabled={!p.editable}
                      className={`${claseCampo} h-9`}
                      value={mes[i] ?? 1}
                      onChange={(e) =>
                        poner(
                          'temp.mes',
                          mes.map((x, j) => (j === i ? Number(e.target.value) : x)),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </Tarjeta>
      ))}
      <Tarjeta
        titulo="Activaciones"
        descripcion="Periodos con más (o menos) venta: el factor multiplica la demanda."
      >
        <div className="space-y-2">
          {eventos.map((ev, i) => (
            <div key={ev.id ?? i} className="flex flex-wrap items-end gap-2 text-sm">
              <label>
                Nombre
                <input
                  disabled={!p.editable}
                  maxLength={80}
                  className={`${claseCampo} max-w-48`}
                  value={ev.nombre ?? ''}
                  onChange={(e) =>
                    poner(
                      'eventos',
                      eventos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Desde
                <input
                  type="date"
                  disabled={!p.editable}
                  className={claseCampo}
                  value={ev.ini ?? ''}
                  onChange={(e) =>
                    poner(
                      'eventos',
                      eventos.map((x, j) => (j === i ? { ...x, ini: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  disabled={!p.editable}
                  className={claseCampo}
                  value={ev.fin ?? ''}
                  onChange={(e) =>
                    poner(
                      'eventos',
                      eventos.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                % de cambio
                <input
                  type="number"
                  disabled={!p.editable}
                  className={`${claseCampo} max-w-24`}
                  value={Math.round((Number(ev.factor ?? 1) - 1) * 100)}
                  onChange={(e) =>
                    poner(
                      'eventos',
                      eventos.map((x, j) =>
                        j === i
                          ? { ...x, factor: Math.min(10, Math.max(0.1, 1 + Number(e.target.value) / 100)) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  disabled={!p.editable}
                  checked={ev.activo !== false}
                  onChange={(e) =>
                    poner(
                      'eventos',
                      eventos.map((x, j) => (j === i ? { ...x, activo: e.target.checked } : x)),
                    )
                  }
                />{' '}
                Activa
              </label>
              {p.editable ? (
                <button
                  type="button"
                  aria-label="Quitar activación"
                  onClick={() =>
                    poner(
                      'eventos',
                      eventos.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {p.editable ? (
            <button
              type="button"
              onClick={() =>
                poner('eventos', [
                  ...eventos,
                  {
                    id: `ev${Date.now()}`,
                    nombre: '',
                    ini: '',
                    fin: '',
                    factor: 1.3,
                    alcance: 'todos',
                    valores: '',
                    activo: true,
                  },
                ])
              }
              className="inline-flex items-center gap-1 text-sm font-semibold underline"
            >
              <Plus size={14} aria-hidden="true" /> Agregar activación
            </button>
          ) : null}
        </div>
      </Tarjeta>
      <Tarjeta
        titulo="Días de crédito de proveedores"
        descripcion="Vienen de los términos de pago en Zoho y se editan allá."
      >
        {p.credito.length ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {p.credito.map((c) => (
              <li key={c.vendor_id}>
                {c.nombre ?? c.vendor_id}: <b>{c.dias_credito} días</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ningún proveedor tiene días de crédito en Zoho.</p>
        )}
      </Tarjeta>
      {p.editable ? (
        <div className="placa sticky bottom-3 flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-sm">
            {cambios.length ? `${cambios.length} cambio(s) sin guardar` : 'Sin cambios'}
          </span>
          <button
            type="button"
            disabled={pendiente || !cambios.length}
            onClick={guardar}
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
          >
            {pendiente ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            disabled={!cambios.length}
            onClick={() => {
              setBorrador(p.config);
              setCorreos((p.config.auto?.correos ?? []).join(', '));
            }}
            className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold"
          >
            Descartar
          </button>
          {msg ? (
            <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? '' : 'text-bad'}`}>
              {msg.t}
            </span>
          ) : null}
        </div>
      ) : null}
      <Tarjeta
        titulo="Historial"
        descripcion="Últimos 60 cambios. Revertir regresa el valor al borrador; guarda para aplicarlo."
        cuerpo={false}
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Quién</th>
                <th>Qué</th>
                <th>Antes</th>
                <th>Después</th>
                {p.editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {p.historial.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">
                    {new Date(h.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                  </td>
                  <td>{h.modificado_por ?? h.username ?? '—'}</td>
                  <td>
                    {h.ambito === 'config'
                      ? (CAMPOS_CONFIG.find((c) => c.ruta === h.clave)?.etiqueta ?? h.clave)
                      : `${h.ambito}: ${h.clave}`}
                  </td>
                  <td className="max-w-48 truncate">{txt(h.valor_anterior)}</td>
                  <td className="max-w-48 truncate">{txt(h.valor_nuevo)}</td>
                  {p.editable ? (
                    <td>
                      {h.ambito === 'config' && leerRuta(borrador, h.clave) !== undefined ? (
                        <button
                          type="button"
                          className="text-sm font-semibold underline"
                          onClick={() => poner(h.clave, h.valor_anterior)}
                        >
                          Revertir
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
